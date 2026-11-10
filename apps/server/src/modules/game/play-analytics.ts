import type { Database } from "bun:sqlite";
import type { PlayEvent } from "@festival/shared";

type Play = {
  id: string;
  story_id: string;
  version: number;
  mode: string;
  room_id: string | null;
  started: number;
  ended: number | null;
  outcome: string | null;
  correct: number | null;
  timing_status: "complete" | "partial";
  public_json: string;
  result_json: string | null;
};
type Member = {
  user_id: string;
  role: string;
  ending_at: number | null;
  finished_at: number | null;
  rating: number | null;
  stage: string;
  last_seen: number;
  visible: number;
  sequence: number;
};
export class PlayAnalytics {
  private readonly legacyEpoch: number;
  constructor(
    readonly db: Database,
    private readonly now = () => Date.now(),
  ) {
    db.exec(`CREATE TABLE IF NOT EXISTS play_migration(id INTEGER PRIMARY KEY CHECK(id=1),epoch INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS play_sessions(id TEXT PRIMARY KEY,story_id TEXT NOT NULL,version INTEGER NOT NULL,mode TEXT NOT NULL,room_id TEXT,started INTEGER NOT NULL,ended INTEGER,outcome TEXT,public_json TEXT NOT NULL,result_json TEXT);
      CREATE INDEX IF NOT EXISTS play_story_version ON play_sessions(story_id,version,started);
      CREATE INDEX IF NOT EXISTS play_room_end ON play_sessions(room_id,ended);
      CREATE TABLE IF NOT EXISTS play_members(session_id TEXT NOT NULL,user_id TEXT NOT NULL,role TEXT NOT NULL,prior_plays INTEGER NOT NULL,mmr REAL,mmr_version TEXT NOT NULL,ending_at INTEGER,finished_at INTEGER,rating INTEGER,stage TEXT NOT NULL,last_seen INTEGER NOT NULL,visible INTEGER NOT NULL DEFAULT 1,sequence INTEGER NOT NULL DEFAULT -1,PRIMARY KEY(session_id,user_id));
      CREATE INDEX IF NOT EXISTS play_user ON play_members(user_id,session_id);
      CREATE TABLE IF NOT EXISTS play_events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL,session_id TEXT NOT NULL,user_id TEXT NOT NULL,type TEXT NOT NULL,stage TEXT NOT NULL,target TEXT,at INTEGER NOT NULL,source TEXT NOT NULL,payload TEXT NOT NULL,UNIQUE(session_id,user_id,id));
      CREATE INDEX IF NOT EXISTS play_event_session ON play_events(session_id,sequence);
      CREATE INDEX IF NOT EXISTS play_event_rate ON play_events(session_id,user_id,at);
      CREATE INDEX IF NOT EXISTS play_event_at ON play_events(at);
      CREATE INDEX IF NOT EXISTS play_ended ON play_sessions(ended);
      CREATE TABLE IF NOT EXISTS play_visits(id INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT NOT NULL,user_id TEXT NOT NULL,stage TEXT NOT NULL,entered INTEGER NOT NULL,exited INTEGER,active_ms INTEGER NOT NULL DEFAULT 0,unmeasured_ms INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS play_open_visit ON play_visits(session_id,user_id,exited);
      CREATE TABLE IF NOT EXISTS play_devices(session_id TEXT NOT NULL,user_id TEXT NOT NULL,client_id TEXT NOT NULL,sequence INTEGER NOT NULL,PRIMARY KEY(session_id,user_id,client_id));
      CREATE TABLE IF NOT EXISTS play_ui_visits(id INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT NOT NULL,user_id TEXT NOT NULL,client_id TEXT NOT NULL,stage TEXT NOT NULL,entered INTEGER NOT NULL,exited INTEGER,active_ms INTEGER NOT NULL DEFAULT 0,unmeasured_ms INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS play_ui_open ON play_ui_visits(session_id,user_id,client_id,exited);
      CREATE TABLE IF NOT EXISTS play_action_totals(session_id TEXT NOT NULL,user_id TEXT NOT NULL,stage TEXT NOT NULL,type TEXT NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(session_id,user_id,stage,type));
      CREATE TABLE IF NOT EXISTS play_skill(user_id TEXT PRIMARY KEY,completed INTEGER NOT NULL,wins INTEGER NOT NULL,mmr REAL);
    `);
    if (
      !(
        db.query("PRAGMA table_info(play_skill)").all() as { name: string }[]
      ).some((column) => column.name === "updated")
    )
      db.exec(
        "ALTER TABLE play_skill ADD COLUMN updated INTEGER NOT NULL DEFAULT 0",
      );
    db.query("INSERT OR IGNORE INTO play_migration VALUES(1,?)").run(
      this.now(),
    );
    this.legacyEpoch = (
      db.query("SELECT epoch FROM play_migration WHERE id=1").get() as {
        epoch: number;
      }
    ).epoch;
    const devices = db.query("PRAGMA table_info(play_devices)").all() as {
      name: string;
    }[];
    if (!devices.some((column) => column.name === "last_seen"))
      db.exec(
        "ALTER TABLE play_devices ADD COLUMN last_seen INTEGER NOT NULL DEFAULT 0",
      );
    if (!devices.some((column) => column.name === "visible"))
      db.exec(
        "ALTER TABLE play_devices ADD COLUMN visible INTEGER NOT NULL DEFAULT 0",
      );
    if (
      !(
        db.query("PRAGMA table_info(play_sessions)").all() as { name: string }[]
      ).some((column) => column.name === "correct")
    )
      db.exec("ALTER TABLE play_sessions ADD COLUMN correct INTEGER");
    if (
      !(
        db.query("PRAGMA table_info(play_members)").all() as { name: string }[]
      ).some((column) => column.name === "prior_plays_scope")
    )
      db.exec(
        "ALTER TABLE play_members ADD COLUMN prior_plays_scope TEXT NOT NULL DEFAULT 'retained_365_days'",
      );
    if (
      !(
        db.query("PRAGMA table_info(play_sessions)").all() as { name: string }[]
      ).some((column) => column.name === "timing_status")
    )
      db.exec(
        "ALTER TABLE play_sessions ADD COLUMN timing_status TEXT NOT NULL DEFAULT 'complete'",
      );
    db.exec(
      "INSERT OR IGNORE INTO play_action_totals SELECT session_id,user_id,stage,type,count(*) FROM play_events GROUP BY session_id,user_id,stage,type",
    );
  }
  atomic<T>(run: () => T): T {
    return this.db.transaction(run).immediate();
  }
  start(
    id: string,
    storyId: string,
    version: number,
    mode: "solo" | "multiplayer",
    roomId: string | null,
    participants: { id: string; role: string }[],
    publicInfo: unknown,
  ) {
    this.atomic(() => {
      const now = this.now();
      this.db
        .query(
          "INSERT INTO play_sessions(id,story_id,version,mode,room_id,started,ended,outcome,public_json,result_json) VALUES(?,?,?,?,?,?,NULL,NULL,?,NULL)",
        )
        .run(
          id,
          storyId,
          version,
          mode,
          roomId,
          now,
          JSON.stringify(publicInfo),
        );
      for (const p of participants) {
        const previous = this.db
          .query(
            "SELECT count(*) AS n FROM play_members m JOIN play_sessions s ON s.id=m.session_id WHERE m.user_id=? AND s.story_id=?",
          )
          .get(p.id, storyId) as { n: number };
        const skill = this.db
          .query("SELECT mmr FROM play_skill WHERE user_id=?")
          .get(p.id) as { mmr: number | null } | null;
        const stage = mode === "solo" ? "intro" : "briefing";
        this.db
          .query(
            "INSERT INTO play_members(session_id,user_id,role,prior_plays,mmr,mmr_version,stage,last_seen) VALUES(?,?,?,?,?,'performance-v1',?,?)",
          )
          .run(id, p.id, p.role, previous.n, skill?.mmr ?? null, stage, now);
        this.db
          .query(
            "INSERT INTO play_visits(session_id,user_id,stage,entered) VALUES(?,?,?,?)",
          )
          .run(id, p.id, stage, now);
        this.record(id, p.id, "started", stage, null, {
          priorPlays: previous.n,
          historyWindowDays: 365,
          firstEverPlay: null,
        });
      }
    });
  }
  canClaimLegacy(startedAt: number, lastActiveAt: number) {
    return (
      Number.isFinite(startedAt) &&
      Number.isFinite(lastActiveAt) &&
      lastActiveAt >= this.now() - 365 * 86400000 &&
      startedAt <= this.legacyEpoch &&
      this.now() <= this.legacyEpoch + 86400000
    );
  }
  markLegacy(id: string, startedAt: number, endedAt: number | null) {
    const wasPartial = this.play(id)?.timing_status === "partial";
    this.db
      .query(
        "UPDATE play_sessions SET timing_status='partial',started=?,ended=COALESCE(?,ended) WHERE id=?",
      )
      .run(startedAt, endedAt, id);
    if (!wasPartial)
      this.record(
        id,
        this.members(id)[0].user_id,
        "legacy_recovered",
        "migration",
        null,
        { historicalStageTiming: "unknown" },
      );
  }
  cleanupLegacy() {
    if (
      !this.db
        .query(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name='story_runs'",
        )
        .get()
    )
      return;
    if (this.now() <= this.legacyEpoch + 86400000) return;
    this.db
      .query(
        "UPDATE story_runs SET ended_at=last_active_at,outcome='abandoned',package_json=NULL WHERE ended_at IS NULL AND NOT EXISTS(SELECT 1 FROM play_sessions WHERE play_sessions.id=story_runs.id) AND (last_active_at<? OR started_at<=?)",
      )
      .run(
        new Date(this.now() - 1800000).toISOString(),
        new Date(this.legacyEpoch).toISOString(),
      );
  }
  resume(user: string, story: string, roomId: string | null) {
    return this.db
      .query(
        "SELECT s.id FROM play_sessions s JOIN play_members m ON m.session_id=s.id WHERE m.user_id=? AND s.story_id=? AND m.finished_at IS NULL AND (s.outcome IS NULL OR s.outcome<>'abandoned') AND (? IS NULL OR s.room_id=?) ORDER BY s.started DESC LIMIT 1",
      )
      .get(user, story, roomId, roomId) as { id: string } | null;
  }
  activeForRoom(roomId: string) {
    return this.db
      .query(
        "SELECT * FROM play_sessions WHERE room_id=? AND ended IS NULL ORDER BY started DESC LIMIT 1",
      )
      .get(roomId) as Play | null;
  }
  endedForRoom(roomId: string) {
    return this.db
      .query(
        "SELECT * FROM play_sessions WHERE room_id=? AND ended IS NOT NULL ORDER BY ended DESC LIMIT 1",
      )
      .get(roomId) as Play | null;
  }
  active(user: string, story: string) {
    return this.db
      .query(
        "SELECT s.* FROM play_sessions s JOIN play_members m ON m.session_id=s.id WHERE m.user_id=? AND s.story_id=? AND s.mode='solo' AND s.ended IS NULL ORDER BY s.started DESC LIMIT 1",
      )
      .get(user, story) as Play | null;
  }
  pending(user: string) {
    const row = this.db
      .query(
        "SELECT s.id FROM play_sessions s JOIN play_members m ON m.session_id=s.id WHERE m.user_id=? AND s.ended IS NOT NULL AND s.outcome<>'abandoned' AND m.finished_at IS NULL ORDER BY s.ended DESC LIMIT 1",
      )
      .get(user) as { id: string } | null;
    return row?.id ?? null;
  }
  play(id: string) {
    return this.db
      .query("SELECT * FROM play_sessions WHERE id=?")
      .get(id) as Play | null;
  }
  member(id: string, user: string) {
    const member = this.db
      .query("SELECT * FROM play_members WHERE session_id=? AND user_id=?")
      .get(id, user) as Member | null;
    if (!member) throw new Error("본인의 플레이만 확인할 수 있어.");
    return member;
  }
  private tally(
    id: string,
    user: string,
    type: string,
    stage: string,
    inserted: number,
  ) {
    if (!inserted) return;
    this.db
      .query(
        "INSERT INTO play_action_totals VALUES(?,?,?,?,1) ON CONFLICT(session_id,user_id,stage,type) DO UPDATE SET count=count+1",
      )
      .run(id, user, stage, type);
  }
  record(
    id: string,
    user: string,
    type: string,
    stage: string,
    target: string | null = null,
    payload: unknown = {},
  ) {
    this.atomic(() => {
      const result = this.db
        .query(
          "INSERT INTO play_events(id,session_id,user_id,type,stage,target,at,source,payload) VALUES(?,?,?,?,?,?,?,'server',?)",
        )
        .run(
          crypto.randomUUID(),
          id,
          user,
          type,
          stage,
          target,
          this.now(),
          JSON.stringify(payload),
        );
      this.tally(id, user, type, stage, result.changes);
    });
  }
  private accountTime(id: string, user: string, member: Member, now: number) {
    const elapsed = Math.max(0, now - member.last_seen);
    const measured = elapsed <= 30000;
    this.db
      .query(
        "UPDATE play_visits SET active_ms=active_ms+?,unmeasured_ms=unmeasured_ms+? WHERE session_id=? AND user_id=? AND exited IS NULL",
      )
      .run(
        member.visible && measured ? elapsed : 0,
        measured ? 0 : elapsed,
        id,
        user,
      );
    this.db
      .query(
        "UPDATE play_members SET last_seen=? WHERE session_id=? AND user_id=?",
      )
      .run(now, id, user);
  }
  events(id: string, user: string, events: PlayEvent[]) {
    this.member(id, user);
    const recent = this.db
      .query(
        "SELECT count(*) AS n FROM play_events WHERE session_id=? AND user_id=? AND source='client' AND at>?",
      )
      .get(id, user, this.now() - 10000) as { n: number };
    if (recent.n + events.length > 200)
      throw new Error("기록 요청이 너무 빨라. 잠시 기다려 줘.");
    this.atomic(() => {
      const play = this.play(id);
      if (!play) throw new Error("플레이를 찾을 수 없어.");
      for (const event of events) this.receiveEvent(id, user, event);
    });
  }
  private receiveEvent(id: string, user: string, event: PlayEvent) {
    const member = this.member(id, user);
    if (member.finished_at) return;
    const inserted = this.db
      .query(
        "INSERT OR IGNORE INTO play_events(id,session_id,user_id,type,stage,target,at,source,payload) VALUES(?,?,?,?,?,?,?,'client',?)",
      )
      .run(
        event.id,
        id,
        user,
        event.type,
        event.stage,
        event.target ?? null,
        this.now(),
        JSON.stringify({
          schemaVersion: 1,
          sequence: event.sequence,
          clientId: event.clientId,
          clientAt: event.clientAt,
          sceneId: event.sceneId,
          visible: event.visible,
        }),
      );
    this.tally(id, user, event.type, event.stage, inserted.changes);
    const device = event.clientId ?? "legacy";
    const previous = this.db
      .query(
        "SELECT sequence,visible,last_seen FROM play_devices WHERE session_id=? AND user_id=? AND client_id=?",
      )
      .get(id, user, device) as {
      sequence: number;
      visible: number;
      last_seen: number;
    } | null;
    if (!inserted.changes || event.sequence <= (previous?.sequence ?? -1))
      return;
    this.db
      .query(
        "INSERT INTO play_devices(session_id,user_id,client_id,sequence,last_seen,visible) VALUES(?,?,?,?,?,?) ON CONFLICT(session_id,user_id,client_id) DO UPDATE SET sequence=excluded.sequence,last_seen=excluded.last_seen,visible=excluded.visible",
      )
      .run(
        id,
        user,
        device,
        event.sequence,
        this.now(),
        this.eventVisibility(event, previous?.visible ?? member.visible),
      );
    const now = this.now();
    this.accountTime(id, user, member, now);
    // Observed UI visits never replace the authoritative member stage.
    this.observeVisit(
      id,
      user,
      event,
      previous?.visible ?? 0,
      previous?.last_seen ?? now,
    );
    const visible = !!this.db
      .query(
        "SELECT 1 FROM play_devices WHERE session_id=? AND user_id=? AND visible=1 AND last_seen>? LIMIT 1",
      )
      .get(id, user, now - 30000);
    this.db
      .query(
        "UPDATE play_members SET visible=? WHERE session_id=? AND user_id=?",
      )
      .run(visible ? 1 : 0, id, user);
    this.db
      .query(
        "UPDATE play_members SET sequence=? WHERE session_id=? AND user_id=?",
      )
      .run(event.sequence, id, user);
  }
  private eventVisibility(event: PlayEvent, previous: number) {
    if (event.visible === undefined) return previous;
    return event.visible ? 1 : 0;
  }
  private observeVisit(
    id: string,
    user: string,
    event: PlayEvent,
    visible: number,
    lastSeen: number,
  ) {
    const play = this.play(id);
    if (
      play?.ended &&
      !["win", "fail", "reveal", "rating"].includes(event.stage)
    )
      return;
    const client = event.clientId ?? "legacy",
      now = this.now();
    const previous = this.db
      .query(
        "SELECT id,stage,entered FROM play_ui_visits WHERE session_id=? AND user_id=? AND client_id=? AND exited IS NULL",
      )
      .get(id, user, client) as {
      id: number;
      stage: string;
      entered: number;
    } | null;
    const elapsed = Math.max(0, now - lastSeen);
    if (previous)
      this.db
        .query(
          "UPDATE play_ui_visits SET active_ms=active_ms+?,unmeasured_ms=unmeasured_ms+? WHERE id=?",
        )
        .run(
          visible && elapsed <= 30000 ? elapsed : 0,
          elapsed > 30000 ? elapsed : 0,
          previous.id,
        );
    if (previous?.stage === event.stage) return;
    if (previous)
      this.db
        .query("UPDATE play_ui_visits SET exited=? WHERE id=?")
        .run(now, previous.id);
    this.db
      .query(
        "INSERT INTO play_ui_visits(session_id,user_id,client_id,stage,entered) VALUES(?,?,?,?,?)",
      )
      .run(id, user, client, event.stage, now);
  }
  private closeObservedVisits(id: string, at: number, user?: string) {
    const visits = this.db
      .query(
        `SELECT v.id,v.entered,d.last_seen,d.visible FROM play_ui_visits v LEFT JOIN play_devices d ON d.session_id=v.session_id AND d.user_id=v.user_id AND d.client_id=v.client_id WHERE v.session_id=? AND v.exited IS NULL AND (? IS NULL OR v.user_id=?)`,
      )
      .all(id, user ?? null, user ?? null) as {
      id: number;
      entered: number;
      last_seen: number | null;
      visible: number | null;
    }[];
    for (const visit of visits) {
      const elapsed = Math.max(
        0,
        at - Math.max(visit.entered, visit.last_seen ?? visit.entered),
      );
      this.db
        .query(
          "UPDATE play_ui_visits SET exited=?,active_ms=active_ms+?,unmeasured_ms=unmeasured_ms+? WHERE id=?",
        )
        .run(
          at,
          visit.visible && elapsed <= 30000 ? elapsed : 0,
          elapsed > 30000 ? elapsed : 0,
          visit.id,
        );
    }
  }
  stage(id: string, user: string, stage: string, at = this.now()) {
    const member = this.member(id, user);
    if (member.stage === stage) return;
    this.accountTime(id, user, member, at);
    this.db
      .query(
        "UPDATE play_visits SET exited=? WHERE session_id=? AND user_id=? AND exited IS NULL",
      )
      .run(at, id, user);
    this.db
      .query(
        "INSERT INTO play_visits(session_id,user_id,stage,entered) VALUES(?,?,?,?)",
      )
      .run(id, user, stage, at);
    this.db
      .query("UPDATE play_members SET stage=? WHERE session_id=? AND user_id=?")
      .run(stage, id, user);
    this.record(id, user, "stage_entered", stage, null, { effectiveAt: at });
  }
  finish(
    id: string,
    outcome: "completed" | "failed" | "abandoned",
    result: unknown,
    correct: boolean | null = null,
  ) {
    this.atomic(() => {
      const play = this.play(id);
      if (play?.ended !== null) return;
      const now =
        outcome === "abandoned"
          ? Math.max(
              play.started,
              ...this.members(id).map((member) => member.last_seen),
            )
          : this.now();
      const correctness =
        play.mode === "solo" && outcome !== "abandoned"
          ? outcome === "completed"
          : correct;
      this.db
        .query(
          "UPDATE play_sessions SET ended=?,outcome=?,result_json=?,correct=? WHERE id=?",
        )
        .run(
          now,
          outcome,
          JSON.stringify(result),
          correctness === null ? null : Number(correctness),
          id,
        );
      if (
        outcome === "abandoned" &&
        this.db
          .query(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='story_runs'",
          )
          .get()
      )
        this.db
          .query(
            "UPDATE story_runs SET ended_at=?,last_active_at=?,outcome='abandoned',package_json=NULL WHERE id=? AND ended_at IS NULL",
          )
          .run(new Date(now).toISOString(), new Date(now).toISOString(), id);
      this.closeObservedVisits(id, now);
      for (const { user_id } of this.members(id))
        this.finishMember(play, user_id, outcome, now);
    });
  }
  private finishMember(
    play: Play,
    user: string,
    outcome: "completed" | "failed" | "abandoned",
    now: number,
  ) {
    let stage = play.mode === "solo" ? "win" : "reveal";
    if (outcome === "abandoned") stage = "abandoned";
    else if (outcome === "failed") stage = "fail";
    this.stage(play.id, user, stage, now);
    this.record(play.id, user, "result", outcome, null, {
      outcome,
      effectiveEndedAt: now,
    });
    if (
      play.mode !== "solo" ||
      outcome === "abandoned" ||
      play.timing_status === "partial"
    )
      return;
    this.db
      .query(
        "INSERT INTO play_skill(user_id,completed,wins,mmr,updated) VALUES(?,1,?,NULL,?) ON CONFLICT(user_id) DO UPDATE SET completed=completed+1,wins=wins+excluded.wins,updated=excluded.updated",
      )
      .run(user, outcome === "completed" ? 1 : 0, now);
    this.db
      .query(
        "UPDATE play_skill SET mmr=CASE WHEN completed>=3 THEN 800.0+400.0*wins/completed ELSE NULL END WHERE user_id=?",
      )
      .run(user);
  }
  members(id: string) {
    return this.db
      .query("SELECT * FROM play_members WHERE session_id=?")
      .all(id) as Member[];
  }
  ending(id: string, user: string, action: "completed" | "skipped") {
    this.atomic(() => {
      const play = this.play(id),
        member = this.member(id, user);
      if (!play?.ended || play.outcome === "abandoned")
        throw new Error("결말을 확인할 수 없는 플레이야.");
      if (!member.ending_at) {
        const result = JSON.parse(play.result_json ?? "null");
        const required = Array.isArray(result?.cues) ? result.cues.length : 0;
        if (
          action === "completed" &&
          required > 0 &&
          this.view(id, user).cueIndex < required
        )
          throw new Error("결말을 끝까지 보거나 명시적으로 건너뛰어 줘.");
        this.record(
          id,
          user,
          action === "skipped" ? "ending_skipped" : "ending_acknowledged",
          member.stage,
          null,
          { action },
        );
        this.db
          .query(
            "UPDATE play_members SET ending_at=? WHERE session_id=? AND user_id=?",
          )
          .run(this.now(), id, user);
        this.closeObservedVisits(id, this.now(), user);
        this.stage(id, user, "rating");
        this.record(id, user, "ending_completed", "rating");
      }
    });
  }
  rate(id: string, user: string, rating: number | null) {
    if (
      rating !== null &&
      (!Number.isInteger(rating) || rating < 1 || rating > 5)
    )
      throw new Error("평점은 1점부터 5점까지 입력해 줘.");
    this.atomic(() => {
      const play = this.play(id),
        member = this.member(id, user);
      if (!play?.ended || play.outcome === "abandoned" || !member.ending_at)
        throw new Error("결말을 다 본 뒤 평가해 줘.");
      if (member.finished_at) return;
      const now = this.now();
      this.accountTime(id, user, member, now);
      this.db
        .query(
          "UPDATE play_members SET rating=?,finished_at=? WHERE session_id=? AND user_id=?",
        )
        .run(rating, now, id, user);
      this.db
        .query(
          "UPDATE play_visits SET exited=? WHERE session_id=? AND user_id=? AND exited IS NULL",
        )
        .run(now, id, user);
      if (
        rating !== null &&
        play.mode === "solo" &&
        this.db
          .query(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='story_ratings'",
          )
          .get()
      )
        this.db
          .query(
            "INSERT INTO story_ratings(run_id,story_id,rating,created_at) VALUES(?,?,?,?) ON CONFLICT(run_id) DO UPDATE SET rating=excluded.rating,created_at=excluded.created_at",
          )
          .run(id, play.story_id, rating, new Date(now).toISOString());
      this.closeObservedVisits(id, now, user);
      this.record(
        id,
        user,
        rating === null ? "rating_skipped" : "rating_submitted",
        "rating",
        null,
        { rating },
      );
    });
  }
  view(id: string, user: string) {
    const play = this.play(id),
      member = this.member(id, user);
    if (!play) throw new Error("플레이를 찾을 수 없어.");
    const cue = this.db
      .query(
        "SELECT max(CAST(target AS INTEGER)) AS target FROM play_events WHERE session_id=? AND user_id=? AND type IN ('cue_next','cue_skip','cue_complete') AND json_extract(payload,'$.sceneId')='resolution' AND stage IN ('win','fail','reveal') AND target<>'' AND target NOT GLOB '*[^0-9]*' AND at>=?",
      )
      .get(id, user, play.ended ?? this.now()) as {
      target: number | null;
    } | null;
    return {
      cueIndex: cue?.target == null ? 0 : cue.target + 1,
      id: play.id,
      storyId: play.story_id,
      version: play.version,
      mode: play.mode,
      ended: play.ended,
      outcome: play.outcome,
      correct: play.correct,
      publicInfo: JSON.parse(play.public_json),
      result: play.ended ? JSON.parse(play.result_json ?? "null") : null,
      endingComplete: !!member.ending_at,
      finished: !!member.finished_at,
      rating: member.rating,
      stage: member.stage,
    };
  }
  chat(id: string, user: string, eventId: string, text: string, stage: string) {
    const play = this.play(id);
    this.member(id, user);
    if (!play || play.mode !== "multiplayer" || play.ended)
      throw new Error("진행 중인 게임에서만 채팅할 수 있어.");
    const recent = this.db
      .query(
        "SELECT count(*) AS n FROM play_events WHERE session_id=? AND user_id=? AND type='chat' AND at>?",
      )
      .get(id, user, this.now() - 10000) as { n: number };
    if (recent.n >= 10)
      throw new Error("채팅을 너무 빠르게 보내고 있어. 잠시 기다려 줘.");
    this.atomic(() => {
      const result = this.db
        .query(
          "INSERT OR IGNORE INTO play_events(id,session_id,user_id,type,stage,target,at,source,payload) VALUES(?,?,?,'chat',?,NULL,?,'server',?)",
        )
        .run(
          eventId,
          id,
          user,
          stage,
          this.now(),
          JSON.stringify({ text, channel: "room" }),
        );
      this.tally(id, user, "chat", stage, result.changes);
    });
  }
  chats(id: string, user: string) {
    this.member(id, user);
    return (
      this.db
        .query(
          "SELECT sequence,user_id,payload,at FROM play_events WHERE session_id=? AND type='chat' ORDER BY sequence DESC LIMIT 100",
        )
        .all(id) as {
        sequence: number;
        user_id: string;
        payload: string;
        at: number;
      }[]
    )
      .reverse()
      .map((row) => ({
        sequence: row.sequence,
        userId: row.user_id,
        text: JSON.parse(row.payload).text,
        at: row.at,
      }));
  }
  stale() {
    return (
      this.db
        .query(
          "SELECT s.id FROM play_sessions s JOIN play_members m ON m.session_id=s.id WHERE s.ended IS NULL GROUP BY s.id HAVING max(m.last_seen)<?",
        )
        .all(this.now() - 1800000) as { id: string }[]
    ).map((row) => row.id);
  }
  pruneRetention() {
    this.atomic(() => {
      this.db
        .query("DELETE FROM play_events WHERE at<?")
        .run(this.now() - 90 * 86400000);
      const cutoff = this.now() - 365 * 86400000;
      for (const table of [
        "play_events",
        "play_visits",
        "play_ui_visits",
        "play_action_totals",
        "play_devices",
        "play_members",
      ])
        this.db
          .query(
            `DELETE FROM ${table} WHERE session_id IN (SELECT id FROM play_sessions WHERE ended<?)`,
          )
          .run(cutoff);
      if (
        this.db
          .query(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='story_ratings'",
          )
          .get()
      )
        this.db
          .query("DELETE FROM story_ratings WHERE created_at<?")
          .run(new Date(cutoff).toISOString());
      if (
        this.db
          .query(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='story_run_events'",
          )
          .get()
      )
        this.db
          .query("DELETE FROM story_run_events WHERE occurred_at<?")
          .run(new Date(this.now() - 90 * 86400000).toISOString());
      this.db.query("DELETE FROM play_sessions WHERE ended<?").run(cutoff);
      this.db.query("DELETE FROM play_skill WHERE updated<?").run(cutoff);
    });
  }
  report(storyId: string, version?: number) {
    const sessions = this.db
      .query(
        "SELECT id,version,mode,started,ended,outcome,correct,timing_status FROM play_sessions WHERE story_id=? AND (? IS NULL OR version=?) ORDER BY started DESC LIMIT 500",
      )
      .all(storyId, version ?? null, version ?? null);
    const stages = this.db
      .query(
        `SELECT s.version,v.stage,count(*) visits,avg(v.exited-v.entered) averageMs,min(v.exited-v.entered) minMs,max(v.exited-v.entered) maxMs,avg(v.active_ms) averageActiveMs,sum(v.unmeasured_ms) unmeasuredMs FROM play_visits v JOIN play_sessions s ON s.id=v.session_id WHERE s.story_id=? AND s.timing_status='complete' AND (? IS NULL OR s.version=?) GROUP BY s.version,v.stage`,
      )
      .all(storyId, version ?? null, version ?? null);
    const skills = this.db
      .query(
        `SELECT s.version,CASE WHEN m.mmr IS NULL THEN 'unrated' ELSE CAST(round(m.mmr/100)*100 AS TEXT) END skillBand,count(*) plays,avg(CASE WHEN s.ended IS NULL THEN NULL WHEN s.outcome='abandoned' THEN 0.0 ELSE 1.0 END) completionRate,avg(s.correct) successRate,count(s.correct) assessedPlays,avg(CASE WHEN s.timing_status='complete' THEN s.ended-s.started END) averageMs,avg(m.rating) averageRating FROM play_members m JOIN play_sessions s ON s.id=m.session_id WHERE s.story_id=? AND (? IS NULL OR s.version=?) GROUP BY s.version,skillBand`,
      )
      .all(storyId, version ?? null, version ?? null);
    const actions = this.db
      .query(
        "SELECT s.version,e.stage,e.type,sum(e.count) count FROM play_action_totals e JOIN play_sessions s ON s.id=e.session_id WHERE s.story_id=? AND (? IS NULL OR s.version=?) GROUP BY s.version,e.stage,e.type",
      )
      .all(storyId, version ?? null, version ?? null);
    const timings = this.db
      .query(
        "SELECT v.stage,s.version,v.exited-v.entered duration FROM play_visits v JOIN play_sessions s ON s.id=v.session_id WHERE s.story_id=? AND s.timing_status='complete' AND (? IS NULL OR s.version=?) AND v.exited IS NOT NULL ORDER BY v.id DESC LIMIT 10000",
      )
      .all(storyId, version ?? null, version ?? null) as {
      stage: string;
      version: number;
      duration: number;
    }[];
    const groups = new Map<string, number[]>();
    for (const row of timings) {
      const key = `${row.version}:${row.stage}`;
      const values = groups.get(key) ?? [];
      values.push(row.duration);
      groups.set(key, values);
    }
    const distributions = [...groups].map(([stageVersion, values]) => {
      values.sort((a, b) => a - b);
      return {
        stageVersion,
        samples: values.length,
        p50Ms: values[Math.floor((values.length - 1) * 0.5)],
        p90Ms: values[Math.floor((values.length - 1) * 0.9)],
      };
    });
    const observedStages = this.db
      .query(
        "SELECT s.version,v.stage,count(*) visits,avg(v.exited-v.entered) averageMs FROM play_ui_visits v JOIN play_sessions s ON s.id=v.session_id WHERE s.story_id=? AND s.timing_status='complete' AND (? IS NULL OR s.version=?) GROUP BY s.version,v.stage",
      )
      .all(storyId, version ?? null, version ?? null);
    return {
      schemaVersion: 1,
      historyWindowDays: 365,
      sessions,
      stages,
      observedStages,
      skills,
      actions,
      distributions,
      distributionSampleLimit: 10000,
    };
  }
}
