import { afterEach, expect, test } from "bun:test";
import { Store } from "../../store";
import type { Guest } from "@festival/shared";
import { Game } from "./game";
import { storyCatalog } from "../platform/stories/catalog";
import { ReconnectGrace } from "../lobby/reconnect-grace";

const stores: Store[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
});

// The only available multiplayer story ("rehearsal") seats two players.
function setup() {
  const store = new Store(":memory:");
  stores.push(store);
  const game = new Game(store, storyCatalog);
  const host = { id: "g0", nickname: "방장" };
  const guest = { id: "g1", nickname: "참가자" };
  for (const member of [host, guest]) {
    store.state.guests[member.id] = member;
    game.online.set(member.id, 1);
  }
  const room = game.create(host, "rehearsal");
  game.join(guest, room.code);
  return { store, game, room, host, guest };
}

const ready = (game: Game, guest: Guest, value = true) =>
  game.command(guest, { type: "ready", ready: value, requestId: crypto.randomUUID() });
const start = (game: Game, guest: Guest) =>
  game.command(guest, { type: "start", requestId: crypto.randomUUID() });
const readyFlags = (game: Game, viewer: Guest) =>
  Object.fromEntries((game.snapshot(viewer).room?.members ?? []).map((m) => [m.id, m.ready]));

test("members toggle readiness and the snapshot shows each member's state", () => {
  const { game, host, guest } = setup();
  ready(game, guest);
  expect(readyFlags(game, host)).toEqual({ g0: false, g1: true });
  ready(game, guest, false);
  expect(readyFlags(game, host)).toEqual({ g0: false, g1: false });
});

test("start needs every member, including the host, to be ready", () => {
  const { game, host, guest } = setup();
  ready(game, guest);
  expect(() => start(game, host)).toThrow("준비");
  ready(game, host);
  start(game, host);
  expect(game.snapshot(host).room?.session).not.toBeNull();
  expect(readyFlags(game, host)).toEqual({ g0: false, g1: false });
});

test("readiness cannot change once the game has started", () => {
  const { game, host, guest } = setup();
  ready(game, host);
  ready(game, guest);
  start(game, host);
  expect(() => ready(game, guest, false)).toThrow("시작 전");
});

test("solo rooms do not use readiness", () => {
  const store = new Store(":memory:");
  stores.push(store);
  const game = new Game(store, storyCatalog);
  const host = { id: "solo", nickname: "탐정" };
  store.state.guests[host.id] = host;
  game.online.set(host.id, 1);
  game.create(host, "deokil-trading-murder");
  expect(() => ready(game, host)).toThrow("1인 모드");
});

test("a member who leaves keeps the others' readiness", () => {
  const { game, host, guest, room } = setup();
  ready(game, host);
  ready(game, guest);
  game.command(guest, { type: "leave", requestId: crypto.randomUUID() });
  expect(game.state.rooms[room.id].readyIds).toEqual(["g0"]);
  expect(game.state.rooms[room.id].memberIds).toEqual(["g0"]);
});

test("a new host starts unready even if they were ready as a member", () => {
  const { game, host, guest, room } = setup();
  ready(game, host);
  ready(game, guest);
  game.command(host, { type: "leave", requestId: crypto.randomUUID() });
  expect(game.state.rooms[room.id].hostId).toBe("g1");
  expect(game.state.rooms[room.id].readyIds).toEqual([]);
  expect(readyFlags(game, guest)).toEqual({ g1: false });
});

test("a reconnecting member loses only their own readiness", () => {
  const { game, host, guest, room } = setup();
  ready(game, host);
  ready(game, guest);
  game.clearReady(host.id);
  expect(game.state.rooms[room.id].readyIds).toEqual(["g1"]);
  game.clearReady(guest.id);
  expect(game.state.rooms[room.id].readyIds).toEqual([]);
});

test("reconnecting through the grace path clears only the reconnecting member's readiness", () => {
  const { game, host, guest, room } = setup();
  const presence = new ReconnectGrace(game, () => {}, () => () => {}, () => 0);
  ready(game, host);
  ready(game, guest);
  presence.disconnect(guest.id);
  expect(game.state.rooms[room.id].readyIds).toEqual(["g0", "g1"]);
  presence.connect(guest.id);
  expect(game.state.rooms[room.id].readyIds).toEqual(["g0"]);
  expect(game.state.rooms[room.id].memberIds).toEqual(["g0", "g1"]);
});
