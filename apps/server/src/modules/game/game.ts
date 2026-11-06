import type {
  Command,
  Guest,
  RoomSummary,
  Snapshot,
  RoomView,
} from "@festival/shared";
import type { Room, Session, State } from "./model";
import type { GameStateStore } from "./ports/state-store";
import type { StoryCatalog } from "./story-catalog";
export class Game {
  online = new Map<string, number>();
  constructor(
    public store: GameStateStore,
    private readonly storyCatalog: StoryCatalog,
  ) {}
  get state(): State {
    return this.store.state;
  }
  roomFor(id: string) {
    return Object.values(this.state.rooms).find((r) =>
      r.memberIds.includes(id),
    );
  }
  needRoom(id: string) {
    const r = this.roomFor(id);
    if (!r) throw Error("참여 중인 방이 없어.");
    return r;
  }
  summary(r: Room): RoomSummary {
    const s = this.storyCatalog.get(r.scenarioId)!.scenario;
    return {
      id: r.id,
      code: r.code,
      title: s.title,
      count: r.memberIds.length,
      capacity: s.players,
      status: r.sessionId ? "playing" : "waiting",
    };
  }
  snapshot(me: Guest): Snapshot {
    const r = this.roomFor(me.id);
    let room: RoomView | null = null;
    if (r) {
      const scenario = this.storyCatalog.get(r.scenarioId)!.scenario;
      const session = r.sessionId ? this.state.sessions[r.sessionId] : null;
      const participant = session?.participants.find((p) => p.id === me.id);
      const story = session
        ? this.storyCatalog.get(session.scenarioId, session.scenarioVersion)
        : undefined;
      room = {
        ...this.summary(r),
        hostId: r.hostId,
        scenario,
        members: r.memberIds.map((id) => ({
          ...this.state.guests[id],
          online: (this.online.get(id) ?? 0) > 0,
        })),
        session:
          session && participant
            ? {
                id: session.id,
                scenarioVersion: session.scenarioVersion,
                phase: session.phase,
                role: story?.content.roles[participant.roleIndex] ?? {
                  name: "역할 정보 없음",
                  secret: "이 작품의 역할 정보를 불러오지 못했어.",
                },
                clues:
                  session.phase === "briefing" ? [] : (story?.content.clues ?? []),
                voteCount: Object.keys(session.votes).length,
                hasVoted: !!session.votes[me.id],
                result:
                  session.phase === "reveal"
                    ? {
                        answer: story?.content.answer ?? "결말 정보를 불러오지 못했어.",
                        votes: session.participants.map((p) => ({
                          voter: p.nickname,
                          target:
                            session.participants.find(
                              (t) => t.id === session.votes[p.id],
                            )?.nickname ?? "미투표",
                        })),
                      }
                    : null,
              }
            : null,
      };
    }
    return {
      me,
      scenarios: this.storyCatalog.list(),
      rooms: Object.values(this.state.rooms)
        .map((r) => this.summary(r))
        .filter((room) => room.status === "waiting" && room.count < room.capacity),
      room,
    };
  }
  catalog(query: {
    q?: string;
    origin?: "original" | "demo";
    difficulty?: "easy" | "normal" | "hard" | "unset";
    players?: number;
    sort: "latest" | "rating" | "popular";
    limit: number;
    offset: number;
  }) {
    const playsByStoryVersion = new Map<
      string,
      { started: number; completed: number; players: Set<string> }
    >();
    for (const session of Object.values(this.state.sessions)) {
      const key = JSON.stringify([session.scenarioId, session.scenarioVersion]);
      const plays = playsByStoryVersion.get(key) ?? {
        started: 0,
        completed: 0,
        players: new Set<string>(),
      };
      plays.started++;
      if (session.endedAt) {
        plays.completed++;
        for (const participant of session.participants) {
          plays.players.add(participant.id);
        }
      }
      playsByStoryVersion.set(key, plays);
    }

    const items = this.storyCatalog.list().map((story) => {
      const plays = playsByStoryVersion.get(JSON.stringify([story.id, story.version]));
      return {
        ...story,
        origin: story.kind,
        difficulty: story.difficulty ?? null,
        averageRating: null,
        ratingCount: 0,
        startedPlays: plays?.started ?? 0,
        completedPlays: plays?.completed ?? 0,
        uniquePlayers: plays?.players.size ?? 0,
      };
    }).filter((story) => {
      if (query.origin && story.origin !== query.origin) return false;
      if (query.difficulty && (
        query.difficulty === "unset"
          ? story.difficulty !== null
          : story.difficulty !== query.difficulty
      )) return false;
      if (query.players && story.players !== query.players) return false;
      const keyword = query.q?.trim().toLocaleLowerCase();
      return !keyword ||
        story.title.toLocaleLowerCase().includes(keyword) ||
        story.subtitle.toLocaleLowerCase().includes(keyword);
    });

    items.sort((a, b) => {
      if (query.sort === "rating") {
        return (b.averageRating ?? -1) - (a.averageRating ?? -1) ||
          b.version - a.version;
      }
      if (query.sort === "popular") {
        return b.uniquePlayers - a.uniquePlayers ||
          b.startedPlays - a.startedPlays ||
          b.version - a.version;
      }
      return b.version - a.version || a.title.localeCompare(b.title);
    });

    return {
      items: items.slice(query.offset, query.offset + query.limit),
      total: items.length,
      limit: query.limit,
      offset: query.offset,
    };
  }
  create(me: Guest, scenarioId: string) {
    if (this.roomFor(me.id)) throw Error("현재 방에서 먼저 나가 줘.");
    const scenario = this.storyCatalog
      .list()
      .find((s) => s.id === scenarioId && s.available);
    if (!scenario) throw Error("아직 플레이할 수 없는 작품이야.");
    let code: string;
    do {
      code = crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
    } while (Object.values(this.state.rooms).some((r) => r.code === code));
    const r: Room = {
      id: crypto.randomUUID(),
      code,
      hostId: me.id,
      scenarioId,
      memberIds: [me.id],
      sessionId: null,
    };
    this.state.rooms[r.id] = r;
    this.store.save();
    return r;
  }
  join(me: Guest, code: string) {
    const r = Object.values(this.state.rooms).find((r) => r.code === code);
    if (!r) throw Error("초대 코드에 해당하는 방이 없어.");
    if (r.memberIds.includes(me.id)) return r;
    if (this.roomFor(me.id)) throw Error("현재 방에서 먼저 나가 줘.");
    if (r.sessionId) throw Error("이미 게임이 진행 중이야.");
    if (
      r.memberIds.length >=
      this.storyCatalog.get(r.scenarioId)!.scenario.players
    )
      throw Error("방이 가득 찼어.");
    r.memberIds.push(me.id);
    this.store.save();
    return r;
  }
  command(me: Guest, command: Command) {
    const r = this.needRoom(me.id);
    const s = r.sessionId ? this.state.sessions[r.sessionId] : null;
    const host = () => {
      if (r.hostId !== me.id) throw Error("방장만 진행할 수 있어.");
    };
    switch (command.type) {
      case "start": {
        host();
        if (s) throw Error("이미 시작한 게임이야.");
        const scenario = this.storyCatalog.get(r.scenarioId)!.scenario;
        if (
          r.memberIds.length !== scenario.players ||
          r.memberIds.some((id) => !this.online.get(id))
        )
          throw Error("모든 참가자가 접속해야 시작할 수 있어.");
        const ids = [...r.memberIds];
        for (let i = ids.length - 1; i > 0; i--) {
          const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
          [ids[i], ids[j]] = [ids[j], ids[i]];
        }
        const session: Session = {
          id: crypto.randomUUID(),
          roomId: r.id,
          scenarioId: scenario.id,
          scenarioVersion: scenario.version,
          participants: ids.map((id, roleIndex) => ({
            ...this.state.guests[id],
            roleIndex,
          })),
          phase: "briefing",
          votes: {},
          endedAt: null,
        };
        this.state.sessions[session.id] = session;
        r.sessionId = session.id;
        break;
      }
      case "advance":
        host();
        if (!s) throw Error("진행 중인 게임이 없어.");
        if (s.phase === "briefing") s.phase = "discussion";
        else if (s.phase === "discussion") s.phase = "voting";
        else throw Error("참가자들의 투표를 기다려 줘.");
        break;
      case "vote":
        if (!s || s.phase !== "voting") throw Error("투표 단계가 아니야.");
        if (s.votes[me.id]) throw Error("이미 투표했어.");
        if (!s.participants.some((p) => p.id === command.targetId))
          throw Error("투표 대상을 확인해 줘.");
        s.votes[me.id] = command.targetId;
        if (Object.keys(s.votes).length === s.participants.length)
          s.phase = "reveal";
        break;
      case "return":
        host();
        if (!s || s.phase !== "reveal")
          throw Error("결말 공개 후 돌아갈 수 있어.");
        s.endedAt = new Date().toISOString();
        r.sessionId = null;
        break;
      case "leave":
        if (s) throw Error("게임 중에는 퇴장할 수 없어. 재접속할 수 있어.");
        r.memberIds = r.memberIds.filter((id) => id !== me.id);
        if (!r.memberIds.length) delete this.state.rooms[r.id];
        else if (r.hostId === me.id) r.hostId = r.memberIds[0];
        break;
    }
    this.store.save();
  }
}
