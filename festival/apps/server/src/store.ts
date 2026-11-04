import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Guest } from "@festival/shared";
export type Room = {
  id: string;
  code: string;
  hostId: string;
  scenarioId: string;
  memberIds: string[];
  sessionId: string | null;
};
export type Session = {
  id: string;
  roomId: string;
  scenarioId: string;
  scenarioVersion: number;
  participants: { id: string; nickname: string; roleIndex: number }[];
  phase: "briefing" | "discussion" | "voting" | "reveal";
  votes: Record<string, string>;
  endedAt: string | null;
};
export type State = {
  guests: Record<string, Guest>;
  rooms: Record<string, Room>;
  sessions: Record<string, Session>;
};
export class Store {
  db: Database;
  state: State;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path, { create: true });
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS credentials (hash TEXT PRIMARY KEY, guest_id TEXT NOT NULL, expires INTEGER NOT NULL);",
    );
    const row = this.db.query("SELECT payload FROM state WHERE id=1").get() as {
      payload: string;
    } | null;
    this.state = row
      ? JSON.parse(row.payload)
      : { guests: {}, rooms: {}, sessions: {} };
  }
  save() {
    this.db
      .query(
        "INSERT INTO state(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
      )
      .run(JSON.stringify(this.state));
  }
  issue(guestId: string) {
    const token = crypto.randomUUID() + crypto.randomUUID();
    this.db
      .query("INSERT INTO credentials VALUES(?,?,?)")
      .run(digest(token), guestId, Date.now() + 30 * 86400000);
    return token;
  }
  authenticate(token: string | undefined) {
    if (!token) return null;
    const row = this.db
      .query("SELECT guest_id FROM credentials WHERE hash=? AND expires>?")
      .get(digest(token), Date.now()) as { guest_id: string } | null;
    return row ? (this.state.guests[row.guest_id] ?? null) : null;
  }
  close() {
    this.db.close();
  }
}
