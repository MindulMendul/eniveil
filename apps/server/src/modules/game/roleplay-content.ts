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
  const normalizeClues = (
    clues: (string | { id: string; text: string; resourceCost?: { resourceId: string; amount: number }; resourceReward?: { resourceId: string; amount: number } })[],
    stage: "first" | "second",
  ) =>
    clues.map((clue, index) =>
      typeof clue === "string"
        ? { id: `${stage}-${index + 1}`, text: clue }
        : clue,
    );
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
      // `clues` keeps already published one-stage packages playable. New packages
      // declare each investigation's clues separately.
      firstClues: normalizeClues(
        mechanics.firstClues.length ? mechanics.firstClues : (mechanics.clues ?? []),
        "first",
      ),
      secondClues: normalizeClues(mechanics.secondClues, "second"),
      stageDurations: mechanics.stageDurations,
      meetingPrompt: mechanics.meetingPrompt,
      finalChoices: mechanics.finalChoices,
      rooms: mechanics.rooms,
      resources: mechanics.resources,
      answer: mechanics.answer,
      answerRoleIndex: roleIndex.get(mechanics.answerRoleId),
      items: source.content.items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description ?? "",
        ownerRoleIndex: item.initialOwnerRoleId ? roleIndex.get(item.initialOwnerRoleId) : undefined,
      })),
    },
  };
}

type PackageSource = {
  list(): { id: string; version: number; mode: "solo" | "multiplayer" }[];
  get(id: string, version?: number): StoryPackage | undefined;
};

/**
 * Adds published multiplayer roleplay packages to the built-in catalog without shadowing it.
 * Listing and unversioned lookups use each story's newest version; exact-version lookups keep
 * every published version so sessions started on an older version can still load their content.
 */
export function withRoleplayPackages(base: StoryCatalog, source: PackageSource): StoryCatalog {
  const versions: StoryVersion[] = [];
  for (const meta of source.list()) {
    if (meta.mode !== "multiplayer") continue;
    const pkg = source.get(meta.id, meta.version);
    const version = pkg ? roleplayStoryVersion(pkg) : null;
    if (version && !base.get(version.scenario.id, version.scenario.version)) versions.push(version);
  }
  const newest = new Map<string, StoryVersion>();
  for (const item of versions) {
    const current = newest.get(item.scenario.id);
    if (!current || item.scenario.version > current.scenario.version) newest.set(item.scenario.id, item);
  }
  return {
    list: () => {
      const scenarios = base.list();
      const known = new Set(scenarios.map((scenario) => scenario.id));
      return [
        ...scenarios,
        ...[...newest.values()].map((item) => item.scenario).filter((scenario) => !known.has(scenario.id)),
      ];
    },
    get: (id, version) =>
      base.get(id, version) ??
      (version === undefined
        ? newest.get(id)
        : versions.find((item) => item.scenario.id === id && item.scenario.version === version)),
  };
}
