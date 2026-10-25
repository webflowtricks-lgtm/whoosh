import type { Quest, QuestMaintenanceMail, QuestReward } from '../types';

interface QuestRewardSnapshot {
  ryos: number;
  gems: number;
  items: string[];
}

export type QuestDefinition = Pick<Quest, 'id' | 'title' | 'rewards'>;

function currencyTotals(rewards: QuestReward[], questId: string): Pick<QuestRewardSnapshot, 'ryos' | 'gems'> {
  const totals = { ryos: 0, gems: 0 };
  for (const reward of rewards) {
    if (reward.type !== 'ryos' && reward.type !== 'gems') continue;
    const amount = Number(reward.value);
    if (!Number.isSafeInteger(amount) || amount < 0 || !Number.isSafeInteger(totals[reward.type] + amount)) {
      throw new Error(`Recompensa inválida na missão ${questId}.`);
    }
    totals[reward.type] += amount;
  }
  return totals;
}

function rewardToken(reward: QuestReward): string | null {
  return ['title', 'unlock_character', 'frame', 'banner', 'card', 'skill_skin'].includes(reward.type)
    ? `${reward.type}:${reward.value}`
    : null;
}

function hasReward(profile: Record<string, unknown>, reward: QuestReward): boolean {
  const fields: Partial<Record<QuestReward['type'], string>> = {
    title: 'unlockedTitles',
    unlock_character: 'unlockedCharacterNames',
    frame: 'unlockedFrames',
    banner: 'unlockedBanners',
    card: 'collectedCardIds',
    skill_skin: 'unlockedSkillSkins',
  };
  const field = fields[reward.type];
  return !!field && Array.isArray(profile[field]) && (profile[field] as unknown[]).includes(reward.value);
}

function normalizedRewards(rewards: QuestReward[]): string {
  return JSON.stringify(rewards.map(reward => ({
    type: reward.type,
    value: reward.value,
    imageUrl: reward.imageUrl || '',
    rarity: reward.rarity || '',
  })).sort((left, right) =>
    `${left.type}:${left.value}:${left.imageUrl}:${left.rarity}`.localeCompare(
      `${right.type}:${right.value}:${right.imageUrl}:${right.rarity}`,
    ),
  ));
}

export function reconcileQuestMaintenanceProfile(
  profile: Record<string, unknown>,
  previousQuests: QuestDefinition[],
  updatedQuests: QuestDefinition[],
  createId: () => string,
): boolean {
  const completedIds = Array.isArray(profile.completedQuestIds)
    ? profile.completedQuestIds.filter((id): id is string => typeof id === 'string')
    : [];
  const previousById = new Map(previousQuests.map(quest => [quest.id, quest]));
  const updatedById = new Map(updatedQuests.map(quest => [quest.id, quest]));
  const snapshots = profile.questRewardSnapshots && typeof profile.questRewardSnapshots === 'object'
    ? profile.questRewardSnapshots as Record<string, Partial<QuestRewardSnapshot>>
    : {};
  const inbox = Array.isArray(profile.questMaintenanceInbox)
    ? (profile.questMaintenanceInbox as QuestMaintenanceMail[]).filter(mail =>
      !!mail && typeof mail === 'object' && typeof mail.id === 'string' &&
      Array.isArray(mail.rewards),
    )
    : [];
  let changed = false;

  for (const questId of completedIds) {
    const previous = previousById.get(questId);
    const updated = updatedById.get(questId);
    if (!previous || !updated ||
        normalizedRewards(previous.rewards) === normalizedRewards(updated.rewards)) continue;

    const previousTotals = currencyTotals(previous.rewards, questId);
    const updatedTotals = currencyTotals(updated.rewards, questId);
    const saved = snapshots[questId];
    const snapshot: QuestRewardSnapshot = {
      ryos: Number.isSafeInteger(saved?.ryos) && Number(saved.ryos) >= 0
        ? Math.max(Number(saved.ryos), previousTotals.ryos)
        : previousTotals.ryos,
      gems: Number.isSafeInteger(saved?.gems) && Number(saved.gems) >= 0
        ? Math.max(Number(saved.gems), previousTotals.gems)
        : previousTotals.gems,
      items: Array.isArray(saved?.items)
        ? saved.items.filter((item): item is string => typeof item === 'string')
        : [],
    };
    const rewards: QuestReward[] = [];

    for (const type of ['ryos', 'gems'] as const) {
      const amount = Math.max(0, updatedTotals[type] - snapshot[type]);
      if (amount > 0) rewards.push({ type, value: String(amount) });
      snapshot[type] = Math.max(snapshot[type], updatedTotals[type]);
    }
    for (const reward of updated.rewards) {
      const token = rewardToken(reward);
      if (!token) continue;
      if (!snapshot.items.includes(token) && !hasReward(profile, reward)) {
        rewards.push(reward);
      }
      if (!snapshot.items.includes(token)) snapshot.items.push(token);
    }

    snapshots[questId] = snapshot;
    changed = true;
    if (rewards.length > 0) {
      if (inbox.filter(mail => !mail.claimedAt).length >= 200) {
        throw new Error(`A caixa de entrada da conta ${String(profile.username || '')} está cheia.`);
      }
      inbox.push({
        id: createId(),
        questId,
        subject: 'Recompensa de manutenção de missão',
        message: `A missão "${updated.title}" teve suas recompensas atualizadas. Resgate os itens e as moedas disponíveis nesta mensagem.`,
        createdAt: new Date().toISOString(),
        rewards,
      });
      const pending = inbox.filter(mail => !mail.claimedAt);
      const claimed = inbox.filter(mail => !!mail.claimedAt).slice(-100);
      inbox.splice(0, inbox.length, ...claimed, ...pending);
    }
  }

  if (changed) {
    profile.questRewardSnapshots = snapshots;
    profile.questMaintenanceInbox = inbox;
  }
  return changed;
}

