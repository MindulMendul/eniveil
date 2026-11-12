import type { Scenario } from "@festival/shared";

export type StoryContent = {
  roles: { name: string; secret: string }[];
  firstClues: { id: string; text: string }[];
  secondClues: { id: string; text: string }[];
  stageDurations?: { firstInvestigationSeconds?: number; meetingSeconds?: number; secondInvestigationSeconds?: number };
  meetingPrompt?: string;
  finalChoices?: { id: string; label: string; outcome: string }[];
  rooms?: { id: string; name: string; description?: string; requiredClueIds: string[] }[];
  answer: string;
  answerRoleIndex?: number;
  items?: { name: string; description: string; ownerRoleIndex?: number }[];
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
