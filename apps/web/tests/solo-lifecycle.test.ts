import { expect, test } from "bun:test";
import type { RoomView } from "@festival/shared";
import { clearSoloExit, pendingSoloExit, rememberSoloExit } from "../src/shared/lib/solo-lifecycle";

const roomId = crypto.randomUUID();
const attempt = crypto.randomUUID();
const room = { id: roomId, soloStarted: true, soloPlayId: attempt } as RoomView;
function tabStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  } as Storage;
}

test("an active room alone never implies that a fresh tab exited its investigation", () => {
  const first = tabStorage();
  const second = tabStorage();
  expect(pendingSoloExit(first, room)).toBeNull();
  expect(pendingSoloExit(second, room)).toBeNull();
  rememberSoloExit(first, { roomId, soloPlayId: attempt });
  expect(pendingSoloExit(second, room)).toBeNull();
  expect(pendingSoloExit(first, room)).toEqual({ roomId, soloPlayId: attempt });
});

test("a genuine tab exit remains retryable until confirmed and stale exits do not target a new attempt", () => {
  const storage = tabStorage();
  const exit = { roomId, soloPlayId: attempt };
  rememberSoloExit(storage, exit);
  expect(pendingSoloExit(storage, room)).toEqual(exit);
  expect(pendingSoloExit(storage, room)).toEqual(exit);
  clearSoloExit(storage, { roomId, soloPlayId: crypto.randomUUID() });
  expect(pendingSoloExit(storage, room)).toEqual(exit);
  expect(pendingSoloExit(storage, { ...room, soloPlayId: crypto.randomUUID() })).toBeNull();
  expect(pendingSoloExit(storage, room)).toBeNull();
  rememberSoloExit(storage, exit);
  expect(pendingSoloExit(storage, { ...room, id: crypto.randomUUID() })).toBeNull();
  rememberSoloExit(storage, exit);
  expect(pendingSoloExit(storage, { ...room, soloStarted: false })).toBeNull();
  rememberSoloExit(storage, exit);
  clearSoloExit(storage, exit);
  expect(pendingSoloExit(storage, room)).toBeNull();
});


test("stored exit data only restores the exact active server room and returns canonical fields", () => {
  const storage = tabStorage();
  for (const value of ["invalid json", "null", "42", "[]", "{}", JSON.stringify({ roomId }), JSON.stringify({ roomId, soloPlayId: 123 }), JSON.stringify({ roomId: "wrong", soloPlayId: attempt })]) {
    storage.setItem("festival_solo_exit", value);
    expect(pendingSoloExit(storage, room)).toBeNull();
    if (value !== "invalid json") expect(storage.getItem("festival_solo_exit")).toBeNull();
  }
  storage.setItem("festival_solo_exit", JSON.stringify({ roomId, soloPlayId: attempt, extra: "ignored" }));
  expect(pendingSoloExit(storage, room)).toEqual({ roomId, soloPlayId: attempt });
  const legacy = { ...room, soloPlayId: null };
  storage.setItem("festival_solo_exit", JSON.stringify({ roomId, soloPlayId: null }));
  expect(pendingSoloExit(storage, legacy)).toEqual({ roomId, soloPlayId: null });
});
