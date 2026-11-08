import type { Game } from '../game/game';

/** Grace expiry follows the same workflow signals as explicit game commands. */
export function notifySessionExpiry(
  transition: ReturnType<Game['expireConnection']>,
  notify: (action: 'event' | 'end', payload: object) => void,
) {
  if (!transition) return;
  if (transition.ended) notify('end', { sessionId: transition.sessionId });
  else notify('event', { sessionId: transition.sessionId, phase: transition.phase });
}
