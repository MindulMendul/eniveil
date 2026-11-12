import { z } from "zod";
export const nicknameSchema = z.string().trim().normalize("NFKC").refine(
  (name) => /^[A-Za-z0-9_]+$/.test(name)
    ? name.length >= 4 && name.length <= 20
    : /^[\p{L}\p{N}_]+$/u.test(name) && [...name].length >= 2 && [...name].length <= 10,
  "닉네임은 문자·숫자·밑줄로 2~10자, 영문·숫자·밑줄만 쓰면 4~20자로 입력해 줘.",
);
export const guestSchema = z.object({ nickname: nicknameSchema });
export const friendAccountIdSchema = z.uuid();
export const friendRequestSchema = z.object({ accountId: friendAccountIdSchema });
export const roomAccessSchema = z.enum(["public", "friends", "secret"]);
export type RoomAccess = z.infer<typeof roomAccessSchema>;
export const createRoomSchema = z.object({
  access: roomAccessSchema.default("public"),
  pin: z.string().regex(/^\d{4}$/).optional(),
  scenarioId: z.string().min(1).max(80),
});
export const joinRoomSchema = z.object({
  pin: z.string().regex(/^\d{4}$/).optional(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6}$/, "6자리 초대 코드를 확인해 줘."),
});
export const soloRoomExitSchema = z.object({
  roomId: z.uuid(),
  soloPlayId: z.uuid().nullable(),
});
export const supportedSoloStory = {
  id: "deokil-trading-murder",
  title: "덕일상사 살인사건",
} as const;
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("presence"), lobby: z.boolean(), requestId: z.string().max(80) }),
  z.object({ type: z.literal("mode"), mode: z.enum(["solo", "multiplayer"]), requestId: z.string().max(80) }),
  z.object({ type: z.literal("solo-return"), requestId: z.string().max(80) }),
  z.object({ type: z.literal("start"), requestId: z.string().max(80) }),
  z.object({ type: z.literal("advance"), requestId: z.string().max(80) }),
  z.object({ type: z.literal("collect-clue"), requestId: z.string().max(80) }),
  z.object({ type: z.literal("choose-final"), choiceId: z.string().max(80), requestId: z.string().max(80) }),
  z.object({ type: z.literal("move-room"), roomId: z.string().max(80), requestId: z.string().max(80) }),
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
  access: RoomAccess;
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
  phase: "briefing" | "first_investigation" | "meeting" | "second_investigation" | "final_choice" | "reveal";
  phaseEndsAt: number | null;
  role: { name: string; secret: string };
  /** Items the viewer's role owns; other roles' items are never sent. */
  items: { name: string; description: string }[];
  clues: string[];
  availableClueCount: number;
  collectedClueCount: number;
  meetingPrompt: string | null;
  finalChoices: { id: string; label: string }[];
  selectedFinalChoiceId: string | null;
  rooms: { id: string; name: string; description: string | null; available: boolean }[];
  currentRoomId: string | null;
  voteCount: number;
  hasVoted: boolean;
  result: null | { answer: string; votes: { voter: string; target: string }[]; choices: { player: string; outcome: string }[] };
};
export type RoomView = RoomSummary & {
  mode: "solo" | "multiplayer";
  soloStarted: boolean;
  soloPlayId: string | null;
  soloStory: { id: string; title: string };
  hostId: string;
  members: Member[];
  scenario: Scenario;
  session: SessionView | null;
};
export type Snapshot = {
  endingSessionId?: string | null;
  me: Guest;
  scenarios: Scenario[];
  rooms: RoomSummary[];
  room: RoomView | null;
};
export type ServerEvent =
  | { type: "social-changed" }
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
export type { SoloStoryView, StoryCue, StoryPackage, StoryCatalogItem, StoryCatalogResponse } from "./story";
export { MANAGED_IMAGES, managedImagePath, IMAGE_MAX_BYTES, IMAGE_MAX_OUTPUT_BYTES, IMAGE_MAX_DIMENSION, IMAGE_MAX_PIXELS, WEBP_QUALITY, checkImageBytes, checkImageDimensions } from './images';
export { WORKSHOP_AUTHORING_ENABLED } from './features';

export const inviteFriendSchema = z.object({ targetId: z.uuid() });
export const invitationResponseSchema = z.object({ accept: z.boolean(), pin: z.string().regex(/^\d{4}$/).optional() });
export { playEventSchema, playEventBatchSchema, playRatingSchema, playChatSchema } from './play';
export type { PlayEvent } from './play';
export { playEndingSchema } from './play';
