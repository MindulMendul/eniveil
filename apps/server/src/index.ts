import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { createBunWebSocket, serveStatic } from "hono/bun";
import { bodyLimit } from "hono/body-limit";
import { resolve } from "node:path";
import {
  commandSchema,
  guestSchema,
  createRoomSchema,
  joinRoomSchema,
  type Guest,
} from "@festival/shared";
import { Store } from "./store";
import { Game } from "./game";
import { metrics, observeHTTP } from "./observability";
import type { WSContext } from "hono/ws";
const production = process.env.NODE_ENV === "production";
if (production && !process.env.APP_ORIGIN)
  throw Error("APP_ORIGIN is required in production");
export const store = new Store(
  process.env.DATABASE_PATH ?? "./data/festival.sqlite",
);
export const game = new Game(store);
const app = new Hono<{ Variables: { guest: Guest } }>();
app.use("*", observeHTTP);
const { upgradeWebSocket, websocket } = createBunWebSocket();
const sockets = new Map<WSContext, Guest>();
app.get("/metrics", (c) => {
  const token = process.env.METRICS_BEARER_TOKEN;
  if (!token || c.req.header("authorization") !== `Bearer ${token}`)
    return c.text("Not found", 404);
  return c.text(metrics(sockets.size), 200, {
    "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
  });
});
const broadcast = () => {
  for (const [ws, guest] of sockets) {
    try {
      ws.send(JSON.stringify({ type: "snapshot", data: game.snapshot(guest) }));
    } catch {
      /* close handler clears presence */
    }
  }
};
const notifyTemporal = (action: "start" | "event" | "end", payload: object) => {
  const baseUrl = process.env.TEMPORAL_GATEWAY_URL;
  const token = process.env.TEMPORAL_GATEWAY_TOKEN;
  if (!baseUrl || !token) return;

  void fetch(new URL(`/internal/sessions/${action}`, baseUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(3000),
  }).then((response) => {
    if (!response.ok)
      console.error(`Temporal session notification failed: ${response.status}`);
  }).catch((error) => {
    console.error("Temporal session notification failed", error);
  });
};
setInterval(broadcast, 30000).unref();
const allowed = (origin: string, url: string) =>
  origin === (process.env.APP_ORIGIN ?? new URL(url).origin) ||
  (!production &&
    ["http://localhost:5173", "http://127.0.0.1:5173"].includes(origin));
