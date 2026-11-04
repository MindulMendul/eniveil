import {
  condition,
  defineQuery,
  defineSignal,
  setHandler,
} from "@temporalio/workflow";

export const sessionEvent = defineSignal("sessionEvent");
export const sessionEnded = defineSignal("sessionEnded");
export const sessionState = defineQuery("sessionState");

export async function roomSessionWorkflow({ sessionId, startedAt }) {
  const state = {
    sessionId,
    status: "active",
    phase: "briefing",
    startedAt,
    updatedAt: startedAt,
    endedAt: null,
  };

  setHandler(sessionEvent, ({ phase, occurredAt }) => {
    if (state.status !== "active") return;
    state.phase = phase;
    state.updatedAt = occurredAt;
  });
  setHandler(sessionEnded, ({ occurredAt }) => {
    if (state.status !== "active") return;
    state.status = "ended";
    state.endedAt = occurredAt;
    state.updatedAt = occurredAt;
  });
  setHandler(sessionState, () => state);

  await condition(() => state.status === "ended");
  return state;
}
