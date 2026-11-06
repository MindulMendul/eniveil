import { test, expect, afterEach } from "bun:test";
import { Store } from "./store";
import { Game } from "./game";
import { storyCatalog } from "./modules/platform/stories/catalog";
const stores: Store[] = [];
afterEach(() => {
  for (const s of stores.splice(0)) s.close();
});
function setup() {
  const store = new Store(":memory:");
  stores.push(store);
  const game = new Game(store, storyCatalog);
  const a = { id: "a", nickname: "안내" },
    b = { id: "b", nickname: "무대" },
    c = { id: "c", nickname: "손님" };
  for (const me of [a, b, c]) {
    store.state.guests[me.id] = me;
    game.online.set(me.id, 1);
  }
  return { store, game, a, b, c };
}
const cmd = (type: "start" | "advance" | "return" | "leave") => ({
  type,
  requestId: crypto.randomUUID(),
});
test("room discovery follows vacancy and waiting status without hiding the member's room", () => {
  const { game, a, b, c } = setup();
  const room = game.create(a, "rehearsal");
  expect(game.snapshot(c).rooms.map((item) => item.id)).toEqual([room.id]);
  game.join(b, room.code);
  expect(game.snapshot(c).rooms).toEqual([]);
  expect(game.snapshot(a).room?.id).toBe(room.id);
  game.command(b, cmd("leave"));
  expect(game.snapshot(c).rooms.map((item) => item.id)).toEqual([room.id]);
  game.join(b, room.code);
  game.command(a, cmd("start"));
  // Even a persisted playing room with a vacant seat must not be advertised.
  room.memberIds.pop();
  expect(game.snapshot(c).rooms).toEqual([]);
  expect(game.snapshot(a).room?.session).not.toBeNull();
});
test("only a full connected room can start; host authorization and duplicate start", () => {
  const { game, a, b } = setup();
  game.create(a, "rehearsal");
  expect(() => game.command(a, cmd("start"))).toThrow();
  game.join(b, game.needRoom(a.id).code);
  expect(() => game.command(b, cmd("start"))).toThrow("방장");
  game.online.set(b.id, 0);
  expect(() => game.command(a, cmd("start"))).toThrow("접속");
  game.online.set(b.id, 1);
  game.command(a, cmd("start"));
  expect(() => game.command(a, cmd("start"))).toThrow("이미");
  expect(Object.keys(game.state.sessions)).toHaveLength(1);
});
test("personalized secrets, private ballots, complete game, return, replay", () => {
  const { game, a, b, c } = setup();
  const room = game.create(a, "rehearsal");
  game.join(b, room.code);
  game.command(a, cmd("start"));
  const first = room.sessionId!;
  expect(() => game.join(c, room.code)).toThrow("진행");
  const av = game.snapshot(a).room!.session!,
    bv = game.snapshot(b).room!.session!;
  expect(av.role.name).not.toBe(bv.role.name);
  expect(av.clues).toEqual([]);
  expect(JSON.stringify(av)).not.toContain(bv.role.secret);
  expect(() => game.command(b, cmd("leave"))).toThrow();
  game.command(a, cmd("advance"));
  game.command(a, cmd("advance"));
  expect(() =>
    game.command(a, { type: "vote", requestId: "1", targetId: "unknown" }),
  ).toThrow();
  game.command(a, { type: "vote", requestId: "2", targetId: b.id });
  expect(game.snapshot(b).room!.session!.result).toBeNull();
  expect(() =>
    game.command(a, { type: "vote", requestId: "3", targetId: a.id }),
  ).toThrow("이미");
  game.command(b, { type: "vote", requestId: "4", targetId: a.id });
  expect(game.snapshot(a).room!.session!.phase).toBe("reveal");
  game.command(a, cmd("return"));
  expect(room.sessionId).toBeNull();
  expect(game.state.sessions[first].endedAt).not.toBeNull();
  expect(game.state.sessions[first].participants).toHaveLength(2);
  game.command(a, cmd("start"));
  expect(room.sessionId).not.toBe(first);
});
test("capacity, host transfer, room deletion, unavailable scenario", () => {
  const { game, a, b, c } = setup();
  expect(() => game.create(a, "detective-x")).toThrow();
  const room = game.create(a, "rehearsal");
  game.join(b, room.code);
  expect(() => game.join(c, room.code)).toThrow("가득");
  game.command(a, cmd("leave"));
  expect(room.hostId).toBe(b.id);
  game.command(b, cmd("leave"));
  expect(game.state.rooms[room.id]).toBeUndefined();
});
test("guest credentials expire and unknown credentials fail", () => {
  const { store, a } = setup();
  const token = store.issue(a.id);
  expect(store.authenticate(token)).toEqual(a);
  expect(store.authenticate("invalid")).toBeNull();
  store.db.exec("UPDATE credentials SET expires=0");
  expect(store.authenticate(token)).toBeNull();
});
test("database survives process restart with role assignments and guest identity", () => {
  const path = `/tmp/festival-test-${crypto.randomUUID()}.sqlite`;
  const store = new Store(path);
  stores.push(store);
  const game = new Game(store, storyCatalog);
  const a = { id: "a", nickname: "A" },
    b = { id: "b", nickname: "B" };
  store.state.guests = { a, b };
  game.online.set("a", 1);
  game.online.set("b", 1);
  const token = store.issue("a");
  const room = game.create(a, "rehearsal");
  game.join(b, room.code);
  game.command(a, cmd("start"));
  const id = room.sessionId!;
  const restored = new Store(path);
  stores.push(restored);
  expect(restored.authenticate(token)).toEqual(a);
  expect(new Game(restored, storyCatalog).snapshot(a).room!.session!.id).toBe(id);
});
