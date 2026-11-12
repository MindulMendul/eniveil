import type { SessionView } from "@festival/shared";

export const GAME_PHASE_LABELS: Record<SessionView["phase"], string> = {
  briefing: "역할 확인",
  first_investigation: "1차 단서 수집",
  meeting: "회의",
  second_investigation: "2차 단서 수집",
  final_choice: "최종 선택",
  reveal: "진상 공개",
};
