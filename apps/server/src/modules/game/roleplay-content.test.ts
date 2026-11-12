import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { storyPackageSchema, type Guest, type StoryPackage } from "@festival/shared";
import { Store } from "../../store";
import { Game } from "./game";
import { roleplayStoryVersion, withRoleplayPackages } from "./roleplay-content";
import type { StoryCatalog } from "./story-catalog";
import { storyCatalog } from "../platform/stories/catalog";

const stores: Store[] = [];
afterEach(() => { for (const store of stores.splice(0)) store.close(); });

const MEMORY_A = "MEMORY-A: 너는 6시에 매표소를 떠났다.";
const MEMORY_B = "MEMORY-B: 너는 6시 5분에 무대 서랍을 열었다.";
const CLUE = "CLUE-1: 출입 기록에는 무대 담당자의 이름이 있다.";
const SECOND_CLUE = "CLUE-2: 서랍 손잡이에 빗물이 남아 있다.";
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
    firstClues: [CLUE],
    secondClues: [SECOND_CLUE],
    answer: ANSWER,
    answerRoleId: "r2",
  };
  source.content.items = [
    { id: "key", name: "무대 서랍 열쇠", description: "서랍을 여는 열쇠다.", visibleTo: { type: "all" }, transfer: { mode: "owner_choice", toRoleIds: ["r1"] }, initialOwnerRoleId: "r2", use: { label: "서랍 열기", result: "서랍 안쪽에서 젖은 초대장을 발견했다." } },
    { id: "seal", name: "봉인 스티커", description: "조합에 쓰인다.", visibleTo: { type: "all" }, transfer: { mode: "anyone" }, initialOwnerRoleId: "r2" },
    { id: "drawer-open", name: "열린 서랍", description: "조합 결과다.", visibleTo: { type: "all" }, transfer: { mode: "never" } },
  ];
  source.content.mechanics.itemRecipes = [{ id: "open-drawer", itemIds: ["key", "seal"], resultItemId: "drawer-open" }];
  return storyPackageSchema.parse(source);
}

function setup(stageDurations?: { firstInvestigationSeconds?: number; meetingSeconds?: number; secondInvestigationSeconds?: number }, meetingPrompt?: string, configure?: (pkg: StoryPackage) => void) {
  const store = new Store(":memory:");
  stores.push(store);
  const pkg = roleplayPackage();
  if (pkg.content.mechanics.type === "roleplay") {
    pkg.content.mechanics.stageDurations = stageDurations;
    pkg.content.mechanics.meetingPrompt = meetingPrompt;
  }
  configure?.(pkg);
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
  return { game, a, b, pkg };
}

