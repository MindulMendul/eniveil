import type { Scenario } from "@festival/shared";

export type StoryContent = {
  roles: { name: string; secret: string }[];
  clues: string[];
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