app.use(
  "/api/*",
  bodyLimit({
    maxSize: 4096,
    onError: (c) => c.json({ error: "요청이 너무 커." }, 413),
  }),
);
app.use("*", async (c, next) => {
  if (
    (c.req.method !== "GET" && c.req.method !== "HEAD") ||
    c.req.path === "/ws"
  ) {
    const origin = c.req.header("origin");
    if (!origin || !allowed(origin, c.req.url))
      return c.json({ error: "허용되지 않은 요청 출처야." }, 403);
  }
  await next();
});
app.get("/api/health", (c) => c.json({ ok: true }));
const attempts = new Map<string, { count: number; until: number }>();
app.post("/api/guest", async (c) => {
  const ip = "global";
  const now = Date.now();
  let a = attempts.get(ip);
  if (!a || a.until < now) {
    a = { count: 0, until: now + 60000 };
    attempts.set(ip, a);
  }
  if (++a.count > 30) return c.json({ error: "잠시 후 다시 시도해 줘." }, 429);
  const existing = store.authenticate(getCookie(c, "festival_guest"));
  if (existing) return c.json({ me: existing });
  const { nickname } = guestSchema.parse(await c.req.json());
  const me = { id: crypto.randomUUID(), nickname };
  store.state.guests[me.id] = me;
  store.save();
  const token = store.issue(me.id);
  setCookie(c, "festival_guest", token, {
    httpOnly: true,
    secure: production,
    sameSite: "Lax",
    path: "/",
    maxAge: 30 * 86400,
  });
  return c.json({ me }, 201);
});
app.use("/api/*", async (c, next) => {
  const me = store.authenticate(getCookie(c, "festival_guest"));
  if (!me) return c.json({ error: "게스트 로그인이 필요해." }, 401);
  c.set("guest", me);
  c.header("Cache-Control", "no-store");
  await next();
});
app.get("/api/stories", (c) => {
  const query = c.req.query();
  const integer = (key: string, fallback: number, max: number) => {
    const raw = query[key];
    if (raw === undefined) return fallback;
    if (!/^\d+$/.test(raw)) throw Error(`Invalid ${key} parameter.`);
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 1 || value > max)
      throw Error(`${key} must be between 1 and ${max}.`);
    return value;
  };
  const origin = query.origin;
  if (origin && origin !== "original" && origin !== "demo")
    throw Error("origin must be original or demo.");
  const difficulty = query.difficulty;
  if (difficulty && !["easy", "normal", "hard", "unset"].includes(difficulty))
    throw Error("difficulty must be easy, normal, or hard.");
  const sort = query.sort ?? "latest";
  if (sort !== "latest" && sort !== "rating" && sort !== "popular")
    throw Error("sort must be latest, rating, or popular.");
  const search = query.search?.trim();
  if (search && search.length > 100) throw Error("search must be 100 characters or less.");

  return c.json(game.catalog({
    search,
    origin: origin as "original" | "demo" | undefined,
    difficulty: difficulty as "easy" | "normal" | "hard" | "unset" | undefined,
    players: query.players !== undefined ? integer("players", 1, 20) : undefined,
    sort,
    page: integer("page", 1, 100000),
    limit: integer("limit", 12, 50),
  }));
});
app.get("/api/state", (c) => c.json(game.snapshot(c.get("guest"))));
app.post("/api/rooms", async (c) => {
  const { scenarioId } = createRoomSchema.parse(await c.req.json());
  const r = game.create(c.get("guest"), scenarioId);
  broadcast();
  return c.json({ roomId: r.id }, 201);
});
app.post("/api/rooms/join", async (c) => {
  const { code } = joinRoomSchema.parse(await c.req.json());
  const r = game.join(c.get("guest"), code);
  broadcast();
  return c.json({ roomId: r.id });
});
app.get(
  "/ws",
  async (c, next) => {
    const me = store.authenticate(getCookie(c, "festival_guest"));
    if (!me) return c.json({ error: "로그인이 필요해." }, 401);
    c.set("guest", me);
    await next();
  },
  upgradeWebSocket((c) => {
    const me = c.get("guest");
    let connection: WSContext | undefined;
    let last = 0,
      count = 0;
    return {
      onOpen(_event, ws) {
        connection = ws;
        sockets.set(ws, me);
        game.online.set(me.id, (game.online.get(me.id) ?? 0) + 1);
        broadcast();
      },
      onMessage(event, ws) {
        let requestId: string | undefined;
        try {
          if (!store.authenticate(getCookie(c, "festival_guest"))) {
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
          const room = game.needRoom(me.id);
          const previousSessionId = room.sessionId;
          game.command(me, command);
          const sessionId = room.sessionId ?? previousSessionId;
          if (command.type === "start" && sessionId) {
            notifyTemporal("start", { sessionId });
          } else if (command.type === "return" && previousSessionId) {
            notifyTemporal("end", { sessionId: previousSessionId });
          } else if (
            (command.type === "advance" || command.type === "vote") &&
            sessionId
          ) {
            const session = game.state.sessions[sessionId];
            if (session)
              notifyTemporal("event", {
                sessionId,
                phase: session.phase,
              });
          }
          broadcast();
          ws.send(JSON.stringify({ type: "ack", requestId }));
        } catch (error) {
          ws.send(
            JSON.stringify({
              type: "error",
              requestId,
              message:
                error instanceof Error && error.name !== "ZodError"
                  ? error.message
                  : "요청 내용을 확인해 줘.",
            }),
          );
        }
      },
      onClose(_event, ws) {
        if (connection && sockets.delete(connection)) {
          game.online.set(
            me.id,
            Math.max(0, (game.online.get(me.id) ?? 1) - 1),
          );
          broadcast();
        }
      },
    };
  }),
);
app.onError((error, c) =>
  c.json(
    {
      error:
        error.name === "ZodError" || error instanceof SyntaxError
          ? "입력 내용을 확인해 줘."
          : error.message,
    },
    400,
  ),
);
app.notFound((c) => c.json({ error: "찾을 수 없는 경로야." }, 404));
const webRoot = resolve(import.meta.dir, "../../web/dist");
app.use("*", serveStatic({ root: webRoot }));
app.get("*", async (c) => {
  if (c.req.path.startsWith("/api/") || c.req.path === "/ws")
    return c.json({ error: "찾을 수 없는 경로야." }, 404);
  const file = Bun.file(resolve(webRoot, "index.html"));
  return (await file.exists())
    ? c.html(await file.text())
    : c.text("Run bun run build first.", 503);
});
export default {
  port: Number(process.env.PORT ?? 3000),
  hostname: process.env.HOST ?? "127.0.0.1",
  fetch: app.fetch,
  websocket,
};
