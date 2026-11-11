import type { Scenario } from "@festival/shared";
import { supportedSoloStory } from "@festival/shared";
import type {
  StoryCatalog,
  StoryContent,
  StoryVersion,
} from "../../game/story-catalog";

const scenarios: Scenario[] = [
  { id: supportedSoloStory.id, version: 1, title: supportedSoloStory.title,
    subtitle: '단서와 진술을 모아 범인을 밝혀내는 1인 추리극',
    players: 1, minutes: 25, available: true, kind: 'original' },
  {
    id: "rehearsal",
    version: 1,
    title: "사라진 축제 초대장",
    subtitle: "연결과 게임 진행을 확인하는 2인용 테스트 시나리오",
    players: 2,
    minutes: 5,
    available: true,
    kind: "demo",
  },
  {
    id: "detective-x",
    version: 1,
    title: "탐정X의 방문살인",
    subtitle: "축제의 첫 번째 사건 · 시나리오 집필 중",
    players: 4,
    minutes: 60,
    available: false,
    kind: "original",
  },
  {
    id: "murder-festival",
    version: 1,
    title: "살인축제",
    subtitle: "탐정 없는 축제의 두 번째 사건 · 시나리오 집필 중",
    players: 4,
    minutes: 60,
    available: false,
    kind: "original",
  },
  {
    id: "final-murder",
    version: 1,
    title: "마무리 살인",
    subtitle: "축제가 끝난 뒤의 마지막 사건 · 시나리오 집필 중",
    players: 4,
    minutes: 60,
    available: false,
    kind: "original",
  },
];

const rehearsalContent: StoryContent = {
  answerRoleIndex: 1,
  roles: [
    {
      name: "축제 안내원",
      secret:
        "너는 오후 6시에 매표소를 떠났다. 초대장은 그때 책상 위에 있었다. 돌아왔을 때 노란색 봉투가 사라져 있었다.",
    },
    {
      name: "무대 담당자",
      secret:
        "너는 오후 6시 5분에 초대장을 무대 서랍으로 옮겼다. 비를 피하게 하려던 것이지만 안내원에게 말하는 것을 잊었다.",
    },
  ],
  firstClues: [
    "매표소 출입 기록에는 오후 6시 5분, 무대 담당자의 이름이 적혀 있다.",
  ],
  secondClues: [
    "무대 서랍에서 노란색 봉투가 발견됐다. 봉투에는 빗물이 묻지 않았다.",
  ],
  answer:
    "초대장을 옮긴 사람은 무대 담당자다. 비를 피하려고 무대 서랍에 보관했다. 이 이야기는 기능 검증용이며 오리지널 3부작과 무관하다.",
};

/** Current catalog adapter. Database and package-file adapters can replace it. */
export class InMemoryStoryCatalog implements StoryCatalog {
  private readonly versions = new Map<string, StoryVersion>();

  constructor() {
    for (const scenario of scenarios) {
      this.versions.set(this.key(scenario.id, scenario.version), {
        scenario,
        content: scenario.id === "rehearsal" ? rehearsalContent : emptyContent(),
      });
    }
  }

  list() {
    return scenarios.map((scenario) => ({ ...scenario }));
  }

  get(id: string, version?: number) {
    const scenario = scenarios.find(
      (item) => item.id === id && (version === undefined || item.version === version),
    );
    return scenario
      ? this.versions.get(this.key(id, scenario.version))
      : undefined;
  }

  private key(id: string, version: number) {
    return `${id}:${version}`;
  }
}

function emptyContent(): StoryContent {
  return { roles: [], firstClues: [], secondClues: [], answer: "" };
}

export const storyCatalog: StoryCatalog = new InMemoryStoryCatalog();
