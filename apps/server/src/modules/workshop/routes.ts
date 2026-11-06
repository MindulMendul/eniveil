import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { storyPackageSchema, type Guest } from "@festival/shared";
import type { Store } from "../../store";
import type { SQLiteStoryRunStore } from "../../infrastructure/sqlite/story-run-store";
import type { SQLiteWorkshopStore } from "../../infrastructure/sqlite/workshop-store";
import type { FileStoryCatalog } from "../platform/stories/file-catalog";
import type { WorkshopDraftInput, WorkshopItem, WorkshopStory } from "./model";

const notFound = "작품을 찾을 수 없어.";
const loginRequired = "게스트 로그인이 필요해.";
const difficulties = ["easy", "normal", "hard", "unset"];
const sorts = ["latest", "rating", "plays", "favorites", "title"];

function integer(query: Record<string, string>, key: string, fallback: number, min: number, max: number) {
  const raw = query[key];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`${key} 값은 ${min}부터 ${max} 사이의 정수여야 해.`);
  return value;
}

function parseQuery(query: Record<string, string>) {
  for (const key of ["q", "author"])
    if ((query[key]?.length ?? 0) > 100) throw new Error(`${key}는 100자까지 입력할 수 있어.`);
  const view = query.view ?? "all";
  const sort = query.sort ?? "latest";
  if (!["all", "favorites", "mine"].includes(view)) throw new Error("목록 종류를 확인해 줘.");
  if (!sorts.includes(sort)) throw new Error("정렬 방식을 확인해 줘.");
  if (query.difficulty && !difficulties.includes(query.difficulty)) throw new Error("난이도를 확인해 줘.");
  if (query.mode && !["solo", "multiplayer"].includes(query.mode)) throw new Error("게임 모드를 확인해 줘.");
  if (query.locale && !/^[a-z]{2}(?:-[A-Z]{2})?$/.test(query.locale)) throw new Error("언어 형식을 확인해 줘.");
  if (query.publishedAfter && (
    !/^\d{4}-\d{2}-\d{2}$/.test(query.publishedAfter) ||
    !Number.isFinite(Date.parse(query.publishedAfter)) ||
    new Date(query.publishedAfter).toISOString().slice(0, 10) !== query.publishedAfter
  )) throw new Error("공개일은 YYYY-MM-DD 형식으로 입력해 줘.");
  return {
    view,
    sort,
    mode: query.mode,
    locale: query.locale,
    difficulty: query.difficulty,
    publishedAfter: query.publishedAfter,
    q: query.q?.trim().toLocaleLowerCase(),
    author: query.author?.trim().toLocaleLowerCase(),
    ratingMin: integer(query, "ratingMin", 0, 1, 5),
    playsMin: integer(query, "playsMin", 0, 0, Number.MAX_SAFE_INTEGER),
    favoritesMin: integer(query, "favoritesMin", 0, 0, Number.MAX_SAFE_INTEGER),
    limit: integer(query, "limit", 24, 1, 100),
    offset: integer(query, "offset", 0, 0, 1000000),
  };
}

function safeThumbnail(value: unknown): value is string | null | undefined {
  if (value === null || value === undefined) return true;
  if (typeof value !== "string" || value.length > 2048 || /[\\\u0000-\u001f\u007f]/.test(value)) return false;
  if (/^\/(?!\/)/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function parseDraft(value: unknown):
  | { success: true; draft: WorkshopDraftInput }
  | { success: false; status: 400 | 422; error: string; issues?: { path: string; message: string }[] } {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { success: false, status: 400, error: "저장할 작품을 확인해 줘." };
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["package", "thumbnailUrl", "difficulty", "published"].includes(key)))
    return { success: false, status: 400, error: "허용되지 않은 작품 정보야." };
  if (!safeThumbnail(input.thumbnailUrl))
    return { success: false, status: 400, error: "썸네일은 HTTPS 주소나 사이트 안의 경로로 입력해 줘." };
  if (input.difficulty !== undefined && input.difficulty !== null && (
    typeof input.difficulty !== "string" || !["easy", "normal", "hard"].includes(input.difficulty)
  ))
    return { success: false, status: 400, error: "난이도를 확인해 줘." };
  if (input.published !== undefined && typeof input.published !== "boolean")
    return { success: false, status: 400, error: "공개 여부를 확인해 줘." };
  const result = storyPackageSchema.safeParse(input.package);
  if (!result.success) {
    return {
      success: false,
      status: 422,
      error: ".mstory 파일 내용을 확인해 줘.",
      issues: result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    };
  }
  return {
    success: true,
    draft: {
      package: result.data,
      thumbnailUrl: input.thumbnailUrl ?? null,
      difficulty: (input.difficulty ?? null) as WorkshopDraftInput["difficulty"],
      published: input.published === true,
    },
  };
}

