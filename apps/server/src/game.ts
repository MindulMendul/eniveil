import type {
  Command,
  Guest,
  RoomSummary,
  Snapshot,
  RoomView,
} from "@festival/shared";
import { Store, type Room, type Session } from "./store";
import { scenarios, demoContent } from "./scenarios";
export class Game {
  online = new Map<string, number>();
  constructor(public store: Store) {}
  get state() {
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
    const s = scenarios.find((s) => s.id === r.scenarioId)!;
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
      const scenario = scenarios.find((s) => s.id === r.scenarioId)!;
      const session = r.sessionId ? this.state.sessions[r.sessionId] : null;
      const participant = session?.participants.find((p) => p.id === me.id);
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
                role: demoContent.roles[participant.roleIndex],
                clues: session.phase === "briefing" ? [] : demoContent.clues,
                voteCount: Object.keys(session.votes).length,
                hasVoted: !!session.votes[me.id],
                result:
                  session.phase === "reveal"
                    ? {
                        answer: demoContent.answer,
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
      scenarios,
      rooms: Object.values(this.state.rooms).map((r) => this.summary(r)),
      room,
    };
  }
  catalog(query: {
    search?: string;
    origin?: "original" | "demo";
    difficulty?: "easy" | "normal" | "hard" | "unset";
    players?: number;
    sort: "latest" | "rating" | "popular";
    page: number;
    limit: number;
  }) {
    const items = scenarios.map((scenario) => {
      const completedSessions = Object.values(this.state.sessions).filter(
        (session) => session.scenarioId === scenario.id && session.endedAt,
      );
      const uniquePlayers = new Set(
        completedSessions.flatMap((session) => session.participants.map((player) => player.id)),
      );
      return {
        ...scenario,
        origin: scenario.kind,
        difficulty: scenario.difficulty ?? null,
        averageRating: null,
        ratingCount: 0,
        completedPlays: completedSessions.length,
        uniquePlayers: uniquePlayers.size,
      };
    }).filter((story) => {
      if (query.origin && story.origin !== query.origin) return false;
      if (query.difficulty && (query.difficulty === "unset" ? story.difficulty !== null : story.difficulty !== query.difficulty)) return false;
      if (query.players && story.players !== query.players) return false;
      const keyword = query.search?.trim().toLocaleLowerCase();
      return !keyword ||
        story.title.toLocaleLowerCase().includes(keyword) ||
        story.subtitle.toLocaleLowerCase().includes(keyword);
    });

    items.sort((a, b) => {
      if (query.sort === "rating") {
        return (b.averageRating ?? -1) - (a.averageRating ?? -1) || b.version - a.version;
      }
      if (query.sort === "popular") {
        return b.uniquePlayers - a.uniquePlayers ||
          b.completedPlays - a.completedPlays ||
          b.version - a.version;
      }
      return b.version - a.version;
    });

    const total = items.length;
    const start = (query.page - 1) * query.limit;
    return {
      items: items.slice(start, start + query.limit),
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    };
  }
  create(me: Guest, scenarioId: string) {
    if (this.roomFor(me.id)) throw Error("현재 방에서 먼저 나가 줘.");
    const scenario = scenarios.find((s) => s.id === scenarioId && s.available);
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
      scenarios.find((s) => s.id === r.scenarioId)!.players
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
        const scenario = scenarios.find((x) => x.id === r.scenarioId)!;
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
