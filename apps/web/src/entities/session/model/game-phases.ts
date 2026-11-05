import type { SessionView } from "@festival/shared";

export const GAME_PHASE_LABELS: Record<SessionView["phase"], string> = {
  briefing: "역할 확인",
  discussion: "단서와 토론",
  voting: "최종 투표",
  reveal: "진상 공개",
};
