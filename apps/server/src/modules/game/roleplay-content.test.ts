import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { storyPackageSchema, type Guest, type StoryPackage } from "@festival/shared";
import { Store } from "../../store";
import { Game } from "./game";
import { roleplayStoryVersion, withRoleplayPackages } from "./roleplay-content";
import { storyCatalog } from "../platform/stories/catalog";

const stores: Store[] = [];
afterEach(() => { for (const store of stores.splice(0)) store.close(); });

const MEMORY_A = "MEMORY-A: 너는 6시에 매표소를 떠났다.";
const MEMORY_B = "MEMORY-B: 너는 6시 5분에 무대 서랍을 열었다.";
const CLUE = "CLUE-1: 출입 기록에는 무대 담당자의 이름이 있다.";
const ANSWER = "ANSWER-SECRET: 초대장을 옮긴 사람은 무대 담당자다.";

function roleplayPackage(): StoryPackage {
  const source = JSON.parse(readFileSync(join(import.meta.dir, "../../../stories/deokil-trading-murder.mstory"), "utf8"));
  source.story.id = "roleplay-fixture";
  source.story.mode = "multiplayer";
  source.story.playerCount = { min: 2, max: 2 };
  source.content.roles = [{ id: "r1", name: "안내원" }, { id: "r2", name: "무대 담당자" }];
  source.content.mechanics = {
    type: "roleplay",
    memories: [{ roleId: "r1", text: MEMORY_A }, { roleId: "r2", text: MEMORY_B }],
    clues: [CLUE],
    answer: ANSWER,
    answerRoleId: "r2",
  };
  source.content.items = [{ id: "key", name: "무대 서랍 열쇠", description: "서랍을 여는 열쇠다.", visibleTo: { type: "all" }, transfer: { mode: "never" }, initialOwnerRoleId: "r2" }];
  return storyPackageSchema.parse(source);
}

function setup() {
  const store = new Store(":memory:");
  stores.push(store);
  const pkg = roleplayPackage();
  const catalog = withRoleplayPackages(storyCatalog, {
    list: () => [{ id: pkg.story.id, version: pkg.story.version, mode: "multiplayer" }],
    get: () => pkg,
  });
  const game = new Game(store, catalog);
  const a: Guest = { id: "a", nickname: "안내" }, b: Guest = { id: "b", nickname: "무대" };
  for (const guest of [a, b]) { store.state.guests[guest.id] = guest; game.online.set(guest.id, 1); }
  const room = game.create(a, pkg.story.id);
  game.join(b, room.code);
  game.command(a, { type: "start", requestId: crypto.randomUUID() });
  return { game, a, b };
}

test("a roleplay package maps each role to its own memory, shared clues and the answer role", () => {
  const version = roleplayStoryVersion(roleplayPackage());
  expect(version?.scenario.players).toBe(2);
  expect(version?.content.roles.map((role) => role.secret)).toEqual([MEMORY_A, MEMORY_B]);
  expect(version?.content.clues).toEqual([CLUE]);
  expect(version?.content.answerRoleIndex).toBe(1);
});

test("solo packages and unknown modes do not become multiplayer roleplay content", () => {
  const solo = JSON.parse(readFileSync(join(import.meta.dir, "../../../stories/deokil-trading-murder.mstory"), "utf8"));
  expect(roleplayStoryVersion(solo)).toBeNull();
  const pkg = roleplayPackage();
  const listed = withRoleplayPackages(storyCatalog, {
    list: () => [{ id: "deokil-trading-murder", version: 1, mode: "solo" }],
    get: () => solo,
  }).list().map((scenario) => scenario.id);
  expect(listed).not.toContain(pkg.story.id);
});

test("each participant sees only their own memory during the briefing", () => {
  const { game, a, b } = setup();
  const viewA = game.snapshot(a).room!.session!;
  const viewB = game.snapshot(b).room!.session!;
  expect([MEMORY_A, MEMORY_B]).toContain(viewA.role.secret);
  expect([MEMORY_A, MEMORY_B]).toContain(viewB.role.secret);
  expect(viewA.role.secret).not.toBe(viewB.role.secret);
  const otherSecretOfA = viewA.role.secret === MEMORY_A ? MEMORY_B : MEMORY_A;
  expect(JSON.stringify(game.snapshot(a))).not.toContain(otherSecretOfA);
  expect(JSON.stringify(game.snapshot(b))).not.toContain(viewA.role.secret);
});

