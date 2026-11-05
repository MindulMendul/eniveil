import { z } from "zod";
export const nicknameSchema = z
  .string()
  .trim()
  .min(1, "이름을 입력해 줘.")
  .max(20, "이름은 20자까지 가능해.");
export const guestSchema = z.object({ nickname: nicknameSchema });
export const createRoomSchema = z.object({
  scenarioId: z.string().min(1).max(80),
});
export const joinRoomSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6}$/, "6자리 초대 코드를 확인해 줘."),
});
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start"), requestId: z.string().max(80) }),
  z.object({ type: z.literal("advance"), requestId: z.string().max(80) }),
  z.object({
    type: z.literal("vote"),
    targetId: z.string().max(80),
    requestId: z.string().max(80),
  }),
  z.object({ type: z.literal("return"), requestId: z.string().max(80) }),
  z.object({ type: z.literal("leave"), requestId: z.string().max(80) }),
]);
export type Command = z.infer<typeof commandSchema>;
export type Guest = { id: string; nickname: string };
export type Scenario = {
  id: string;
  version: number;
  title: string;
  subtitle: string;
  players: number;
  minutes: number;
  available: boolean;
  kind: "original" | "demo";
  difficulty?: "easy" | "normal" | "hard" | null;
};
export type RoomSummary = {
  id: string;
  code: string;
  title: string;
  count: number;
  capacity: number;
  status: "waiting" | "playing";
};
export type Member = Guest & { online: boolean };
export type SessionView = {
  id: string;
  scenarioVersion: number;
  phase: "briefing" | "discussion" | "voting" | "reveal";
  role: { name: string; secret: string };
  clues: string[];
  voteCount: number;
  hasVoted: boolean;
  result: null | { answer: string; votes: { voter: string; target: string }[] };
};
export type RoomView = RoomSummary & {
  hostId: string;
  members: Member[];
  scenario: Scenario;
  session: SessionView | null;
};
export type Snapshot = {
  me: Guest;
  scenarios: Scenario[];
  rooms: RoomSummary[];
  room: RoomView | null;
};
export type ServerEvent =
  | { type: "snapshot"; data: Snapshot }
  | { type: "ack"; requestId: string }
  | { type: "error"; requestId?: string; message: string };

export {
  storyCueSchema,
  storyPackageSchema,
  storyCatalogItemSchema,
  storyCatalogResponseSchema,
  startStorySessionSchema,
  inspectStoryEvidenceSchema,
  accuseStorySchema,
  rumVitalSchema,
} from "./story";
export type { StoryCue, StoryPackage, StoryCatalogItem, StoryCatalogResponse } from "./story";
