export type InterrogationResponse = { text: string; source: string; key?: string };

/** Keeps a repeated evidence click from adding another card or analytics event. */
export function appendEvidenceResponse(
  responses: InterrogationResponse[], evidenceId: string, source: string, text: string,
) {
  const key = `evidence:${evidenceId}`;
  if (responses.some((response) => response.key === key || (!response.key && response.source === source)))
    return { added: false as const, responses };
  return { added: true as const, responses: [...responses, { text, source, key }] };
}
