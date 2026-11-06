import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Guest } from "@festival/shared";
import type { State } from "../../modules/game/model";
export type { Room, Session, State } from "../../modules/game/model";
export class Store {
  db: Database;
  state: State;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path, { create: true });
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS google_accounts (subject TEXT PRIMARY KEY, guest_id TEXT NOT NULL UNIQUE); CREATE TABLE IF NOT EXISTS credentials (hash TEXT PRIMARY KEY, guest_id TEXT NOT NULL, expires INTEGER NOT NULL);",
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
  authenticateSession(token: string | undefined) {
    if (!token) return null;
    const row = this.db
      .query("SELECT guest_id FROM credentials WHERE hash=? AND expires>?")
      .get(digest(token), Date.now()) as { guest_id: string } | null;
    return row ? (this.state.guests[row.guest_id] ?? null) : null;
  }
  authenticate(token: string | undefined) {
    const me = this.authenticateSession(token);
    return me?.nickname ? me : null;
  }
  accountType(id: string) {
    return this.db.query("SELECT 1 FROM google_accounts WHERE guest_id=?").get(id) ? "google" : "guest";
  }
  nicknameAvailable(nickname: string, exceptId?: string) {
    const key = nickname.normalize("NFKC").toLowerCase();
    return !Object.values(this.state.guests).some((guest) =>
      guest.id !== exceptId && guest.nickname.normalize("NFKC").toLowerCase() === key,
    );
  }
  createGuest(nickname: string): Guest {
    if (!this.nicknameAvailable(nickname)) throw Error("이미 사용 중인 닉네임이야.");
    const me = { id: crypto.randomUUID(), nickname };
    this.state.guests[me.id] = me;
    try { this.save(); } catch (error) { delete this.state.guests[me.id]; throw error; }
    return me;
  }
  googleAccount(subject: string): Guest {
    const row = this.db.query("SELECT guest_id FROM google_accounts WHERE subject=?").get(subject) as { guest_id: string } | null;
    if (row && this.state.guests[row.guest_id]) return this.state.guests[row.guest_id]!;
    const me = { id: crypto.randomUUID(), nickname: "" };
    try {
      this.db.transaction(() => {
        this.db.query("INSERT INTO google_accounts VALUES(?,?)").run(subject, me.id);
        this.state.guests[me.id] = me;
        this.save();
      })();
    } catch (error) { delete this.state.guests[me.id]; throw error; }
    return me;
  }
  inRoom(id: string) {
    return Object.values(this.state.rooms).some((room) => room.memberIds.includes(id));
  }
  rename(me: Guest, nickname: string) {
    if (!this.nicknameAvailable(nickname, me.id)) throw Error("이미 사용 중인 닉네임이야.");
    const previous = me.nickname;
    try {
      this.db.transaction(() => {
        me.nickname = nickname;
        if (this.db.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='workshop_drafts'").get())
          this.db.query("UPDATE workshop_drafts SET author_name=? WHERE owner_id=?").run(nickname, me.id);
        this.save();
      })();
    } catch (error) { me.nickname = previous; throw error; }
  }
  logout(me: Guest) {
    try {
      this.db.transaction(() => {
        this.db.query("DELETE FROM credentials WHERE guest_id=?").run(me.id);
        if (this.accountType(me.id) === "guest") {
          // Published guest work must not remain under an irrecoverable identity.
          if (this.db.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='workshop_drafts'").get()) {
            this.db.query("DELETE FROM workshop_favorites WHERE guest_id=? OR story_id IN (SELECT id FROM workshop_drafts WHERE owner_id=?)").run(me.id, me.id);
            this.db.query("DELETE FROM workshop_drafts WHERE owner_id=?").run(me.id);
          }
          delete this.state.guests[me.id];
          this.save();
        }
      })();
    } catch (error) { this.state.guests[me.id] = me; throw error; }
  }
  close() {
    this.db.close();
  }
}