export function grantQuestMaintenanceRewards(
  profile: Record<string, unknown>,
  rewards: QuestReward[],
): QuestReward[] {
  const granted: QuestReward[] = [];
  const addUnique = (field: string, value: string): boolean => {
    const values = Array.isArray(profile[field])
      ? (profile[field] as unknown[]).filter((item): item is string => typeof item === 'string')
      : [];
    if (values.includes(value)) return false;
    profile[field] = [...values, value];
    return true;
  };

  for (const reward of rewards) {
    if (reward.type === 'ryos' || reward.type === 'gems') {
      const amount = Number(reward.value);
      if (!Number.isSafeInteger(amount) || amount <= 0) {
        throw new Error(`Recompensa inválida para a missão: ${reward.type}.`);
      }
      const current = Number(profile[reward.type]);
      const balance = Number.isSafeInteger(current) && current >= 0
        ? current
        : reward.type === 'ryos' ? 1500 : 120;
      if (!Number.isSafeInteger(balance + amount)) {
        throw new Error(`Saldo excede o limite seguro para a recompensa: ${reward.type}.`);
      }
      profile[reward.type] = balance + amount;
      granted.push(reward);
      continue;
    }

    let wasGranted = false;
    if (reward.type === 'title') {
      wasGranted = addUnique('unlockedTitles', reward.value);
    } else if (reward.type === 'unlock_character') {
      wasGranted = addUnique('unlockedCharacterNames', reward.value);
    } else if (reward.type === 'frame') {
      wasGranted = addUnique('unlockedFrames', reward.value);
      if (wasGranted && reward.imageUrl) addUnique('unlockedFrameUrls', reward.imageUrl);
      if (wasGranted && !profile.equippedFrameUrl && reward.imageUrl) {
        profile.equippedFrame = reward.value;
        profile.equippedFrameUrl = reward.imageUrl;
      }
    } else if (reward.type === 'banner') {
      wasGranted = addUnique('unlockedBanners', reward.value);
      if (wasGranted && reward.imageUrl) addUnique('unlockedBannerUrls', reward.imageUrl);
      if (wasGranted && !profile.equippedBannerUrl && reward.imageUrl) profile.equippedBannerUrl = reward.imageUrl;
    } else if (reward.type === 'card') {
      wasGranted = addUnique('collectedCardIds', reward.value);
    } else if (reward.type === 'skill_skin') {
      wasGranted = addUnique('unlockedSkillSkins', reward.value);
    }
    if (wasGranted) granted.push(reward);
  }
  return granted;
}
