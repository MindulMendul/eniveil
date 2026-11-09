export const consentCopy = {
  ko: {
    settings:'데이터 수집 설정',title:'데이터 수집 범위를 선택해 주세요',
    intro:'애니베일에서 수집할 데이터를 선택해 주세요. 로그인·플레이에는 전체 수집 동의가 필요합니다. 수집 데이터는 게임 품질 개선·난이도 분류·개인 실력 지표에만 사용하며 광고·마케팅에는 사용하지 않습니다.',
    basicTitle:'기본 수집 · GA 분석',basic:'Google Analytics에 페이지 경로·언어·체류 시간·제한된 이용 이벤트를 전달합니다. 계정 연계 난이도·MMR용 추가 기록은 수집하지 않습니다.',
    fullTitle:'전체 수집 · GA와 플레이 분석',full:'난이도 분석과 향후 개인 MMR을 위해 작품·세션·행동 ID, 진행·결과·시간을 추가 저장합니다. 로그인 상태에서는 현재 계정과 연결합니다. 채팅 원문·비공개 작품 내용·정답은 GA에 보내지 않습니다.',
    retention:'로그인 전 선택은 15분간 유효하며, 전체 동의 후 5분 안에 로그인하면 해당 계정에 연결해 30일간 적용합니다. 이후 계정이 바뀌면 다시 선택합니다. 서버의 플레이 분석 기록은 30일 보관 후 정기 삭제하고 기본 수집 전환·철회 시 즉시 삭제합니다. 난이도·MMR 점수 기능은 아직 제공하지 않습니다.',
    privacy:'개인정보 처리방침',noneButton:'수집하지 않음',basicButton:'기본 수집만 · 이용 제한',fullButton:'전체 수집 허용',
  },
  en: {
    settings:'Data collection settings',title:'Choose what you share',
    intro:'Choose how Eniveil uses your data. Full collection consent is required to sign in and play. Data is used only for game quality, difficulty classification and personal skill measures, never advertising or marketing.',
    basicTitle:'Basic · GA analytics',basic:'Page paths, language, visit duration and limited usage events for Google Analytics. No additional account-linked difficulty or MMR records.',
    fullTitle:'Full · GA and play analytics',full:'Also stores story and session IDs, action IDs, progress, result and timing for difficulty research and future personal MMR. Linked to your current account when signed in. No chat text, private story content or answers are sent to GA.',
    retention:'Before sign-in, your choice lasts 15 minutes. Signing in within 5 minutes of full consent links it to that account for 30 days. Later account changes require a new choice. Server play analytics are retained for 30 days then periodically removed, and deleted immediately when you switch to Basic or withdraw. Difficulty and MMR scores are not available yet.',
    privacy:'Privacy policy',noneButton:'Do not collect',basicButton:'Basic only · restricted access',fullButton:'Allow full collection',
  },
} as const;
