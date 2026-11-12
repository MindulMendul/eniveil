import type { PlayAnalytics } from "./play-analytics";
import type { Game } from "./game";
import type { Store } from "../../store";
import type { StorySessionService } from "./story-session-service";

/** Isolate timer failures; a failed play remains stale and retryable next pass. */
export function sweepPlays(
  {
    analytics,
    game,
    store,
    storySessions,
  }: {
    analytics: PlayAnalytics;
    game: Game;
    store: Store;
    storySessions: StorySessionService;
  },
  report: (error: unknown) => void = (error) =>
    console.error("Play cleanup failed", error),
) {
  const attempt = (work: () => void) => {
    try {
      work();
    } catch (error) {
      report(error);
    }
  };
  attempt(() => {
    for (const id of analytics.stale())
      attempt(() => {
        const before = structuredClone(store.state);
        try {
          analytics.atomic(() => {
            analytics.finish(id, "abandoned", null);
            storySessions.abandon(id);
            game.abandonPlay(id);
          });
        } catch (error) {
          store.state = before;
          throw error;
        }
      });
  });
  attempt(() => analytics.cleanupLegacy());
  attempt(() => analytics.pruneRetention());
}
