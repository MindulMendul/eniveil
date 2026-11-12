import type { Scenario } from "@festival/shared";

export type StoryContent = {
  roles: { name: string; secret: string }[];
  firstClues: { id: string; text: string; resourceCost?: { resourceId: string; amount: number }; resourceReward?: { resourceId: string; amount: number } }[];
  secondClues: { id: string; text: string; resourceCost?: { resourceId: string; amount: number }; resourceReward?: { resourceId: string; amount: number } }[];
  stageDurations?: { firstInvestigationSeconds?: number; meetingSeconds?: number; secondInvestigationSeconds?: number };
  meetingPrompt?: string;
  finalChoices?: { id: string; label: string; outcome: string }[];
  rooms?: { id: string; name: string; description?: string; requiredClueIds: string[] }[];
  resources?: { id: string; name: string; initialValue: number }[];
  answer: string;
  answerRoleIndex?: number;
  items?: { id: string; name: string; description: string; ownerRoleIndex?: number; transfer: { mode: "never" | "anyone" | "owner_choice"; targetRoleIndexes?: number[] } }[];
};

export type StoryVersion = {
  scenario: Scenario;
  content: StoryContent;
};

/** Game-domain port. Implementations belong to the platform/content layer. */
export interface StoryCatalog {
  list(): Scenario[];
  get(id: string, version?: number): StoryVersion | undefined;
}
