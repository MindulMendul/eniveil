import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { createBunWebSocket } from "hono/bun";
import { createRoomSchema, joinRoomSchema, commandSchema, soloRoomExitSchema } from "@festival/shared";
import type { Guest } from "@festival/shared";
import type { WSContext } from "hono/ws";
import type { Store } from "../../store";
import type { Game } from "../game/game";
import type { ApiEnv } from "../http/env";

import { socialRoutes } from "./social";
import { ReconnectGrace } from "./reconnect-grace";
import { notifySessionExpiry } from "./session-expiry";

type TemporalAction = "start" | "event" | "end";

export function createLobbyRoutes(deps: {
  store: Store;
  game: Game;
  notifyTemporal: (action: TemporalAction, payload: object) => void;
}) {
  const app = new Hono<ApiEnv>();
  const { upgradeWebSocket, websocket } = createBunWebSocket();
  const sockets = new Map<WSContext, { guest: Guest; expires: number; lobby: boolean }>();
  const broadcast = () => {
    for (const [ws, { guest, expires }] of sockets) {
      if (expires <= Date.now()) { ws.close(1008, "Expired"); continue; }
      try {
        ws.send(JSON.stringify({ type: "snapshot", data: deps.game.snapshot(guest) }));
      } catch {
        /* close handler clears presence */
      }
    }
  };
  const socialDirty = new Set<string>();
  let socialTimer: ReturnType<typeof setTimeout> | undefined;
  const socialChanged = (ids: string[]) => {
    for (const id of ids) socialDirty.add(id);
    if (socialTimer) return;
    socialTimer = setTimeout(() => {
      socialTimer = undefined;
      const targets = new Set(socialDirty);
      socialDirty.clear();
      for (const [ws, entry] of sockets) if (targets.has(entry.guest.id) && entry.expires > Date.now()) {
        try { ws.send(JSON.stringify({ type: "social-changed" })); } catch { /* close clears presence */ }
      }
    }, 100);
    socialTimer.unref();
  };
  const availabilityChanged = (id: string) => socialChanged([id, ...deps.store.friendIds(id)]);
  const presence = new ReconnectGrace(deps.game, (transition) => {
    notifySessionExpiry(transition, deps.notifyTemporal);
    broadcast();
  });
  const authenticate = (c: Context<ApiEnv>) =>
    deps.store.authenticate(getCookie(c, "festival_guest"));

  app.use("*", async (c, next) => {
    const guest = authenticate(c);
    if (!guest) return c.json({ error: "게스트 로그인이 필요해." }, 401);
    c.set("guest", guest);
    c.header("Cache-Control", "no-store");
    await next();
  });
  const pinAttempts = new Map<string, { count: number; until: number }>();
  app.use("*", async (c, next) => {
    if (c.req.method !== "POST" || !(c.req.path.endsWith("/rooms/join") || c.req.path.endsWith("/respond"))) return next();
    const now = Date.now();
    for (const [id, value] of pinAttempts) if (value.until <= now) pinAttempts.delete(id);
    const id = c.get("guest").id;
    const bucket = pinAttempts.get(id) ?? { count: 0, until: now + 60000 };
    if (pinAttempts.size >= 4096 && !pinAttempts.has(id)) return c.json({ error: "잠시 후 다시 시도해 줘." }, 429);
    pinAttempts.set(id, bucket);
    if (++bucket.count > 20) { c.header("Retry-After", "60"); return c.json({ error: "잠시 후 다시 시도해 줘." }, 429); }
    await next();
  });
  app.route("/", socialRoutes(deps.store, deps.game, broadcast, id => [...sockets.values()].some(entry => entry.guest.id === id && entry.lobby && entry.expires > Date.now()), socialChanged));
  app.get("/stories", (c) => {
    const query = c.req.query();
    const integer = (key: string, fallback: number, min: number, max: number) => {
      const raw = query[key];
      if (raw === undefined) return fallback;
      if (!/^\d+$/.test(raw)) throw Error(`Invalid ${key} parameter.`);
      const value = Number(raw);
      if (!Number.isSafeInteger(value) || value < min || value > max)
        throw Error(`${key} must be between ${min} and ${max}.`);
      return value;
    };
    const origin = query.origin;
    if (origin && origin !== "original" && origin !== "demo")
      throw Error("origin must be original or demo.");
    const difficulty = query.difficulty;
    if (difficulty && !["easy", "normal", "hard", "unset"].includes(difficulty))
      throw Error("difficulty must be easy, normal, hard, or unset.");
    const sort = query.sort ?? "latest";
    if (sort !== "latest" && sort !== "rating" && sort !== "popular")
      throw Error("sort must be latest, rating, or popular.");
    if (query.q && query.q.length > 100)
      throw Error("q must be 100 characters or less.");

    return c.json(deps.game.catalog({
      q: query.q,
      origin: origin as "original" | "demo" | undefined,
      difficulty: difficulty as "easy" | "normal" | "hard" | "unset" | undefined,
      players: query.players !== undefined
        ? integer("players", 1, 1, 20)
        : undefined,
      sort,
      limit: integer("limit", 12, 1, 100),
      offset: integer("offset", 0, 0, 1000000),
    }));
  });
  app.get("/state", (c) => c.json(deps.game.snapshot(c.get("guest"))));
  app.post("/rooms", async (c) => {
    const { scenarioId, access, pin } = createRoomSchema.parse(await c.req.json());
    const room = deps.game.create(c.get("guest"), scenarioId, access, pin);
    availabilityChanged(c.get("guest").id);
    broadcast();
    return c.json({ roomId: room.id }, 201);
  });
  app.post("/rooms/join", async (c) => {
    const { code, pin } = joinRoomSchema.parse(await c.req.json());
    const room = deps.game.join(c.get("guest"), code, pin);
    availabilityChanged(c.get("guest").id);
    broadcast();
    return c.json({ roomId: room.id });
  });
  app.post("/rooms/solo-exit", async (c) => {
    const { roomId, soloPlayId } = soloRoomExitSchema.parse(await c.req.json());
    deps.game.endSolo(c.get("guest"), roomId, soloPlayId);
    broadcast();
    return c.json({ ok: true });
  });
  app.get(
    "/ws",
    async (c, next) => {
      const guest = authenticate(c);
      if (!guest) return c.json({ error: "로그인이 필요해." }, 401);
      c.set("guest", guest);
      await next();
    },
    upgradeWebSocket((c) => {
      const guest = c.get("guest");
      let connection: WSContext | undefined;
      let last = 0;
      let count = 0;
      return {
        onOpen(_event, ws) {
          connection = ws;
          sockets.set(ws, { guest, lobby: false, expires: deps.store.sessionExpiry(getCookie(c, "festival_guest")) });
          presence.connect(guest.id);
          availabilityChanged(guest.id);
          broadcast();
        },
        onMessage(event, ws) {
          let requestId: string | undefined;
          try {
            if (!authenticate(c)) {
              ws.close(1008, "Expired");
              return;
            }
            const now = Date.now();
            if (now - last > 1000) {
              last = now;
              count = 0;
            }
            if (++count > 20) throw Error("요청이 너무 빨라. 잠시 기다려 줘.");
            if (typeof event.data !== "string" || event.data.length > 4096)
              throw Error("올바르지 않은 메시지야.");
            const command = commandSchema.parse(JSON.parse(event.data));
            requestId = command.requestId;
            if (command.type === "presence") {
              const entry = connection ? sockets.get(connection) : undefined;
              if (!entry || entry.lobby === command.lobby) return;
              entry.lobby = command.lobby;
              availabilityChanged(guest.id);
              return;
            }
            const room = deps.game.needRoom(guest.id);
            const previousSessionId = room.sessionId;
            deps.game.command(guest, command);
            if (["start", "return", "leave", "solo-return", "mode"].includes(command.type)) availabilityChanged(guest.id);
            const sessionId = room.sessionId ?? previousSessionId;
            if (command.type === "start" && sessionId) {
              deps.notifyTemporal("start", { sessionId });
            } else if (command.type === "return" && previousSessionId) {
              deps.notifyTemporal("end", { sessionId: previousSessionId });
            } else if (
              (command.type === "advance" || command.type === "vote") &&
              sessionId
            ) {
              const session = deps.game.state.sessions[sessionId];
              if (session)
                deps.notifyTemporal("event", { sessionId, phase: session.phase });
            }
            broadcast();
            ws.send(JSON.stringify({ type: "ack", requestId }));
          } catch (error) {
            ws.send(JSON.stringify({
              type: "error",
              requestId,
              message:
                error instanceof Error && error.name !== "ZodError"
                  ? error.message
                  : "요청 내용을 확인해 줘.",
            }));
          }
        },
        onClose(_event, ws) {
          if (connection && sockets.delete(connection)) {
            presence.disconnect(guest.id);
            availabilityChanged(guest.id);
            broadcast();
          }
        },
      };
    }),
  );
  setInterval(broadcast, 30000).unref();

  const disconnect = (guestId: string) => {
    for (const [ws, entry] of sockets) if (entry.guest.id === guestId) {
      entry.expires = 0;
      ws.close(1008, "Signed out");
    }
  };
  return { app, websocket, disconnect, connectionCount: () => sockets.size };
}
