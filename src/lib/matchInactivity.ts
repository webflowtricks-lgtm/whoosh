export const MATCH_INACTIVITY_TIMEOUT_MS = 120_000;

export function getInactiveMatchSlot(
  activityAt: [number, number],
  now: number,
): 0 | 1 | null {
  const inactiveSlots = ([0, 1] as const).filter(
    slot => now - activityAt[slot] >= MATCH_INACTIVITY_TIMEOUT_MS,
  );
  if (inactiveSlots.length === 0) return null;
  return inactiveSlots.reduce((earliest, slot) =>
    activityAt[slot] < activityAt[earliest] ? slot : earliest,
  );
}
