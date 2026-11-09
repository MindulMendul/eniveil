import { createHash, timingSafeEqual } from "node:crypto";
import type {
  Command,
  Guest,
  RoomSummary,
  Snapshot,
  RoomView,
} from "@festival/shared";
import { supportedSoloStory } from "@festival/shared";
import type { Room, Session, State } from "./model";
import type { GameStateStore } from "./ports/state-store";
import type { StoryCatalog } from "./story-catalog";
import type { PlayAnalytics } from "./play-analytics";
export class Game {
  online = new Map<string, number>();
  constructor(
    public store: GameStateStore,
    private readonly storyCatalog: StoryCatalog,
    readonly analytics?: PlayAnalytics,
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
      access: r.access ?? "public",
      id: r.id,
      code: r.code,
      title: r.mode === "solo" ? supportedSoloStory.title : s.title,
      count: r.memberIds.length,
      capacity: r.mode === "solo" ? 1 : s.players,
      status: r.sessionId || r.soloStarted ? "playing" : "waiting",
    };
  }
  private joinError(room: Room): string | null {
    const summary = this.summary(room);
    if (summary.status !== "waiting") return "이미 게임이 진행 중이야.";
    if (summary.count >= summary.capacity)
      return "방이 가득 찼어.";
    return null;
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
        mode: r.mode ?? "multiplayer",
        soloStarted: r.soloStarted ?? false,
        soloPlayId: r.soloPlayId ?? null,
        soloStory: supportedSoloStory,
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
                voteCount: r.memberIds.filter((id) => !!session.votes[id]).length,
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
    const friendIds = this.store.friendIds ? new Set(this.store.friendIds(me.id)) : null;
    return {
      me,
      endingSessionId: this.analytics?.pending(me.id) ?? null,
      scenarios: this.storyCatalog.list(),
      rooms: Object.values(this.state.rooms)
        .filter((room) => this.joinError(room) === null && (room.access !== "friends" || (friendIds ? friendIds.has(room.hostId) : !!this.store.areFriends?.(room.hostId, me.id))))
        .map((room) => this.summary(room)),
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
      if (session.endedAt && session.phase === "reveal") {
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
  create(me: Guest, scenarioId: string, access: import("@festival/shared").RoomAccess = "public", pin?: string) {
    if (!["public", "friends", "secret"].includes(access)) throw Error("방 종류를 확인해 줘.");
    if (access === "secret" && !/^\d{4}$/.test(pin ?? "")) throw Error("숫자 4자리 PIN을 입력해 줘.");
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
      access,
      ...(access === "secret" ? { pinHash: this.hashPin(code, pin!) } : {}),
      scenarioId,
      mode: scenarioId === supportedSoloStory.id ? 'solo' : 'multiplayer',
      memberIds: [me.id],
      sessionId: null,
    };
    this.state.rooms[r.id] = r;
    this.store.save();
    return r;
  }
  private hashPin(code: string, pin: string) {
    return createHash("sha256").update(code + ":" + pin).digest("hex");
  }
  join(me: Guest, code: string, pin?: string) {
    const r = Object.values(this.state.rooms).find((r) => r.code === code);
    if (!r) throw Error("초대 코드에 해당하는 방이 없어.");
    if (r.memberIds.includes(me.id)) return r;
    if (this.roomFor(me.id)) throw Error("현재 방에서 먼저 나가 줘.");
    if (r.access === "friends" && !this.store.areFriends?.(r.hostId, me.id)) throw Error("방장의 친구만 입장할 수 있어.");
    if (r.access === "secret") {
      const now = Date.now();
      if (r.pinFailures && r.pinFailures.until <= now) delete r.pinFailures;
      if (r.pinFailures && r.pinFailures.count >= 10) throw Error("PIN 입력이 잠겼어. 10분 뒤 다시 시도해 줘.");
      if (!r.pinHash || !timingSafeEqual(Buffer.from(r.pinHash), Buffer.from(this.hashPin(r.code, pin ?? "")))) {
        r.pinFailures = { count: (r.pinFailures?.count ?? 0) + 1, until: r.pinFailures?.until ?? now + 600000 };
        this.store.save();
        throw Error("PIN을 확인해 줘.");
      }
    }
    const error = this.joinError(r);
    if (error) throw new Error(error);
    r.memberIds.push(me.id);
    this.store.save();
    return r;
  }
  expireConnection(guestId: string, roomId: string) {
    const room = this.roomFor(guestId);
    if (!room || room.id !== roomId || (this.online.get(guestId) ?? 0) > 0) return;
    // End access to the room without rewriting the game's participant history.
    room.memberIds = room.memberIds.filter((id) => id !== guestId);
    const session = room.sessionId ? this.state.sessions[room.sessionId] : undefined;
    const previousPhase = session?.phase, previouslyEnded = !!session?.endedAt;
    if (!room.memberIds.length) {
      if (session && !session.endedAt) { session.endedAt = new Date().toISOString(); this.analytics?.finish(session.id,"abandoned",null); }
      delete this.state.rooms[room.id];
    } else {
      if (room.hostId === guestId) room.hostId = room.memberIds[0];
      if (session) this.revealWhenAllActiveVoted(room, session);
    }
    this.store.save();
    if (session && (session.phase !== previousPhase || !!session.endedAt !== previouslyEnded)) {
      return { sessionId: session.id, phase: session.phase, ended: !!session.endedAt };
    }
  }
  private revealWhenAllActiveVoted(room: Room, session: Session) {
    if (session.phase === "voting" && room.memberIds.every((id) => !!session.votes[id])) {
      session.phase = "reveal";
      if (this.analytics) {
        session.endedAt = new Date().toISOString();
        const story=this.storyCatalog.get(session.scenarioId,session.scenarioVersion);
        this.analytics.finish(session.id,"completed",{answer:story?.content.answer??"",votes:session.participants.map(p=>({voter:p.nickname,target:session.participants.find(t=>t.id===session.votes[p.id])?.nickname??"미투표"}))});
      }
    }
  }
  command(me: Guest, command: Command) {
    if(!this.analytics)return this.applyCommand(me,command);
    const room=this.needRoom(me.id),beforeRoom=structuredClone(room);
    const beforeSession=room.sessionId?structuredClone(this.state.sessions[room.sessionId]):null;
    try {this.analytics.atomic(()=>this.applyCommand(me,command));}
    catch(error){
      if(room.sessionId&&room.sessionId!==beforeRoom.sessionId)delete this.state.sessions[room.sessionId];
      this.state.rooms[beforeRoom.id]=beforeRoom;
      if(beforeSession)this.state.sessions[beforeSession.id]=beforeSession;
      throw error;
    }
  }
  private applyCommand(me: Guest, command: Command) {
    const r = this.needRoom(me.id);
    const s = r.sessionId ? this.state.sessions[r.sessionId] : null;
    const host = () => {
      if (r.hostId !== me.id) throw Error("방장만 진행할 수 있어.");
    };
    switch (command.type) {
      case "mode":
        host();
        if (r.scenarioId === supportedSoloStory.id && command.mode !== 'solo') throw Error('선택한 작품은 1인 플레이만 지원해.');
        if (s || r.soloStarted) throw Error("게임 시작 전에만 모드를 바꿀 수 있어.");
        if (command.mode === "solo" && r.memberIds.length !== 1) throw Error("혼자 있는 방에서만 1인 모드를 열 수 있어.");
        r.mode = command.mode;
        break;
      case "solo-return":
        host();
        if (r.mode !== "solo" || !r.soloStarted) throw Error("진행 중인 1인 게임이 없어.");
        if (this.analytics) { delete this.state.rooms[r.id]; break; }
        r.soloStarted = false;
        r.soloPlayId = null;
        break;
      case "start": {
        host();
        if (s || r.soloStarted) throw Error("이미 시작한 게임이야.");
        if (r.mode === "solo") {
          if (r.memberIds.length !== 1 || !this.online.get(me.id)) throw Error("참가자가 접속해야 시작할 수 있어.");
          r.soloStarted = true;
          r.soloPlayId = crypto.randomUUID();
          break;
        }
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
        this.analytics?.start(session.id,session.scenarioId,session.scenarioVersion,'multiplayer',r.id,session.participants.map(p=>({id:p.id,role:String(p.roleIndex)})),{title:scenario.title,participants:session.participants.map(p=>({id:p.id,nickname:p.nickname}))});
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
        if(s && this.analytics) for (const p of s.participants) this.analytics.stage(s.id,p.id,s.phase);
        break;
      case "vote":
        if (!s || s.phase !== "voting") throw Error("투표 단계가 아니야.");
        if (s.votes[me.id]) throw Error("이미 투표했어.");
        if (!s.participants.some((p) => p.id === command.targetId))
          throw Error("투표 대상을 확인해 줘.");
        s.votes[me.id] = command.targetId;
        this.analytics?.record(s.id,me.id,"vote","voting",command.targetId);
        this.revealWhenAllActiveVoted(r, s);
        break;
      case "return":
        if (this.analytics) throw Error("평가 후 로비로 돌아가 줘.");
        host();
        if (!s || s.phase !== "reveal")
          throw Error("결말 공개 후 돌아갈 수 있어.");
        s.endedAt = new Date().toISOString();
        r.sessionId = null;
        break;
      case "leave":
        if (s || r.soloStarted) throw Error("게임 중에는 퇴장할 수 없어. 재접속할 수 있어.");
        r.memberIds = r.memberIds.filter((id) => id !== me.id);
        if (!r.memberIds.length) delete this.state.rooms[r.id];
        else if (r.hostId === me.id) r.hostId = r.memberIds[0];
        break;
    }
    this.store.save();
  }
  completeRating(userId:string,sessionId:string,rating:number|null) {
    if(!this.analytics)throw Error('플레이 기록을 사용할 수 없어.');
    const room=this.roomFor(userId),original=room?structuredClone(room):null;
    try {this.analytics.atomic(()=>{this.analytics!.rate(sessionId,userId,rating);this.finishParticipant(userId,sessionId);});}
    catch(error){if(original)this.state.rooms[original.id]=original;throw error;}
  }
  finishParticipant(userId:string,sessionId:string) {
    const room=this.roomFor(userId),play=this.analytics?.play(sessionId);
    if(!room || !play || play.room_id!==room.id || (room.sessionId && room.sessionId!==sessionId)) return;
    room.memberIds=room.memberIds.filter(id=>id!==userId);
    if(!room.memberIds.length) delete this.state.rooms[room.id];
    else if(room.hostId===userId) room.hostId=room.memberIds[0];
    this.store.save();
  }
  abandonPlay(id:string) {
    const play=this.analytics?.play(id);if(!play?.room_id)return;
    const room=this.state.rooms[play.room_id];
    if(room&&(room.sessionId===id||!room.sessionId&&room.mode==='solo')){delete this.state.rooms[room.id];this.store.save();}
  }
  cleanupFinishedRooms() {
    if(!this.analytics) return;
    let changed=false;
    for(const room of Object.values(this.state.rooms)) {
      const play=room.sessionId?this.analytics.play(room.sessionId):this.analytics.endedForRoom(room.id);
      if(play?.ended && Date.now()-play.ended>600000) {delete this.state.rooms[room.id];changed=true;}
    }
    if(changed)this.store.save();
  }
  endSolo(me: Guest, roomId: string, soloPlayId: string | null) {
    const room = this.roomFor(me.id);
    if(!room) return;
    if (room.hostId !== me.id) throw Error("방장만 진행할 수 있어.");
    if (room.id !== roomId) throw Error("현재 방을 확인해 줘.");
    // Page exits can arrive after a return or a new start. Only end their own attempt.
    if (!room.soloStarted || (room.soloPlayId ?? null) !== soloPlayId) return;
    this.command(me, { type: "solo-return", requestId: crypto.randomUUID() });
  }
}
