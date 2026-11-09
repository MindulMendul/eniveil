import { Hono, type Context } from "hono";
import {
  accuseStorySchema,
  inspectStoryEvidenceSchema,
  startStorySessionSchema,
} from "@festival/shared";
import { StoryRunQuotaError, type SQLiteStoryRunStore } from "../../infrastructure/sqlite/story-run-store";
import type { StoryCatalog } from "../platform/stories/ports/story-catalog";
import { supportsSoloStory } from "./solo-story";
import type { StorySessionService } from "./story-session-service";

import type { PlayAnalytics } from "./play-analytics";

export function createGameRoutes(deps: {
  stories: StoryCatalog;
  runs: SQLiteStoryRunStore;
  sessions: StorySessionService;
  analytics?: PlayAnalytics;
  owner?: (c: Context) => string;
  roomId?: (owner:string,story:string) => string|null;
  rate?: (owner:string,id:string,rating:number)=>void;
}) {
  const app = new Hono();

  app.use("*", async (c, next) => { c.header("Cache-Control", "no-store"); await next(); });

  app.use("/sessions/:id/*", async (c,next) => {
    if (deps.analytics && deps.owner) deps.analytics.member(c.req.param('id')!,deps.owner(c));
    await next();
  });
  app.get("/sessions/:id", c => {
    const id=c.req.param('id');
    if (deps.analytics && deps.owner) {
      const view=deps.analytics.view(id,deps.owner(c));
      if (view.ended) return c.json(view);
    }
    return c.json(deps.sessions.current(id));
  });
  app.get("/stories/:id", (c) => {
    const story = deps.stories.get(c.req.param("id"));
    if (!story) return c.json({ error: "공개된 작품을 찾을 수 없어." }, 404);
    if (!supportsSoloStory(story)) return c.json({ error: "이 작품은 현재 1인 수사 엔진에서 지원하지 않는 진행 방식이야." }, 422);
    deps.runs.record({
      id: crypto.randomUUID(),
      runId: null,
      storyId: story.story.id,
      type: "story_impression",
      occurredAt: new Date().toISOString(),
      value: null,
      metadata: { version: story.story.version },
    });
    return c.json({ story: story.story });
  });

  app.post("/sessions", async (c) => {
    const { storyId } = startStorySessionSchema.parse(await c.req.json());
    let session;
    try {
      const start = () => {
        if(deps.analytics&&deps.owner) {
          const owner=deps.owner(c),active=deps.analytics.active(owner,storyId);
          if(active) {
            if(active.room_id===(deps.roomId?.(owner,storyId)??null))return deps.sessions.current(active.id);
            deps.sessions.abandon(active.id);deps.analytics.finish(active.id,'abandoned',null);
          }
        }
        const result=deps.sessions.start(storyId);
        if(deps.analytics && deps.owner) deps.analytics.start(result.runId,storyId,result.story.version,'solo',deps.roomId?.(deps.owner(c),storyId)??null,[{id:deps.owner(c),role:'detective'}],{story:result.package.story});
        return result;
      };
      session=deps.analytics?deps.analytics.atomic(start):start();
    }
    catch (error) {
      if (error instanceof StoryRunQuotaError) return c.json({ error: error.message }, 429);
      throw error;
    }
    deps.runs.record({
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
  app.post("/sessions/:id/advance", (c) => {
    const id=c.req.param('id');
    const advance=()=>{const result=deps.sessions.advance(id);if(deps.analytics&&deps.owner){const owner=deps.owner(c);deps.analytics.stage(id,owner,'cast');deps.analytics.record(id,owner,'scene_advanced','cast',result.scene.id);}return result;};
    return c.json(deps.analytics?deps.analytics.atomic(advance):advance());
  });
  app.post("/sessions/:id/evidence", async (c) => {
    const { evidenceId } = inspectStoryEvidenceSchema.parse(await c.req.json());
    const id=c.req.param('id');
    const inspect=()=>{const revisited=deps.runs.get(id)?.foundEvidenceIds.includes(evidenceId);const result=deps.sessions.inspectEvidence(id,evidenceId);if(deps.analytics&&deps.owner)deps.analytics.record(id,deps.owner(c),revisited?'evidence_revisited':'evidence_found','explore',evidenceId);return result;};
    return c.json(deps.analytics?deps.analytics.atomic(inspect):inspect());
  });
  app.post("/sessions/:id/accuse", async (c) => {
    const { suspectId, evidenceIds } = accuseStorySchema.parse(await c.req.json());
    const id=c.req.param('id');
    const finish=()=>{
      const result=deps.sessions.accuse(id,suspectId,evidenceIds);
      if(deps.analytics&&deps.owner)deps.analytics.record(id,deps.owner(c),'accusation','accuse',suspectId,{evidenceIds,correct:result.outcome==='success'});
      deps.analytics?.finish(id,result.outcome==='success'?'completed':'failed',result);
      return result;
    };
    return c.json(deps.analytics?deps.analytics.atomic(finish):finish());
  });
  app.post("/sessions/:id/abandon", (c) => {
    deps.sessions.abandon(c.req.param("id"));
    deps.analytics?.finish(c.req.param("id"),"abandoned",null);
    return c.body(null, 204);
  });
  app.post("/sessions/:id/rating", async (c) => {
    const { rating } = await c.req.json();
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      return c.json({ error: "평점은 1점부터 5점까지 입력해 줘." }, 400);
    if(deps.analytics && deps.owner) {
      if(deps.rate)deps.rate(deps.owner(c),c.req.param('id'),rating);else deps.analytics.rate(c.req.param('id'),deps.owner(c),rating);
      return c.json({saved:true});
    }
    return c.json(deps.sessions.rate(c.req.param("id"), rating));
  });

  return app;
}
