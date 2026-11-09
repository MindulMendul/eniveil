export type SoloUi = {
  phase: "intro" | "cast" | "explore" | "alibi" | "cross" | "accuse";
  roomId: string;
  currentEvidence: string;
  selectedSuspect: string;
  accusation: string[];
  responses: { text: string; source: string }[];
  openingIndex: number;
  hintIndex: Record<string, number>;
};
export const soloUiKey = (id: string) => `solo-ui:${id}`;
export function restoreSoloUi(
  storage: Storage,
  id: string,
  investigation: boolean,
  found: string[],
  locations: string[],
  suspects: string[],
): SoloUi {
  const empty: SoloUi = {
    phase: investigation ? "explore" : "intro",
    roomId: "",
    currentEvidence: "",
    selectedSuspect: "",
    accusation: [],
    responses: [],
    openingIndex: 0,
    hintIndex: {},
  };
  try {
    const data = JSON.parse(
      storage.getItem(soloUiKey(id)) ?? "null",
    ) as Partial<SoloUi> | null;
    if (!data) return empty;
    const allowed = investigation
      ? ["cast", "explore", "alibi", "cross", "accuse"]
      : ["intro"];
    const phase = allowed.includes(data.phase ?? "")
      ? data.phase!
      : empty.phase;
    return {
      ...empty,
      phase,
      roomId: locations.includes(data.roomId ?? "") ? data.roomId! : "",
      currentEvidence: found.includes(data.currentEvidence ?? "")
        ? data.currentEvidence!
        : "",
      selectedSuspect: suspects.includes(data.selectedSuspect ?? "")
        ? data.selectedSuspect!
        : "",
      accusation: [
        ...new Set(
          Array.isArray(data.accusation)
            ? data.accusation.filter((id) => found.includes(id))
            : [],
        ),
      ].slice(0, 3),
      responses: validResponses(data.responses),
      openingIndex: Number.isInteger(data.openingIndex)
        ? Math.max(0, Math.min(1000, data.openingIndex!))
        : 0,
      hintIndex: validHints(data.hintIndex),
    };
  } catch {
    return empty;
  }
}
function validResponses(value: unknown): SoloUi["responses"] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item) =>
        item &&
        typeof item.text === "string" &&
        typeof item.source === "string",
    )
    .slice(-20)
    .map((item) => ({
      text: item.text.slice(0, 6000),
      source: item.source.slice(0, 100),
    }));
}
function validHints(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, count]) =>
        ["intro", "cast", "explore", "alibi", "cross", "accuse"].includes(
          key,
        ) &&
        typeof count === "number" &&
        Number.isInteger(count) &&
        count >= 0 &&
        count <= 100,
    ),
  );
}
