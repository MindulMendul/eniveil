import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { storyPackageSchema } from "@festival/shared";

function roleplayPackage() {
  const source = JSON.parse(readFileSync(join(import.meta.dir, "../../../stories/deokil-trading-murder.mstory"), "utf8"));
  source.story.mode = "multiplayer";
  source.story.playerCount = { min: 2, max: 2 };
  source.content.roles = [{ id: "r1", name: "A" }, { id: "r2", name: "B" }];
  source.content.mechanics = {
    type: "roleplay",
    memories: [{ roleId: "r1", text: "m1" }, { roleId: "r2", text: "m2" }],
    clues: ["c"],
    answer: "a",
    answerRoleId: "r1",
  };
  return source;
}

test("a roleplay package with one memory per role and a valid answer role parses", () => {
  expect(storyPackageSchema.safeParse(roleplayPackage()).success).toBe(true);
});

test("every role needs exactly one memory", () => {
  const source = roleplayPackage();
  source.content.mechanics.memories = [{ roleId: "r1", text: "m1" }];
  expect(storyPackageSchema.safeParse(source).success).toBe(false);
  source.content.mechanics.memories = [{ roleId: "r1", text: "m1" }, { roleId: "r1", text: "dup" }];
  expect(storyPackageSchema.safeParse(source).success).toBe(false);
});

test("memories and the answer role must reference existing roles", () => {
  const unknownMemory = roleplayPackage();
  unknownMemory.content.mechanics.memories[1].roleId = "ghost";
  expect(storyPackageSchema.safeParse(unknownMemory).success).toBe(false);
  const unknownAnswer = roleplayPackage();
  unknownAnswer.content.mechanics.answerRoleId = "ghost";
  expect(storyPackageSchema.safeParse(unknownAnswer).success).toBe(false);
});

test("the role count must equal the seat count for a roleplay package", () => {
  const moreSeats = roleplayPackage();
  moreSeats.story.playerCount = { min: 3, max: 3 };
  expect(storyPackageSchema.safeParse(moreSeats).success).toBe(false);
  const moreRoles = roleplayPackage();
  moreRoles.story.playerCount = { min: 1, max: 1 };
  expect(storyPackageSchema.safeParse(moreRoles).success).toBe(false);
});
