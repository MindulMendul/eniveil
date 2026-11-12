import type { StoryPackage } from "@festival/shared";
import type { PlayAnalytics } from "./play-analytics";
import type { SQLiteStoryRunStore } from "../../infrastructure/sqlite/story-run-store";
import type { StoryCatalog } from "../platform/stories/ports/story-catalog";

/** The old API's unguessable run ID was its bearer capability. Redeem it once; never reassign an owned play. */
export function claimLegacyPlay(
  deps: {
    analytics: PlayAnalytics;
    runs: SQLiteStoryRunStore;
    stories: StoryCatalog;
  },
  id: string,
  owner: string,
  roomId: string | null,
) {
  const { analytics, runs, stories } = deps;
  analytics.atomic(() => {
    if (analytics.play(id)) {
      analytics.member(id, owner);
      return;
    }
    const run = runs.get(id);
    if (
      !run ||
      !/^[0-9a-f-]{36}$/.test(id) ||
      !analytics.canClaimLegacy(
        Date.parse(run.startedAt),
        Date.parse(run.endedAt ?? run.lastActiveAt),
      )
    )
      throw new Error(
        "이전 플레이의 복구 기간이 지났어. 새 플레이를 시작해 줘.",
      );
    const immutable: StoryPackage | undefined = run.storyPackage;
    const source: StoryPackage | undefined =
      run.storyPackage ?? stories.get(run.storyId, run.storyVersion);
    analytics.start(
      id,
      run.storyId,
      run.storyVersion,
      "solo",
      roomId,
      [{ id: owner, role: "detective" }],
      {
        story: {
          id: run.storyId,
          version: run.storyVersion,
          title: source?.story.title ?? "이전 플레이",
        },
      },
    );
    analytics.markLegacy(id, Date.parse(run.startedAt), null);
    if (run.outcome) {
      const result =
        run.outcome === "completed"
          ? {
              outcome: "success",
              cues:
                immutable?.content.scenes.find(
                  (scene) => scene.id === "resolution",
                )?.cues ?? [],
              message: "이전 플레이를 완료했어.",
            }
          : { outcome: "failure", message: "이전 플레이는 해결되지 않았어." };
      analytics.finish(id, run.outcome, result);
      analytics.markLegacy(
        id,
        Date.parse(run.startedAt),
        run.endedAt ? Date.parse(run.endedAt) : null,
      );
    } else {
      analytics.stage(
        id,
        owner,
        run.currentSceneId === "investigation" ? "explore" : "intro",
      );
    }
  });
}
