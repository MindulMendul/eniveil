import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { createBunWebSocket } from "hono/bun";
import { createRoomSchema, joinRoomSchema, commandSchema } from "@festival/shared";
import type { Guest } from "@festival/shared";
import type { WSContext } from "hono/ws";
import type { Store } from "../../store";
import type { Game } from "../game/game";
import type { ApiEnv } from "../http/env";

type TemporalAction = "start" | "event" | "end";

export function createLobbyRoutes(deps: {
  store: Store;
  game: Game;
  notifyTemporal: (action: TemporalAction, payload: object) => void;
}) {
  const app = new Hono<ApiEnv>();
  const { upgradeWebSocket, websocket } = createBunWebSocket();
  const sockets = new Map<WSContext, Guest>();
  const broadcast = () => {
    for (const [ws, guest] of sockets) {
      try {
        ws.send(JSON.stringify({ type: "snapshot", data: deps.game.snapshot(guest) }));
      } catch {
        /* close handler clears presence */
      }
    }
  };
  const authenticate = (c: Context<ApiEnv>) =>
    deps.store.authenticate(getCookie(c, "festival_guest"));

  app.use("*", async (c, next) => {
    const guest = authenticate(c);
    if (!guest) return c.json({ error: "게스트 로그인이 필요해." }, 401);
    c.set("guest", guest);
    c.header("Cache-Control", "no-store");
    await next();
  });
  app.get("/state", (c) => c.json(deps.game.snapshot(c.get("guest"))));
  app.post("/rooms", async (c) => {
    const { scenarioId } = createRoomSchema.parse(await c.req.json());
    const room = deps.game.create(c.get("guest"), scenarioId);
    broadcast();
    return c.json({ roomId: room.id }, 201);
  });
  app.post("/rooms/join", async (c) => {
    const { code } = joinRoomSchema.parse(await c.req.json());
    const room = deps.game.join(c.get("guest"), code);
    broadcast();
    return c.json({ roomId: room.id });
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
          sockets.set(ws, guest);
          deps.game.online.set(guest.id, (deps.game.online.get(guest.id) ?? 0) + 1);
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
            const room = deps.game.needRoom(guest.id);
            const previousSessionId = room.sessionId;
            deps.game.command(guest, command);
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
            deps.game.online.set(
              guest.id,
              Math.max(0, (deps.game.online.get(guest.id) ?? 1) - 1),
            );
            broadcast();
          }
        },
      };
    }),
  );
  setInterval(broadcast, 30000).unref();

  return { app, websocket, connectionCount: () => sockets.size };
}