test("a roleplay package maps each role to its own memory, staged clues and the answer role", () => {
  const version = roleplayStoryVersion(roleplayPackage());
  expect(version?.scenario.players).toBe(2);
  expect(version?.content.roles.map((role) => role.secret)).toEqual([MEMORY_A, MEMORY_B]);
  expect(version?.content.firstClues).toEqual([{ id: "first-1", text: CLUE }]);
  expect(version?.content.secondClues).toEqual([{ id: "second-1", text: SECOND_CLUE }]);
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

test("clues unlock in their investigation stages and the answer stays hidden until the reveal", () => {
  const { game, a, b } = setup();
  expect(game.snapshot(a).room!.session!.clues).toEqual([]);
  expect(JSON.stringify(game.snapshot(a))).not.toContain(ANSWER);
  expect(JSON.stringify(game.snapshot(b))).not.toContain(ANSWER);
  game.command(a, { type: "advance", requestId: crypto.randomUUID() });
  expect(game.snapshot(b).room!.session!.clues).toEqual([]);
  expect(() => game.command(a, { type: "collect-clue", requestId: crypto.randomUUID() })).not.toThrow();
  expect(game.snapshot(b).room!.session!.clues).toEqual([CLUE]);
  game.command(a, { type: "advance", requestId: crypto.randomUUID() });
  expect(game.snapshot(b).room!.session!.clues).toEqual([CLUE]);
  game.command(a, { type: "advance", requestId: crypto.randomUUID() });
  expect(game.snapshot(b).room!.session!.clues).toEqual([CLUE]);
  game.command(b, { type: "collect-clue", requestId: crypto.randomUUID() });
  expect(game.snapshot(b).room!.session!.clues).toEqual([CLUE, SECOND_CLUE]);
  game.command(a, { type: "advance", requestId: crypto.randomUUID() });
  expect(() => game.command(a, { type: "collect-clue", requestId: crypto.randomUUID() })).toThrow("조사 단계");
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

test("the server validates transfer and consumes recipe inputs", () => {
  const { game, a, b } = setup();
  const session = game.state.sessions[game.needRoom(a.id).sessionId!]!;
  game.command(a, { type: "advance", requestId: crypto.randomUUID() });
  const ownerId = session.itemOwners.key!;
  const owner = ownerId === a.id ? a : b;
  const other = (session.participants.find((p) => p.roleIndex === 0)!.id === a.id ? a : b);
  expect(() => game.command(other, { type: "transfer-item", itemId: "key", targetId: owner.id, requestId: crypto.randomUUID() })).toThrow("네가 가진");
  game.command(owner, { type: "transfer-item", itemId: "key", targetId: other.id, requestId: crypto.randomUUID() });
  game.command(owner, { type: "transfer-item", itemId: "seal", targetId: other.id, requestId: crypto.randomUUID() });
  expect(session.itemOwners.key).toBe(other.id);
  expect(() => game.command(owner, { type: "combine-items", recipeId: "open-drawer", requestId: crypto.randomUUID() })).toThrow("재료");
  game.command(other, { type: "combine-items", recipeId: "open-drawer", requestId: crypto.randomUUID() });
  expect(session.itemOwners["drawer-open"]).toBe(other.id);
  expect(session.consumedItemIds).toEqual(expect.arrayContaining(["key", "seal"]));
  expect(game.snapshot(owner).room!.session!.collectableItems.map((item) => item.id)).not.toContain("key");
});

test("only an owner can use an item once and the configured result is shared", () => {
  const { game, a, b } = setup();
  const session = game.state.sessions[game.needRoom(a.id).sessionId!]!;
  game.command(a, { type: "advance", requestId: crypto.randomUUID() });
  const owner = session.itemOwners.key === a.id ? a : b;
  const other = owner.id === a.id ? b : a;
  expect(() => game.command(other, { type: "use-item", itemId: "key", requestId: crypto.randomUUID() })).toThrow("네가 가진");
  game.command(owner, { type: "use-item", itemId: "key", requestId: crypto.randomUUID() });
  expect(game.snapshot(other).room!.session!.itemUseResults).toEqual([{ itemId: "key", text: "서랍 안쪽에서 젖은 초대장을 발견했다." }]);
  expect(game.snapshot(owner).room!.session!.items.map((item) => item.id)).not.toContain("key");
  expect(() => game.command(owner, { type: "use-item", itemId: "key", requestId: crypto.randomUUID() })).toThrow("네가 가진");
});

test("room resources are server-checked, shared rewards apply once, and room items require entry", () => {
  const { game, a, b } = setup(undefined, undefined, (pkg) => {
    if (pkg.content.mechanics.type === "roleplay") {
      pkg.content.mechanics.resources = [
        { id: "focus", name: "집중력", initialValue: 2, scope: "personal" },
        { id: "trust", name: "신뢰", initialValue: 0, scope: "shared" },
      ];
      pkg.content.mechanics.rooms = [{ id: "drawer", name: "무대 서랍", requiredClueIds: [], itemIds: ["drawer-open"], entryCost: [{ resourceId: "focus", amount: 2 }], entryReward: [{ resourceId: "trust", amount: 1 }], entryPenalty: [] }];
    }
  });
  game.command(a, { type: "advance", requestId: crypto.randomUUID() });
  expect(() => game.command(a, { type: "collect-item", itemId: "drawer-open", requestId: crypto.randomUUID() })).toThrow("방으로 이동");
  game.command(a, { type: "move-room", roomId: "drawer", requestId: crypto.randomUUID() });
  const first = game.snapshot(a).room!.session!;
  expect(first.resources).toEqual(expect.arrayContaining([{ id: "focus", name: "집중력", value: 0, scope: "personal" }, { id: "trust", name: "신뢰", value: 1, scope: "shared" }]));
  expect(game.snapshot(b).room!.session!.resources.find((resource) => resource.id === "trust")?.value).toBe(1);
  game.command(a, { type: "collect-item", itemId: "drawer-open", requestId: crypto.randomUUID() });
  expect(() => game.command(a, { type: "move-room", roomId: "drawer", requestId: crypto.randomUUID() })).toThrow("자원이 부족");
});

test("an expired configured investigation advances on the server", () => {
  const { game, a } = setup({ firstInvestigationSeconds: 30 });
  game.command(a, { type: "advance", requestId: crypto.randomUUID() });
  const session = game.state.sessions[game.needRoom(a.id).sessionId!]!;
  expect(session.phaseEndsAt).not.toBeNull();
  expect(game.expireTimedStages(session.phaseEndsAt! - 1)).toEqual([]);
  expect(game.expireTimedStages(session.phaseEndsAt!)).toHaveLength(1);
  expect(session.phase).toBe("meeting");
  expect(session.phaseEndsAt).toBeNull();
});

test("a meeting shows only the configured prompt to participants", () => {
  const { game, a, b } = setup(undefined, "발견한 사실만 말하고, 추측은 나중에 정리하세요.");
  game.command(a, { type: "advance", requestId: crypto.randomUUID() });
  game.command(a, { type: "advance", requestId: crypto.randomUUID() });
  expect(game.snapshot(b).room!.session!.meetingPrompt).toBe("발견한 사실만 말하고, 추측은 나중에 정리하세요.");
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

/** A live catalog the game reads from, so tests can publish or roll back versions between steps. */
function liveGame(initial: StoryCatalog) {
  const store = new Store(":memory:");
  stores.push(store);
  let current = initial;
  const game = new Game(store, {
    list: () => current.list(),
    get: (id, version) => current.get(id, version),
  });
  const seat = (guest: Guest) => {
    store.state.guests[guest.id] = guest;
    game.online.set(guest.id, 1);
    return guest;
  };
  return { game, seat, publish: (next: StoryCatalog) => { current = next; } };
}
const meta = (id: string, version: number) => ({ id, version, mode: "multiplayer" as const });
function twoVersions(v1: StoryPackage, v2: StoryPackage) {
  return withRoleplayPackages(storyCatalog, {
    list: () => [meta(v1.story.id, 1), meta(v2.story.id, 2)],
    get: (_id, version) => (version === 2 ? v2 : v1),
  });
}

test("a room keeps its creation version and seats after a newer version is published", () => {
  const v1 = roleplayPackage();
  const v2 = roleplayPackage();
  v2.story.version = 2;
  v2.story.playerCount = { min: 3, max: 3 };
  const live = liveGame(withRoleplayPackages(storyCatalog, { list: () => [meta(v1.story.id, 1)], get: () => v1 }));
  const host = live.seat({ id: "h", nickname: "방장" }), guest = live.seat({ id: "g", nickname: "참가자" });
  const room = live.game.create(host, v1.story.id);
  live.game.join(guest, room.code);
  live.publish(twoVersions(v1, v2));
  const view = live.game.snapshot(host).room!;
  expect(view.capacity).toBe(2);
  expect(view.scenario.version).toBe(1);
  live.game.command(host, { type: "start", requestId: crypto.randomUUID() });
  expect(live.game.snapshot(host).room?.session).not.toBeNull();
});

test("a room whose pinned version was removed still renders the lobby and keeps its seats", () => {
  const v1 = roleplayPackage();
  const v2 = roleplayPackage();
  v2.story.version = 2;
  v2.story.playerCount = { min: 4, max: 4 };
  const live = liveGame(withRoleplayPackages(storyCatalog, { list: () => [meta(v1.story.id, 1)], get: () => v1 }));
  const host = live.seat({ id: "h", nickname: "방장" }), outsider = live.seat({ id: "o", nickname: "구경꾼" });
  live.game.create(host, v1.story.id);
  // Rollback: version 1 is gone, only the four-seat version 2 remains.
  live.publish(withRoleplayPackages(storyCatalog, { list: () => [meta(v2.story.id, 2)], get: () => v2 }));
  expect(() => live.game.snapshot(outsider)).not.toThrow();
  const view = live.game.snapshot(host).room!;
  expect(view.scenario.version).toBe(2);
  expect(view.capacity).toBe(2);
});

test("after a rollback, a two-seat room does not admit guests for the replacement's four seats", () => {
  const v1 = roleplayPackage();
  const v2 = roleplayPackage();
  v2.story.version = 2;
  v2.story.playerCount = { min: 4, max: 4 };
  const live = liveGame(withRoleplayPackages(storyCatalog, { list: () => [meta(v1.story.id, 1)], get: () => v1 }));
  const host = live.seat({ id: "h", nickname: "방장" });
  const room = live.game.create(host, v1.story.id);
  live.publish(withRoleplayPackages(storyCatalog, { list: () => [meta(v2.story.id, 2)], get: () => v2 }));
  live.game.join(live.seat({ id: "g1", nickname: "참가1" }), room.code);
  expect(() => live.game.join(live.seat({ id: "g2", nickname: "참가2" }), room.code)).toThrow("가득");
});

test("after a rollback to a different seat count, the old room cannot start on the replacement", () => {
  const v1 = roleplayPackage();
  const v2 = roleplayPackage();
  v2.story.version = 2;
  v2.story.playerCount = { min: 4, max: 4 };
  const live = liveGame(withRoleplayPackages(storyCatalog, { list: () => [meta(v1.story.id, 1)], get: () => v1 }));
  const host = live.seat({ id: "h", nickname: "방장" }), guest = live.seat({ id: "g", nickname: "참가자" });
  const room = live.game.create(host, v1.story.id);
  live.game.join(guest, room.code);
  live.publish(withRoleplayPackages(storyCatalog, { list: () => [meta(v2.story.id, 2)], get: () => v2 }));
  expect(() => live.game.command(host, { type: "start", requestId: crypto.randomUUID() })).toThrow("시작할 수 없어");
  expect(live.game.snapshot(host).room?.session).toBeNull();
});
