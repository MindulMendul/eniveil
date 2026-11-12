import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  playEventBatchSchema,
  playEndingSchema,
  playRatingSchema,
  playChatSchema,
  playReviewSchema,
} from "@festival/shared";
import type { Store } from "../../store";
import type { PlayAnalytics } from "./play-analytics";
import type { Game } from "./game";
export function playOwner(c: Context, store: Store, production: boolean) {
  const cached = c.get("playOwner") as string | undefined;
  if (cached) return cached;
  const guest = store.authenticate(getCookie(c, "festival_guest"));
  if (guest) {
    c.set("playOwner", guest.id);
    return guest.id;
  }
  let token = getCookie(c, "festival_play");
  if (!token || !/^[a-f0-9-]{36}$/.test(token)) {
    token = crypto.randomUUID();
    setCookie(c, "festival_play", token, {
      httpOnly: true,
      secure: production,
      sameSite: "Lax",
      path: "/",
      maxAge: 365 * 86400,
    });
  }
  const owner = "anonymous:" + createHash("sha256").update(token).digest("hex");
  c.set("playOwner", owner);
  return owner;
}
export function createPlayRoutes(deps: {
  analytics: PlayAnalytics;
  store: Store;
  game: Game;
  production: boolean;
  adminToken?: string;
  notify?: () => void;
}) {
  const expected = deps.adminToken
    ? createHash("sha256").update(`Bearer ${deps.adminToken}`).digest()
    : null;
  const isAdmin = (c: Context) =>
    expected !== null &&
    timingSafeEqual(
      expected,
      createHash("sha256")
        .update(c.req.header("authorization") ?? "")
        .digest(),
    );
  const app = new Hono<{ Variables: { owner: string } }>();
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.set("owner", playOwner(c, deps.store, deps.production));
    await next();
  });
  app.get("/sessions/:id", (c) =>
    c.json(deps.analytics.view(c.req.param("id"), c.get("owner"))),
  );
  app.post("/sessions/:id/events", async (c) => {
    const { events } = playEventBatchSchema.parse(await c.req.json());
    deps.analytics.events(c.req.param("id"), c.get("owner"), events);
    return c.json({ saved: true });
  });
  app.post("/sessions/:id/ending", async (c) => {
    const { action } = playEndingSchema.parse(await c.req.json());
    deps.analytics.ending(c.req.param("id"), c.get("owner"), action);
    return c.json({ saved: true });
  });
  app.post("/sessions/:id/rating", async (c) => {
    const { rating } = playRatingSchema.parse(await c.req.json());
    const id = c.req.param("id"),
      user = c.get("owner");
    deps.game.completeRating(user, id, rating);
    deps.notify?.();
    return c.json({ saved: true });
  });
  app.post("/sessions/:id/review", async (c) => {
    const { text } = playReviewSchema.parse(await c.req.json());
    deps.analytics.review(c.req.param("id"), c.get("owner"), text);
    return c.json({ saved: true });
  });
  app.get("/stories/:id/reviews", (c) => c.json({ items: deps.analytics.reviews(c.req.param("id")) }));
  app.get("/sessions/:id/chat", (c) =>
    c.json({
      messages: deps.analytics.chats(c.req.param("id"), c.get("owner")),
    }),
  );
  app.post("/sessions/:id/chat", async (c) => {
    const { id, text } = playChatSchema.parse(await c.req.json());
    const sessionId = c.req.param("id"),
      user = c.get("owner");
    if (!deps.game.canChat(user, sessionId))
      throw new Error("현재 단계에서는 채팅할 수 없어.");
    deps.analytics.chat(
      sessionId,
      user,
      id,
      text,
      deps.game.state.sessions[sessionId]?.phase ?? "meeting",
    );
    return c.json({ saved: true });
  });
  app.get("/admin/stories/:id", (c) => {
    if (!isAdmin(c)) return c.json({ error: "관리자 인증이 필요해." }, 401);
    const raw = c.req.query("version");
    if (raw !== undefined && !/^[1-9]\d{0,8}$/.test(raw))
      throw new Error("버전을 확인해 줘.");
    return c.json(
      deps.analytics.report(c.req.param("id"), raw ? Number(raw) : undefined),
    );
  });
  app.get("/admin/sessions/:id", (c) => {
    if (!isAdmin(c)) return c.json({ error: "관리자 인증이 필요해." }, 401);
    const id = c.req.param("id"),
      raw = c.req.query("after") ?? "0";
    if (!/^\d{1,15}$/.test(raw)) throw new Error("조회 위치를 확인해 줘.");
    return c.json({
      session: deps.analytics.play(id),
      members: deps.analytics.members(id),
      observedVisits: deps.analytics.db
        .query("SELECT * FROM play_ui_visits WHERE session_id=? ORDER BY id")
        .all(id),
      visits: deps.analytics.db
        .query("SELECT * FROM play_visits WHERE session_id=? ORDER BY id")
        .all(id),
      events: deps.analytics.db
        .query(
          "SELECT * FROM play_events WHERE session_id=? AND sequence>? ORDER BY sequence LIMIT 500",
        )
        .all(id, Number(raw)),
    });
  });
  return app;
}
