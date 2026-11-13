import { expect, test } from "bun:test";
import { appendEvidenceResponse } from "../apps/web/src/features/game/response-dedupe";

test("an evidence reaction is recorded once while different evidence remains available", () => {
  const first = appendEvidenceResponse([], "ledger", "장부", "장부 반응");
  expect(first.added).toBe(true);
  const repeated = appendEvidenceResponse(first.responses, "ledger", "장부", "장부 반응");
  expect(repeated.added).toBe(false);
  const other = appendEvidenceResponse(repeated.responses, "key", "열쇠", "열쇠 반응");
  expect(other.added).toBe(true);
  expect(other.responses).toHaveLength(2);
});
