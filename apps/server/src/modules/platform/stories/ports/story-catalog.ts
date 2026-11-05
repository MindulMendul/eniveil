import type { StoryPackage } from "@festival/shared";

/** Application-facing catalog port; file and database adapters can implement it. */
export interface StoryCatalog {
  get(id: string, version?: number): StoryPackage | undefined;
}
