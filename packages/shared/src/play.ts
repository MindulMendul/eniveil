import { z } from "zod";
export const playEventSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid().optional(),
  clientAt: z.number().int().nonnegative().optional(),
  sceneId: z.enum(["opening", "resolution"]).optional(),
  sequence: z.number().int().min(0).max(2147483647),
  type: z.enum([
    "stage",
    "location",
    "inspect",
    "question",
    "evidence_present",
    "suspect",
    "evidence_select",
    "hint",
    "cue_next",
    "cue_skip",
    "cue_complete",
    "visibility",
    "heartbeat",
    "exit",
    "error",
  ]),
  stage: z.enum([
    "intro",
    "cast",
    "explore",
    "alibi",
    "cross",
    "accuse",
    "win",
    "fail",
    "rating",
    "briefing",
    "first_investigation",
    "meeting",
    "second_investigation",
    "final_choice",
    "reveal",
  ]),
  target: z.string().max(100).optional(),
  visible: z.boolean().optional(),
});
export const playEventBatchSchema = z.object({
  events: z.array(playEventSchema).max(50),
});
export const playRatingSchema = z.object({
  rating: z.number().int().min(1).max(5).nullable(),
});
export const playReviewSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  spoiler: z.boolean().default(false),
});
export const playReviewReportSchema = z.object({
  reason: z.enum(["spoiler", "abuse", "personal_info", "copyright", "other"]),
});
export const playChatSchema = z.object({
  id: z.uuid(),
  text: z.string().trim().min(1).max(1000),
});
export type PlayEvent = z.infer<typeof playEventSchema>;
export const playEndingSchema = z.object({
  action: z.enum(["completed", "skipped"]),
});
