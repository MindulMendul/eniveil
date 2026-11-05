import { Hono } from "hono";
import { storyPackageSchema } from "@festival/shared";
import type { FileStoryCatalog } from "../platform/stories/file-catalog";

/** Workshop endpoints for browsing source metadata and validating draft packages. */
export function createWorkshopRoutes(deps: { stories: FileStoryCatalog }) {
  const app = new Hono();

  app.get("/stories", (c) => c.json(deps.stories.list()));
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
