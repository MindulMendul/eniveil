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
  startStorySessionSchema,
  inspectStoryEvidenceSchema,
  accuseStorySchema,
  rumVitalSchema,
  type Guest,
} from "@festival/shared";
import { Store } from "./store";
import { Game } from "./game";
import { storyCatalog } from "./modules/platform/stories/catalog";
import { fileStoryCatalog } from "./modules/platform/stories/file-catalog";
import { SQLiteStoryRunStore } from "./infrastructure/sqlite/story-run-store";
import { StorySessionService } from "./modules/platform/stories/session-service";
import type { WSContext } from "hono/ws";
const production = process.env.NODE_ENV === "production";
if (production && !process.env.APP_ORIGIN)
  throw Error("APP_ORIGIN is required in production");
export const store = new Store(
  process.env.DATABASE_PATH ?? "./data/festival.sqlite",
);
export const game = new Game(store, storyCatalog);
const storyRunStore = new SQLiteStoryRunStore(store.db);
const storySessions = new StorySessionService(fileStoryCatalog, storyRunStore);
const app = new Hono<{ Variables: { guest: Guest } }>();
const { upgradeWebSocket, websocket } = createBunWebSocket();
const sockets = new Map<WSContext, Guest>();
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
app.get("/api/stories", (c) =>
  c.json({
    items: fileStoryCatalog.list().map(({ story }) => ({
      id: story.id,
      version: story.version,
      mode: story.mode,
      locale: story.locale,
      title: story.title,
      subtitle: story.subtitle,
      playerCount: story.playerCount,
      estimatedMinutes: story.estimatedMinutes,
    })),
  }),
);
app.get("/api/stories/:id", (c) => {
  const story = fileStoryCatalog.get(c.req.param("id"));
  if (
    !story ||
    story.story.mode !== "solo" ||
    story.content.mechanics.type !== "solo-investigation"
  )
    return c.json({ error: "찾을 수 없는 스토리야." }, 404);
  storyRunStore.record({
    id: crypto.randomUUID(),
    runId: null,
    storyId: story.story.id,
    type: "story_impression",
    occurredAt: new Date().toISOString(),
    value: null,
    metadata: { version: story.story.version },
  });
  const { solution: _privateSolution, ...publicMechanics } = story.content.mechanics;
  return c.json({
    ...story,
    content: {
      ...story.content,
      scenes: story.content.scenes.filter((scene) => scene.id !== "resolution"),
      mechanics: publicMechanics,
    },
  });
});
app.post("/api/story-sessions", async (c) => {
  const { storyId } = startStorySessionSchema.parse(await c.req.json());
  const session = storySessions.start(storyId);
  storyRunStore.record({
    id: crypto.randomUUID(),
    runId: session.runId,
    storyId,
    type: "story_click",
    occurredAt: new Date().toISOString(),
    value: null,
    metadata: { version: session.story.version },
  });
  return c.json(session, 201);
});
app.post("/api/story-sessions/:id/advance", (c) =>
  c.json(storySessions.advance(c.req.param("id"))),
);
app.post("/api/story-sessions/:id/evidence", async (c) => {
  const { evidenceId } = inspectStoryEvidenceSchema.parse(await c.req.json());
  return c.json(storySessions.inspectEvidence(c.req.param("id"), evidenceId));
});
app.post("/api/story-sessions/:id/accuse", async (c) => {
  const { suspectId, evidenceIds } = accuseStorySchema.parse(await c.req.json());
  return c.json(storySessions.accuse(c.req.param("id"), suspectId, evidenceIds));
});
app.post("/api/story-sessions/:id/abandon", (c) => {
  storySessions.abandon(c.req.param("id"));
  return c.body(null, 204);
});
app.post("/api/story-sessions/:id/rating", async (c) => {
  const { rating } = await c.req.json();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    return c.json({ error: "평점은 1점부터 5점까지 입력해 줘." }, 400);
  return c.json(storySessions.rate(c.req.param("id"), rating));
});
app.post("/api/analytics/vitals", async (c) => {
  const vital = rumVitalSchema.parse(await c.req.json());
  const story = fileStoryCatalog.get(vital.storyId);
  if (!story || story.story.mode !== "solo")
    return c.json({ error: "측정할 스토리를 찾을 수 없어." }, 404);
  storyRunStore.recordVital({
    id: crypto.randomUUID(),
    storyId: vital.storyId,
    metricName: vital.metricName,
    value: vital.value,
    navigationId: vital.navigationId,
    route: vital.route,
    occurredAt: new Date().toISOString(),
  });
  return c.body(null, 202);
});
app.get("/api/admin/stories/:id/metrics", (c) => {
  const adminToken = process.env.STORY_ADMIN_TOKEN;
  if (!adminToken) return c.json({ error: "관리자 통계 API가 설정되지 않았어." }, 503);
  if (c.req.header("authorization") !== `Bearer ${adminToken}`)
    return c.json({ error: "관리자 인증이 필요해." }, 401);
  return c.json(storyRunStore.metrics(c.req.param("id")));
});
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
