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
