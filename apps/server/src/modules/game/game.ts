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
import type { StoryCatalog, StoryContent } from "./story-catalog";
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
  /** A room keeps the version it was created with, so later publishes cannot change its seats or content. */
  private roomStory(room: Room) {
    return this.storyCatalog.get(room.scenarioId, room.scenarioVersion)!;
  }
  roomFor(id: string) {
    return Object.values(this.state.rooms).find((r) =>
      r.memberIds.includes(id),
    );
  }
  /** Chat is available only while participants are collecting clues or meeting. */
  canChat(id: string, sessionId: string) {
    const room = this.roomFor(id);
    if (room?.sessionId !== sessionId) return false;
    const phase = this.state.sessions[sessionId]?.phase;
    return (
      phase === "first_investigation" ||
      phase === "meeting" ||
      phase === "second_investigation"
    );
  }
  private availableClues(session: Session, story?: StoryContent) {
    if (!story || session.phase === "briefing") return [];
    if (session.phase === "first_investigation" || session.phase === "meeting")
      return story.firstClues;
    return [...story.firstClues, ...story.secondClues];
  }
  private visibleClues(session: Session, story?: StoryContent) {
    const collected = new Set(session.collectedClueIds ?? []);
    return this.availableClues(session, story)
      .filter((clue) => collected.has(clue.id))
      .map((clue) => clue.text);
  }
  soloRoomForStory(owner: string, story: string) {
    const room=this.roomFor(owner);
    return room?.soloStarted && room.mode === 'solo' && story === supportedSoloStory.id ? room.id : null;
  }
  needRoom(id: string) {
    const r = this.roomFor(id);
    if (!r) throw new Error("참여 중인 방이 없어.");
    return r;
  }
  summary(r: Room): RoomSummary {
    const s = this.roomStory(r).scenario;
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
    if (summary.count >= summary.capacity) return "방이 가득 찼어.";
    return null;
  }
  snapshot(me: Guest): Snapshot {
    const r = this.roomFor(me.id);
    let room: RoomView | null = null;
    if (r) {
      const scenario = this.roomStory(r).scenario;
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
                phaseEndsAt: session.phaseEndsAt ?? null,
                role: story?.content.roles[participant.roleIndex] ?? {
                  name: "역할 정보 없음",
                  secret: "이 작품의 역할 정보를 불러오지 못했어.",
                },
                items: (story?.content.items ?? [])
                  .filter((item) => session.itemOwners?.[item.id] === me.id || (!session.itemOwners && item.ownerRoleIndex === participant.roleIndex))
                  .map(({ name, description }) => ({ name, description })),
                clues: this.visibleClues(session, story?.content),
                availableClueCount: this.availableClues(session, story?.content).length,
                collectedClueCount: session.collectedClueIds?.length ?? 0,
                meetingPrompt: story?.content.meetingPrompt ?? null,
                finalChoices: (story?.content.finalChoices ?? []).map(({ id, label }) => ({ id, label })),
                selectedFinalChoiceId: session.finalChoices?.[me.id] ?? null,
                rooms: (story?.content.rooms ?? []).map((item) => ({
                  id: item.id,
                  name: item.name,
                  description: item.description ?? null,
                  available: item.requiredClueIds.every((id) => (session.collectedClueIds ?? []).includes(id)),
                })),
                currentRoomId: session.currentRoomIds?.[me.id] ?? null,
                resources: (story?.content.resources ?? []).map((resource) => ({
                  id: resource.id,
                  name: resource.name,
                  value: session.resources?.[me.id]?.[resource.id] ?? resource.initialValue,
                })),
                voteCount: r.memberIds.filter((id) => !!session.votes[id])
                  .length,
                hasVoted: !!session.votes[me.id],
                result:
                  session.phase === "reveal"
                    ? {
                        answer:
                          story?.content.answer ??
                          "결말 정보를 불러오지 못했어.",
                        votes: session.participants.map((p) => ({
                          voter: p.nickname,
                          target:
                            session.participants.find(
                              (t) => t.id === session.votes[p.id],
                            )?.nickname ?? "미투표",
                        })),
                        choices: session.participants.flatMap((p) => {
                          const choice = (story?.content.finalChoices ?? []).find((item) => item.id === session.finalChoices?.[p.id]);
                          return choice ? [{ player: p.nickname, outcome: choice.outcome }] : [];
                        }),
                      }
                    : null,
              }
            : null,
      };
    }
    const friendIds = this.store.friendIds
      ? new Set(this.store.friendIds(me.id))
      : null;
    return {
      me,
      endingSessionId: this.analytics?.pending(me.id) ?? null,
      scenarios: this.storyCatalog.list(),
      rooms: Object.values(this.state.rooms)
        .filter(
          (room) =>
            this.joinError(room) === null &&
            (room.access !== "friends" ||
              (friendIds
                ? friendIds.has(room.hostId)
                : !!this.store.areFriends?.(room.hostId, me.id))),
        )
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

    const items = this.storyCatalog
      .list()
      .map((story) => {
        const plays = playsByStoryVersion.get(
          JSON.stringify([story.id, story.version]),
        );
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
      })
      .filter((story) => {
        if (query.origin && story.origin !== query.origin) return false;
        if (
          query.difficulty &&
          (query.difficulty === "unset"
            ? story.difficulty !== null
            : story.difficulty !== query.difficulty)
        )
          return false;
        if (query.players && story.players !== query.players) return false;
        const keyword = query.q?.trim().toLocaleLowerCase();
        return (
          !keyword ||
          story.title.toLocaleLowerCase().includes(keyword) ||
          story.subtitle.toLocaleLowerCase().includes(keyword)
        );
      });

    items.sort((a, b) => {
      if (query.sort === "rating") {
        return (
          (b.averageRating ?? -1) - (a.averageRating ?? -1) ||
          b.version - a.version
        );
      }
      if (query.sort === "popular") {
        return (
          b.uniquePlayers - a.uniquePlayers ||
          b.startedPlays - a.startedPlays ||
          b.version - a.version
        );
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
  create(
    me: Guest,
    scenarioId: string,
    access: import("@festival/shared").RoomAccess = "public",
    pin?: string,
  ) {
    if (!["public", "friends", "secret"].includes(access))
      throw new Error("방 종류를 확인해 줘.");
    if (access === "secret" && !/^\d{4}$/.test(pin ?? ""))
      throw new Error("숫자 4자리 PIN을 입력해 줘.");
    if (this.roomFor(me.id)) throw new Error("현재 방에서 먼저 나가 줘.");
    const scenario = this.storyCatalog
      .list()
      .find((s) => s.id === scenarioId && s.available);
    if (!scenario) throw new Error("아직 플레이할 수 없는 작품이야.");
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
      scenarioVersion: scenario.version,
      mode: scenarioId === supportedSoloStory.id ? "solo" : "multiplayer",
      memberIds: [me.id],
      sessionId: null,
    };
    this.state.rooms[r.id] = r;
    this.store.save();
    return r;
  }
  private hashPin(code: string, pin: string) {
    return createHash("sha256")
      .update(code + ":" + pin)
      .digest("hex");
  }
  join(me: Guest, code: string, pin?: string) {
    const r = Object.values(this.state.rooms).find((r) => r.code === code);
    if (!r) throw new Error("초대 코드에 해당하는 방이 없어.");
    if (r.memberIds.includes(me.id)) return r;
    if (this.roomFor(me.id)) throw new Error("현재 방에서 먼저 나가 줘.");
    if (r.access === "friends" && !this.store.areFriends?.(r.hostId, me.id))
      throw new Error("방장의 친구만 입장할 수 있어.");
    if (r.access === "secret") {
      const now = Date.now();
      if (r.pinFailures && r.pinFailures.until <= now) delete r.pinFailures;
      if (r.pinFailures && r.pinFailures.count >= 10)
        throw new Error("PIN 입력이 잠겼어. 10분 뒤 다시 시도해 줘.");
      if (
        !r.pinHash ||
        !timingSafeEqual(
          Buffer.from(r.pinHash),
          Buffer.from(this.hashPin(r.code, pin ?? "")),
        )
      ) {
        r.pinFailures = {
          count: (r.pinFailures?.count ?? 0) + 1,
          until: r.pinFailures?.until ?? now + 600000,
        };
        this.store.save();
        throw new Error("PIN을 확인해 줘.");
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
    if (!room || room.id !== roomId || (this.online.get(guestId) ?? 0) > 0)
      return;
    // End access to the room without rewriting the game's participant history.
    room.memberIds = room.memberIds.filter((id) => id !== guestId);
    const session = room.sessionId
      ? this.state.sessions[room.sessionId]
      : undefined;
    const previousPhase = session?.phase,
      previouslyEnded = !!session?.endedAt;
    if (!room.memberIds.length) {
      if (session && !session.endedAt) {
        session.endedAt = new Date().toISOString();
        this.analytics?.finish(session.id, "abandoned", null);
      }
      const active = this.analytics?.activeForRoom(room.id);
      if (active) this.analytics?.finish(active.id, "abandoned", null);
      delete this.state.rooms[room.id];
    } else {
      if (room.hostId === guestId) room.hostId = room.memberIds[0];
      if (session) this.revealWhenAllActiveVoted(room, session);
    }
    this.store.save();
    if (
      session &&
      (session.phase !== previousPhase || !!session.endedAt !== previouslyEnded)
    ) {
      return {
        sessionId: session.id,
        phase: session.phase,
        ended: !!session.endedAt,
      };
    }
  }
  recoverLegacySessions() {
    if (!this.analytics) return;
    const before = structuredClone(this.state);
    try {
      this.analytics.atomic(() => {
        let changed = false;
        for (const room of Object.values(this.state.rooms)) {
          const session = room.sessionId
            ? this.state.sessions[room.sessionId]
            : null;
          if (!session || this.analytics!.play(session.id)) continue;
          const story = this.storyCatalog.get(
            session.scenarioId,
            session.scenarioVersion,
          );
          if (!story) continue;
          this.analytics!.start(
            session.id,
            session.scenarioId,
            session.scenarioVersion,
            "multiplayer",
            room.id,
            session.participants.map((p) => ({
              id: p.id,
              role: String(p.roleIndex),
            })),
            {
              title: story.scenario.title,
              participants: session.participants.map((p) => ({
                id: p.id,
                nickname: p.nickname,
              })),
            },
          );
          this.analytics!.markLegacy(
            session.id,
            this.analytics!.play(session.id)!.started,
            null,
          );
          for (const participant of session.participants)
            this.analytics!.stage(session.id, participant.id, session.phase);
          if (session.phase === "reveal")
            this.finishRecoveredSession(
              session,
              story.content.answer,
              story.content.answerRoleIndex,
            );
          changed = true;
        }
        if (changed) this.store.save();
      });
    } catch (error) {
      this.store.state = before;
      throw error;
    }
  }
  private finishRecoveredSession(
    session: Session,
    answer: string,
    answerRoleIndex: number | undefined,
  ) {
    const result = {
      answer,
      votes: session.participants.map((p) => ({
        voter: p.nickname,
        target:
          session.participants.find((other) => other.id === session.votes[p.id])
            ?.nickname ?? "미투표",
      })),
    };
    this.analytics!.finish(
      session.id,
      "completed",
      result,
      this.groupCorrectness(session, answerRoleIndex),
    );
    session.endedAt ??= new Date().toISOString();
  }
  private groupCorrectness(
    session: Session,
    answerRoleIndex: number | undefined,
  ): boolean | null {
    if (answerRoleIndex === undefined) return null;
    const counts = new Map<string, number>();
    for (const target of Object.values(session.votes))
      counts.set(target, (counts.get(target) ?? 0) + 1);
    const highest = Math.max(0, ...counts.values());
    const winners = [...counts].filter(([, count]) => count === highest);
    if (winners.length !== 1) return null;
    return (
      session.participants.find((p) => p.id === winners[0][0])?.roleIndex ===
      answerRoleIndex
    );
  }
  private revealWhenAllActiveVoted(room: Room, session: Session) {
    if (
      session.phase === "final_choice" &&
      room.memberIds.every((id) => !!session.votes[id])
    ) {
      session.phase = "reveal";
      if (this.analytics) {
        session.endedAt = new Date().toISOString();
        const story = this.storyCatalog.get(
          session.scenarioId,
          session.scenarioVersion,
        );
        this.analytics.finish(
          session.id,
          "completed",
          {
            answer: story?.content.answer ?? "",
            votes: session.participants.map((p) => ({
              voter: p.nickname,
              target:
                session.participants.find((t) => t.id === session.votes[p.id])
                  ?.nickname ?? "미투표",
            })),
          },
          this.groupCorrectness(session, story?.content.answerRoleIndex),
        );
      }
    }
  }
  command(me: Guest, command: Command) {
    if (!this.analytics) return this.applyCommand(me, command);
    const room = this.needRoom(me.id),
      beforeRoom = structuredClone(room);
    const beforeSession = room.sessionId
      ? structuredClone(this.state.sessions[room.sessionId])
      : null;
    try {
      this.analytics.atomic(() => this.applyCommand(me, command));
    } catch (error) {
      if (room.sessionId && room.sessionId !== beforeRoom.sessionId)
        delete this.state.sessions[room.sessionId];
      this.state.rooms[beforeRoom.id] = beforeRoom;
      if (beforeSession) this.state.sessions[beforeSession.id] = beforeSession;
      throw error;
    }
  }
  private requireHost(me: Guest, room: Room) {
    if (room.hostId !== me.id) throw new Error("방장만 진행할 수 있어.");
  }
  private applyCommand(me: Guest, command: Command) {
    const room = this.needRoom(me.id);
    const session = room.sessionId ? this.state.sessions[room.sessionId] : null;
    switch (command.type) {
      case "mode":
        this.setMode(me, room, session, command.mode);
        break;
      case "solo-return":
        this.closeSolo(me, room);
        break;
      case "start":
        this.startRoom(me, room, session);
        break;
      case "advance":
        this.advanceRoom(me, room, session);
        break;
      case "collect-clue":
        this.collectClue(me, room, session);
        break;
      case "choose-final":
        this.chooseFinal(me, room, session, command.choiceId);
        break;
      case "move-room":
        this.moveRoom(me, session, command.roomId);
        break;
      case "vote":
        this.vote(me, room, session, command.targetId);
        break;
      case "return":
        this.returnRoom(me, room, session);
        break;
      case "leave":
        this.leaveRoom(me, room, session);
        break;
      case "presence":
        throw new Error("접속 상태는 로비 연결에서 처리해 줘.");
    }
    this.store.save();
  }
  private setMode(
    me: Guest,
    room: Room,
    session: Session | null,
    mode: "solo" | "multiplayer",
  ) {
    this.requireHost(me, room);
    if (room.scenarioId === supportedSoloStory.id && mode !== "solo")
      throw new Error("선택한 작품은 1인 플레이만 지원해.");
    if (session || room.soloStarted)
      throw new Error("게임 시작 전에만 모드를 바꿀 수 있어.");
    if (mode === "solo" && room.memberIds.length !== 1)
      throw new Error("혼자 있는 방에서만 1인 모드를 열 수 있어.");
    room.mode = mode;
  }
  private closeSolo(me: Guest, room: Room) {
    this.requireHost(me, room);
    if (room.mode !== "solo" || !room.soloStarted)
      throw new Error("진행 중인 1인 게임이 없어.");
    if (this.analytics) {
      const active = this.analytics.activeForRoom(room.id);
      if (active) this.analytics.finish(active.id, "abandoned", null);
      delete this.state.rooms[room.id];
      return;
    }
    room.soloStarted = false;
    room.soloPlayId = null;
  }
  private startRoom(me: Guest, room: Room, previous: Session | null) {
    this.requireHost(me, room);
    if (previous || room.soloStarted) throw new Error("이미 시작한 게임이야.");
    if (room.mode === "solo") {
      if (room.memberIds.length !== 1 || !this.online.get(me.id))
        throw new Error("참가자가 접속해야 시작할 수 있어.");
      room.soloStarted = true;
      room.soloPlayId = crypto.randomUUID();
      return;
    }
    const scenario = this.roomStory(room).scenario;
    if (
      room.memberIds.length !== scenario.players ||
      room.memberIds.some((id) => !this.online.get(id))
    )
      throw new Error("모든 참가자가 접속해야 시작할 수 있어.");
    const ids = [...room.memberIds];
    for (let i = ids.length - 1; i > 0; i--) {
      const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const session: Session = {
      id: crypto.randomUUID(),
      roomId: room.id,
      scenarioId: scenario.id,
      scenarioVersion: scenario.version,
      participants: ids.map((id, roleIndex) => ({
        ...this.state.guests[id],
        roleIndex,
      })),
      phase: "briefing",
      votes: {},
      finalChoices: {},
      currentRoomIds: {},
      resources: Object.fromEntries(ids.map((id) => [
        id,
        Object.fromEntries((this.roomStory(room).content.resources ?? []).map((resource) => [resource.id, resource.initialValue])),
      ])),
      itemOwners: Object.fromEntries((this.roomStory(room).content.items ?? []).map((item) => [item.id, item.ownerRoleIndex === undefined ? null : ids.find((_, index) => index === item.ownerRoleIndex) ?? null])),
      collectedClueIds: [],
      phaseEndsAt: null,
      endedAt: null,
    };
    this.analytics?.start(
      session.id,
      session.scenarioId,
      session.scenarioVersion,
      "multiplayer",
      room.id,
      session.participants.map((p) => ({
        id: p.id,
        role: String(p.roleIndex),
      })),
      {
        title: scenario.title,
        participants: session.participants.map((p) => ({
          id: p.id,
          nickname: p.nickname,
        })),
      },
    );
    this.state.sessions[session.id] = session;
    room.sessionId = session.id;
  }
  private advanceRoom(me: Guest, room: Room, session: Session | null) {
    this.requireHost(me, room);
    if (!session) throw new Error("진행 중인 게임이 없어.");
    if (session.phase === "briefing") this.advancePhase(session);
    else if (session.phase === "first_investigation") this.advancePhase(session);
    else if (session.phase === "meeting") this.advancePhase(session);
    else if (session.phase === "second_investigation") this.advancePhase(session);
    else throw new Error("참가자들의 최종 선택을 기다려 줘.");
    if (this.analytics)
      for (const participant of session.participants)
        this.analytics.stage(session.id, participant.id, session.phase);
  }
  private advancePhase(session: Session, now = Date.now()) {
    session.phase = session.phase === "briefing" ? "first_investigation"
      : session.phase === "first_investigation" ? "meeting"
      : session.phase === "meeting" ? "second_investigation"
      : "final_choice";
    const story = this.storyCatalog.get(session.scenarioId, session.scenarioVersion)?.content;
    const seconds = session.phase === "first_investigation"
      ? story?.stageDurations?.firstInvestigationSeconds
      : session.phase === "meeting"
        ? story?.stageDurations?.meetingSeconds
        : session.phase === "second_investigation"
          ? story?.stageDurations?.secondInvestigationSeconds
          : undefined;
    session.phaseEndsAt = seconds ? now + seconds * 1000 : null;
  }
  /** Advances expired configured stages. The lobby broadcasts returned sessions. */
  expireTimedStages(now = Date.now()) {
    const changed: Session[] = [];
    for (const session of Object.values(this.state.sessions)) {
      if (!session.phaseEndsAt || session.phaseEndsAt > now) continue;
      if (!["first_investigation", "meeting", "second_investigation"].includes(session.phase)) continue;
      this.advancePhase(session, now);
      for (const participant of session.participants)
        this.analytics?.stage(session.id, participant.id, session.phase);
      changed.push(session);
    }
    if (changed.length) this.store.save();
    return changed;
  }
  private chooseFinal(me: Guest, room: Room, session: Session | null, choiceId: string) {
    if (!session || session.phase !== "final_choice") throw new Error("최종 선택 단계가 아니야.");
    const choices = this.storyCatalog.get(session.scenarioId, session.scenarioVersion)?.content.finalChoices ?? [];
    if (!choices.some((choice) => choice.id === choiceId)) throw new Error("선택지를 확인해 줘.");
    if ((session.finalChoices ?? {})[me.id]) throw new Error("이미 선택했어.");
    (session.finalChoices ??= {})[me.id] = choiceId;
    if (room.memberIds.every((id) => !!session.finalChoices[id])) {
      session.phase = "reveal";
      session.phaseEndsAt = null;
      session.endedAt = new Date().toISOString();
      const story = this.storyCatalog.get(session.scenarioId, session.scenarioVersion)?.content;
      this.analytics?.finish(session.id, "completed", {
        answer: story?.answer ?? "",
        choices: session.participants.map((participant) => ({
          player: participant.nickname,
          choiceId: session.finalChoices[participant.id],
        })),
      });
    }
  }
  private moveRoom(me: Guest, session: Session | null, roomId: string) {
    if (!session || (session.phase !== "first_investigation" && session.phase !== "second_investigation"))
      throw new Error("조사 단계에서만 방을 이동할 수 있어.");
    const target = this.storyCatalog.get(session.scenarioId, session.scenarioVersion)?.content.rooms?.find((item) => item.id === roomId);
    if (!target) throw new Error("방을 찾을 수 없어.");
    if (!target.requiredClueIds.every((id) => (session.collectedClueIds ?? []).includes(id)))
      throw new Error("아직 이 방을 열 조건을 충족하지 못했어.");
    (session.currentRoomIds ??= {})[me.id] = roomId;
  }
  private vote(
    me: Guest,
    room: Room,
    session: Session | null,
    targetId: string,
  ) {
    if (!session || session.phase !== "final_choice")
      throw new Error("최종 선택 단계가 아니야.");
    if (session.votes[me.id]) throw new Error("이미 투표했어.");
    if (!session.participants.some((p) => p.id === targetId))
      throw new Error("투표 대상을 확인해 줘.");
    session.votes[me.id] = targetId;
    this.analytics?.record(session.id, me.id, "vote", "final_choice", targetId);
    this.revealWhenAllActiveVoted(room, session);
  }
  private collectClue(me: Guest, room: Room, session: Session | null) {
    if (!session || (session.phase !== "first_investigation" && session.phase !== "second_investigation"))
      throw new Error("조사 단계에서만 단서를 확인할 수 있어.");
    const story = this.storyCatalog.get(session.scenarioId, session.scenarioVersion)?.content;
    const clue = this.availableClues(session, story).find(
      (item) => !(session.collectedClueIds ?? []).includes(item.id),
    );
    if (!clue) throw new Error("이 단계에서 확인할 단서를 모두 찾았어.");
    const resources = (session.resources ??= {})[me.id] ??= {};
    if (clue.resourceCost) {
      const remaining = resources[clue.resourceCost.resourceId] ?? 0;
      if (remaining < clue.resourceCost.amount) throw new Error("자원이 부족해서 이 단서를 조사할 수 없어.");
      resources[clue.resourceCost.resourceId] = remaining - clue.resourceCost.amount;
    }
    if (clue.resourceReward)
      resources[clue.resourceReward.resourceId] = (resources[clue.resourceReward.resourceId] ?? 0) + clue.resourceReward.amount;
    (session.collectedClueIds ??= []).push(clue.id);
    this.analytics?.record(session.id, me.id, "inspect", session.phase, clue.id);
  }
  private returnRoom(me: Guest, room: Room, session: Session | null) {
    if (this.analytics) throw new Error("평가 후 로비로 돌아가 줘.");
    this.requireHost(me, room);
    if (!session || session.phase !== "reveal")
      throw new Error("결말 공개 후 돌아갈 수 있어.");
    session.endedAt = new Date().toISOString();
    room.sessionId = null;
  }
  private leaveRoom(me: Guest, room: Room, session: Session | null) {
    if (session || room.soloStarted)
      throw new Error("게임 중에는 퇴장할 수 없어. 재접속할 수 있어.");
    room.memberIds = room.memberIds.filter((id) => id !== me.id);
    if (!room.memberIds.length) delete this.state.rooms[room.id];
    else if (room.hostId === me.id) room.hostId = room.memberIds[0];
  }
  completeRating(userId: string, sessionId: string, rating: number | null) {
    if (!this.analytics) throw new Error("플레이 기록을 사용할 수 없어.");
    const room = this.roomFor(userId),
      original = room ? structuredClone(room) : null;
    try {
      this.analytics.atomic(() => {
        this.analytics!.rate(sessionId, userId, rating);
        this.finishParticipant(userId, sessionId);
      });
    } catch (error) {
      if (original) {
        this.state.rooms[original.id] = original;
      }
      throw error;
    }
  }
  finishParticipant(userId: string, sessionId: string) {
    const room = this.roomFor(userId),
      play = this.analytics?.play(sessionId);
    if (
      !room ||
      !play ||
      play.room_id !== room.id ||
      (room.sessionId && room.sessionId !== sessionId)
    )
      return;
    room.memberIds = room.memberIds.filter((id) => id !== userId);
    if (!room.memberIds.length) delete this.state.rooms[room.id];
    else if (room.hostId === userId) room.hostId = room.memberIds[0];
    this.store.save();
  }
  abandonPlay(id: string) {
    const play = this.analytics?.play(id);
    if (!play?.room_id) return;
    const room = this.state.rooms[play.room_id];
    if (
      room &&
      (room.sessionId === id || (!room.sessionId && room.mode === "solo"))
    ) {
      delete this.state.rooms[room.id];
      this.store.save();
    }
  }
  cleanupFinishedRooms() {
    if (!this.analytics) return;
    let changed = false;
    for (const room of Object.values(this.state.rooms)) {
      const play = room.sessionId
        ? this.analytics.play(room.sessionId)
        : this.analytics.endedForRoom(room.id);
      if (play?.ended && Date.now() - play.ended > 600000) {
        delete this.state.rooms[room.id];
        changed = true;
      }
    }
    if (changed) this.store.save();
  }
  endSolo(me: Guest, roomId: string, soloPlayId: string | null) {
    const room = this.roomFor(me.id);
    if (!room) return;
    if (room.hostId !== me.id) throw new Error("방장만 진행할 수 있어.");
    if (room.id !== roomId) throw new Error("현재 방을 확인해 줘.");
    // Page exits can arrive after a return or a new start. Only end their own attempt.
    if (!room.soloStarted || (room.soloPlayId ?? null) !== soloPlayId) return;
    this.command(me, { type: "solo-return", requestId: crypto.randomUUID() });
  }
}
