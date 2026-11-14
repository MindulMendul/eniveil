import { expect, test } from "bun:test";
import { Store } from "../../store";
import { Game } from "./game";
import { roleplayStoryVersion, withRoleplayPackages } from "./roleplay-content";
import { FileStoryCatalog } from "../platform/stories/file-catalog";
import { storyCatalog } from "../platform/stories/catalog";

test("the shipped sandbox sample is a playable two-player roleplay story with owned items", () => {
  const files = new FileStoryCatalog();
  const source = files.get("sandbox-sample-drawer");
  expect(source).toBeDefined();
  const version = roleplayStoryVersion(source!);
  expect(version?.scenario.players).toBe(2);
  expect(version?.content.roles.map((role) => role.name)).toEqual(["안내원", "무대 담당자"]);
  expect(version?.content.items?.map((item) => item.ownerRoleIndex)).toEqual([1, 0]);
  expect(version?.content.answerRoleIndex).toBe(1);
});

test("the sample appears in the game catalog and can be created as a room", () => {
  const store = new Store(":memory:");
  try {
    const catalog = withRoleplayPackages(storyCatalog, new FileStoryCatalog());
    expect(catalog.list().map((scenario) => scenario.id)).toContain("sandbox-sample-drawer");
    const game = new Game(store, catalog);
    const host = { id: "host", nickname: "방장" };
    store.state.guests[host.id] = host;
    game.online.set(host.id, 1);
    const room = game.create(host, "sandbox-sample-drawer");
    expect(room.mode).toBe("multiplayer");
    expect(game.snapshot(host).room?.capacity).toBe(2);
  } finally {
    store.close();
  }
});

test("the three-player original is published with private goals and a one-hour structure", () => {
  const source = new FileStoryCatalog().get("last-train-alibi");
  expect(source?.story.playerCount).toEqual({ min: 3, max: 3 });
  expect(source?.story.estimatedMinutes).toBe(60);
  const version = source && roleplayStoryVersion(source);
  expect(version?.scenario.available).toBeTrue();
  expect(version?.content.roles).toHaveLength(3);
  expect(version?.content.roles.every((role) => role.secret.includes("개인 목표"))).toBeTrue();
  expect(version?.content.finalChoices).toHaveLength(4);
});
