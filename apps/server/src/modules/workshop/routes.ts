import { Hono } from "hono";
import { storyPackageSchema } from "@festival/shared";
import type { FileStoryCatalog } from "../platform/stories/file-catalog";

type CatalogStory = ReturnType<FileStoryCatalog["list"]>[number];

function toCatalogItem(story: CatalogStory) {
  return {
    id: story.id,
    version: story.version,
    mode: story.mode,
    locale: story.locale,
    title: story.title,
    subtitle: story.subtitle,
    playerCount: story.playerCount,
    estimatedMinutes: story.estimatedMinutes,
  };
}

/** Public catalog and draft-validation endpoints for the workshop. */
export function createWorkshopRoutes(deps: { stories: FileStoryCatalog }) {
  const app = new Hono();

  app.get("/stories", (c) => {
    const query = c.req.query();
    const search = query.q?.trim().toLocaleLowerCase();
    const mode = query.mode;
    const locale = query.locale;
    const limit = query.limit === undefined ? 24 : Number(query.limit);
    const offset = query.offset === undefined ? 0 : Number(query.offset);

    if (search && search.length > 100)
      return c.json({ error: "검색어는 100자까지 입력할 수 있어." }, 400);
    if (mode && mode !== "solo" && mode !== "multiplayer")
      return c.json({ error: "mode 값은 solo 또는 multiplayer여야 해." }, 400);
    if (locale && !/^[a-z]{2}(?:-[A-Z]{2})?$/.test(locale))
      return c.json({ error: "locale 형식을 확인해 줘." }, 400);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      return c.json({ error: "limit은 1부터 100 사이여야 해." }, 400);
    if (!Number.isInteger(offset) || offset < 0 || offset > 1000000)
      return c.json({ error: "offset 값이 올바르지 않아." }, 400);

    const filtered = deps.stories.list()
      .map(toCatalogItem)
      .filter((story) => !mode || story.mode === mode)
      .filter((story) => !locale || story.locale === locale)
      .filter((story) =>
        !search ||
        story.title.toLocaleLowerCase().includes(search) ||
        story.subtitle.toLocaleLowerCase().includes(search),
      )
      .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));

    return c.json({
      items: filtered.slice(offset, offset + limit),
      total: filtered.length,
      limit,
      offset,
    });
  });

  app.get("/stories/:id", (c) => {
    const story = deps.stories.get(c.req.param("id"));
    if (!story) return c.json({ error: "작품을 찾을 수 없어." }, 404);
    return c.json({ item: toCatalogItem(story.story) });
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
