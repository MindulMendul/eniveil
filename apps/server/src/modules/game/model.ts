import type { Guest } from "@festival/shared";

export type Room = {
  access?: import("@festival/shared").RoomAccess;
  pinHash?: string;
  pinFailures?: { count: number; until: number };
  id: string;
  code: string;
  hostId: string;
  scenarioId: string;
  /** The story version chosen when the room was created; rooms saved before this field use the newest version. */
  scenarioVersion?: number;
  memberIds: string[];
  sessionId: string | null;
  mode?: "solo" | "multiplayer";
  soloStarted?: boolean;
  soloPlayId?: string | null;
};

export type Session = {
  id: string;
  roomId: string;
  scenarioId: string;
  scenarioVersion: number;
  participants: { id: string; nickname: string; roleIndex: number }[];
  phase: "briefing" | "first_investigation" | "meeting" | "second_investigation" | "final_choice" | "reveal";
  votes: Record<string, string>;
  finalChoices: Record<string, string>;
  currentRoomIds: Record<string, string>;
  resources: Record<string, Record<string, number>>;
  itemOwners: Record<string, string | null>;
  consumedItemIds: string[];
  usedItemIds: string[];
  itemUseResults: { itemId: string; text: string }[];
  revealedItemIds: string[];
  collectedClueIds: string[];
  phaseEndsAt: number | null;
  endedAt: string | null;
};

export type State = {
  guests: Record<string, Guest>;
  rooms: Record<string, Room>;
  sessions: Record<string, Session>;
};
