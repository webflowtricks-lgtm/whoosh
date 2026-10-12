export function calculateBattleXp(
  victory: boolean,
  turns: number,
  alivePlayerCombatantsCount: number,
  damageDealt: number,
): number {
  const safeTurns = Math.max(1, turns);
  const safeAlive = Math.max(0, alivePlayerCombatantsCount);
  const safeDamage = Math.max(0, damageDealt);

  if (victory) {
    const baseVictoryXp = 200;
    const aliveBonus = safeAlive * 40;
    const damageBonus = Math.min(120, Math.floor(safeDamage * 0.4));
    const speedBonus = Math.max(10, Math.floor(80 - safeTurns * 5));
    return baseVictoryXp + aliveBonus + damageBonus + speedBonus;
  }

  const baseDefeatLoss = -450;
  const damageMitigation = Math.min(60, Math.floor(safeDamage * 0.2));
  const turnMitigation = Math.min(40, safeTurns * 3);
  return baseDefeatLoss + damageMitigation + turnMitigation;
}