function compareStories(sort: string, a: WorkshopItem, b: WorkshopItem) {
  let difference = 0;
  if (sort === "rating") difference = (b.averageRating ?? -1) - (a.averageRating ?? -1);
  if (sort === "plays") difference = b.playCount - a.playCount;
  if (sort === "favorites") difference = b.favoriteCount - a.favoriteCount;
  if (sort === "title") difference = a.title.localeCompare(b.title);
  if (difference) return difference;
  const date = (item: WorkshopItem) => item.publishedAt ?? (item.published ? "" : item.updatedAt);
  return date(b).localeCompare(date(a)) || b.version - a.version || a.id.localeCompare(b.id);
}

/** Public metadata catalog with authenticated favorites and owner-only source packages. */
export function createWorkshopRoutes(deps: {
  stories: FileStoryCatalog;
  store: Store;
  workshop: SQLiteWorkshopStore;
  runs: SQLiteStoryRunStore;
}) {
  const app = new Hono();
  const authenticate = (c: Parameters<typeof getCookie>[0]) =>
    deps.store.authenticate(getCookie(c, "festival_guest"));

  app.use("*", async (c, next) => {
    // The same URL contains user-specific edit/favorite flags when a cookie is present.
    c.header("Cache-Control", "no-store");
    await next();
  });

  function catalog(guest: Guest | null): WorkshopItem[] {
    const latest = new Map<string, ReturnType<FileStoryCatalog["list"]>[number]>();
    for (const story of deps.stories.list()) {
      if ((latest.get(story.id)?.version ?? 0) < story.version) latest.set(story.id, story);
    }
    const files: WorkshopStory[] = [...latest.values()].map((story) => ({
      id: story.id,
      story,
      author: { id: null, name: "Murder Parker" },
      thumbnailUrl: null,
      difficulty: null,
      published: true,
      publishedAt: null,
      updatedAt: new Date(0).toISOString(),
    }));
    const favorites = deps.workshop.favorites(guest?.id);
    const metrics = deps.runs.catalogMetrics();
    return [...files, ...deps.workshop.list(guest?.id)].map((entry) => {
      const story = entry.story;
      const favorite = favorites.get(entry.id);
      return {
        id: entry.id,
        version: story.version,
        mode: story.mode,
        locale: story.locale,
        title: story.title,
        subtitle: story.subtitle,
        playerCount: story.playerCount,
        estimatedMinutes: story.estimatedMinutes,
        author: entry.author,
        thumbnailUrl: entry.thumbnailUrl,
        difficulty: entry.difficulty,
        published: entry.published,
        publishedAt: entry.publishedAt,
        updatedAt: entry.updatedAt,
        ...(metrics.get(entry.id) ?? { averageRating: null, ratingCount: 0, playCount: 0 }),
        favoriteCount: favorite?.count ?? 0,
        isFavorite: favorite?.selected ?? false,
        canEdit: !!guest && entry.author.id === guest.id,
      };
    });
  }

  app.get("/stories", (c) => {
    let query: ReturnType<typeof parseQuery>;
    try {
      query = parseQuery(c.req.query());
    } catch (error) {
      return c.json({ error: (error as Error).message }, 400);
    }
    const guest = authenticate(c);
    if (query.view !== "all" && !guest) return c.json({ error: loginRequired }, 401);
    const filtered = catalog(guest)
      .filter((story) => query.view === "mine" ? story.canEdit : story.published)
      .filter((story) => query.view !== "favorites" || story.isFavorite)
      .filter((story) => !query.mode || story.mode === query.mode)
      .filter((story) => !query.locale || story.locale === query.locale)
      .filter((story) => !query.publishedAfter || (!!story.publishedAt && story.publishedAt >= query.publishedAfter))
      .filter((story) => !query.difficulty || (story.difficulty ?? "unset") === query.difficulty)
      .filter((story) => !query.q || `${story.title}\n${story.subtitle}`.toLocaleLowerCase().includes(query.q))
      .filter((story) => !query.author || story.author.name.toLocaleLowerCase().includes(query.author))
      .filter((story) => !query.ratingMin || (story.averageRating ?? 0) >= query.ratingMin)
      .filter((story) => story.playCount >= query.playsMin && story.favoriteCount >= query.favoritesMin)
      .sort((a, b) => compareStories(query.sort, a, b));
    return c.json({
      items: filtered.slice(query.offset, query.offset + query.limit),
      total: filtered.length,
      limit: query.limit,
      offset: query.offset,
    });
  });

  app.get("/stories/:id", (c) => {
    const item = catalog(authenticate(c)).find((story) => story.id === c.req.param("id"));
    return item ? c.json({ item }) : c.json({ error: notFound }, 404);
  });

  app.put("/stories/:id/favorite", (c) => {
    const guest = authenticate(c);
    if (!guest) return c.json({ error: loginRequired }, 401);
    const item = catalog(guest).find((story) => story.id === c.req.param("id") && story.published);
    if (!item) return c.json({ error: notFound }, 404);
    deps.workshop.favorite(item.id, guest.id, true);
    return c.json({ item: catalog(guest).find((story) => story.id === item.id)! });
  });

  app.delete("/stories/:id/favorite", (c) => {
    const guest = authenticate(c);
    if (!guest) return c.json({ error: loginRequired }, 401);
    const item = catalog(guest).find((story) => story.id === c.req.param("id"));
    if (!item) return c.json({ error: notFound }, 404);
    deps.workshop.favorite(item.id, guest.id, false);
    return c.json({ item: catalog(guest).find((story) => story.id === item.id)! });
  });

  app.get("/drafts/:id", (c) => {
    const guest = authenticate(c);
    if (!guest) return c.json({ error: loginRequired }, 401);
    const source = deps.workshop.source(c.req.param("id"), guest.id);
    if (!source) return c.json({ error: notFound }, 404);
    const item = catalog(guest).find((story) => story.id === c.req.param("id"))!;
    return c.json({ item, package: source });
  });

  app.post("/drafts", async (c) => {
    const guest = authenticate(c);
    if (!guest) return c.json({ error: loginRequired }, 401);
    const result = parseDraft(await c.req.json());
    if (!result.success) return c.json({ error: result.error, issues: result.issues }, result.status);
    const saved = deps.workshop.create(guest, result.draft);
    return c.json({ item: catalog(guest).find((story) => story.id === saved.id)! }, 201);
  });

  app.put("/drafts/:id", async (c) => {
    const guest = authenticate(c);
    if (!guest) return c.json({ error: loginRequired }, 401);
    const id = c.req.param("id");
    if (deps.workshop.get(id)?.author.id !== guest.id) return c.json({ error: notFound }, 404);
    const result = parseDraft(await c.req.json());
    if (!result.success) return c.json({ error: result.error, issues: result.issues }, result.status);
    const saved = deps.workshop.update(id, guest, result.draft);
    if (!saved) return c.json({ error: notFound }, 404);
    return c.json({ item: catalog(guest).find((story) => story.id === saved.id)! });
  });

  app.post("/stories/validate", async (c) => {
    const result = storyPackageSchema.safeParse(await c.req.json());
    if (!result.success) {
      return c.json({
        valid: false,
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      }, 422);
    }
    return c.json({
      valid: true,
      story: {
        id: result.data.story.id,
        version: result.data.story.version,
        mode: result.data.story.mode,
      },
    });
  });

  return app;
}
