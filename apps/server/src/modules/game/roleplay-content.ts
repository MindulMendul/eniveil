import type { Scenario, StoryPackage } from "@festival/shared";
import type { StoryCatalog, StoryVersion } from "./story-catalog";

/**
 * Maps a multiplayer roleplay package onto the content the room/session engine plays.
 * A role's memory becomes its private `secret`; the session view already sends each
 * participant only their own role, so other roles' memories never leave the server.
 */
export function roleplayStoryVersion(source: StoryPackage): StoryVersion | null {
  const mechanics = source.content.mechanics;
  if (source.story.mode !== "multiplayer" || mechanics.type !== "roleplay") return null;
  const memoryByRole = new Map(mechanics.memories.map((item) => [item.roleId, item.text]));
  const roleIndex = new Map(source.content.roles.map((role, index) => [role.id, index]));
  const scenario: Scenario = {
    id: source.story.id,
    version: source.story.version,
    title: source.story.title,
    subtitle: source.story.subtitle,
    // Rooms seat the maximum; the engine starts only when every seat is filled and ready.
    players: source.story.playerCount.max,
    minutes: source.story.estimatedMinutes,
    available: true,
    kind: "original",
  };
  return {
    scenario,
    content: {
      roles: source.content.roles.map((role) => ({
        name: role.name,
        secret: memoryByRole.get(role.id) ?? "",
      })),
      clues: mechanics.clues,
      answer: mechanics.answer,
      answerRoleIndex: roleIndex.get(mechanics.answerRoleId),
    },
  };
}

type PackageSource = {
  list(): { id: string; version: number; mode: "solo" | "multiplayer" }[];
  get(id: string, version?: number): StoryPackage | undefined;
};

/** Adds published multiplayer roleplay packages to the built-in catalog without shadowing it. */
export function withRoleplayPackages(base: StoryCatalog, source: PackageSource): StoryCatalog {
  const extra: StoryVersion[] = [];
  for (const meta of source.list()) {
    if (meta.mode !== "multiplayer") continue;
    const pkg = source.get(meta.id, meta.version);
    const version = pkg ? roleplayStoryVersion(pkg) : null;
    if (version && !base.get(version.scenario.id, version.scenario.version)) extra.push(version);
  }
  return {
    list: () => {
      const scenarios = base.list();
      const known = new Set(scenarios.map((scenario) => scenario.id));
      return [...scenarios, ...extra.map((item) => item.scenario).filter((scenario) => !known.has(scenario.id))];
    },
    get: (id, version) =>
      base.get(id, version) ??
      extra.find((item) => item.scenario.id === id && (version === undefined || item.scenario.version === version)),
  };
}
