import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { storyPackageSchema, type StoryPackage } from "@festival/shared";
import type { StoryCatalog } from "./ports/story-catalog";

/** Loads versioned story source packages from the server-owned stories directory. */
export class FileStoryCatalog implements StoryCatalog {
  private readonly packages = new Map<string, StoryPackage>();
  private readonly latestPackages = new Map<string, StoryPackage>();

  constructor(directory = resolve(import.meta.dir, "../../../../stories")) {
    for (const file of readdirSync(directory).filter((name) => name.endsWith(".mstory"))) {
      const source = readFileSync(resolve(directory, file), "utf8");
      let parsed: unknown;
      try {
        parsed = JSON.parse(source);
      } catch (error) {
        throw new Error(`Invalid JSON in ${file}: ${String(error)}`);
      }
      const result = storyPackageSchema.safeParse(parsed);
      if (!result.success) {
        throw new Error(`Invalid .mstory package ${file}: ${result.error.message}`);
      }
      const story = result.data;
      const key = this.key(story.story.id, story.story.version);
      if (this.packages.has(key)) {
        throw new Error(`Duplicate story version ${key} in ${file}`);
      }
      this.packages.set(key, story);
      if ((this.latestPackages.get(story.story.id)?.story.version ?? 0) < story.story.version)
        this.latestPackages.set(story.story.id, story);
    }
  }

  get(id: string, version?: number) {
    if (version !== undefined) return this.packages.get(this.key(id, version));
    return this.latestPackages.get(id);
  }

  list() {
    return [...this.packages.values()].map(({ story }) => ({ ...story }));
  }

  private key(id: string, version: number) {
    return `${id}:${version}`;
  }
}

export const fileStoryCatalog = new FileStoryCatalog();