test("clues stay hidden in the briefing and the answer stays hidden until the reveal", () => {
  const { game, a, b } = setup();
  expect(game.snapshot(a).room!.session!.clues).toEqual([]);
  expect(JSON.stringify(game.snapshot(a))).not.toContain(ANSWER);
  expect(JSON.stringify(game.snapshot(b))).not.toContain(ANSWER);
  game.command(a, { type: "advance", requestId: crypto.randomUUID() });
  expect(game.snapshot(b).room!.session!.clues).toEqual([CLUE]);
  expect(JSON.stringify(game.snapshot(b))).not.toContain(ANSWER);
});

test("an item reaches only the role that owns it", () => {
  const { game, a, b } = setup();
  const viewA = game.snapshot(a).room!.session!;
  const viewB = game.snapshot(b).room!.session!;
  const owners = [viewA, viewB].filter((view) => view.items.some((item) => item.name === "무대 서랍 열쇠"));
  expect(owners).toHaveLength(1);
  const nonOwner = owners[0] === viewA ? viewB : viewA;
  expect(nonOwner.items).toEqual([]);
  const nonOwnerViewer = owners[0] === viewA ? b : a;
  expect(JSON.stringify(game.snapshot(nonOwnerViewer))).not.toContain("무대 서랍 열쇠");
});

test("a newer published version is offered, while an older session can still load its own version", () => {
  const older = roleplayPackage();
  const newer = roleplayPackage();
  newer.story.version = 2;
  newer.story.title = "샘플 v2";
  const catalog = withRoleplayPackages(storyCatalog, {
    list: () => [
      { id: older.story.id, version: 1, mode: "multiplayer" },
      { id: newer.story.id, version: 2, mode: "multiplayer" },
    ],
    get: (_id, version) => (version === 2 ? newer : older),
  });
  const listed = catalog.list().filter((scenario) => scenario.id === older.story.id);
  expect(listed.map((scenario) => scenario.version)).toEqual([2]);
  expect(catalog.get(older.story.id)?.scenario.version).toBe(2);
  expect(catalog.get(older.story.id, 1)?.scenario.version).toBe(1);
  expect(catalog.get(older.story.id, 2)?.scenario.title).toBe("샘플 v2");
});

test("a room keeps its creation version after a newer version is published", () => {
  const v1 = roleplayPackage();
  const v2 = roleplayPackage();
  v2.story.version = 2;
  v2.story.playerCount = { min: 3, max: 3 };
  const id = v1.story.id;
  const meta = (version: number) => ({ id, version, mode: "multiplayer" as const });
  let current = withRoleplayPackages(storyCatalog, {
    list: () => [meta(1)],
    get: () => v1,
  });
  const store = new Store(":memory:");
  stores.push(store);
  const game = new Game(store, {
    list: () => current.list(),
    get: (storyId, version) => current.get(storyId, version),
  });
  const host: Guest = { id: "h", nickname: "방장" }, guest: Guest = { id: "g", nickname: "참가자" };
  for (const member of [host, guest]) { store.state.guests[member.id] = member; game.online.set(member.id, 1); }
  const room = game.create(host, id);
  game.join(guest, room.code);

  current = withRoleplayPackages(storyCatalog, {
    list: () => [meta(1), meta(2)],
    get: (_id, version) => (version === 2 ? v2 : v1),
  });
  const view = game.snapshot(host).room!;
  expect(view.capacity).toBe(2);
  expect(view.scenario.version).toBe(1);
  game.command(host, { type: "start", requestId: crypto.randomUUID() });
  expect(game.snapshot(host).room?.session).not.toBeNull();
});

test("a room whose pinned version was removed still renders the lobby and does not break other viewers", () => {
  const v1 = roleplayPackage();
  const v2 = roleplayPackage();
  v2.story.version = 2;
  const id = v1.story.id;
  const meta = (version: number) => ({ id, version, mode: "multiplayer" as const });
  let current = withRoleplayPackages(storyCatalog, {
    list: () => [meta(1)],
    get: () => v1,
  });
  const store = new Store(":memory:");
  stores.push(store);
  const game = new Game(store, {
    list: () => current.list(),
    get: (storyId, version) => current.get(storyId, version),
  });
  const host: Guest = { id: "h", nickname: "방장" }, outsider: Guest = { id: "o", nickname: "구경꾼" };
  for (const member of [host, outsider]) { store.state.guests[member.id] = member; game.online.set(member.id, 1); }
  game.create(host, id);

  // Rollback: version 1 is no longer published, only version 2 remains.
  current = withRoleplayPackages(storyCatalog, {
    list: () => [meta(2)],
    get: () => v2,
  });
  expect(() => game.snapshot(outsider)).not.toThrow();
  expect(game.snapshot(host).room?.scenario.version).toBe(2);
});
