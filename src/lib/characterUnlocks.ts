import { Character, Quest, UserProfile } from '../types';

export function isCharacterUnlocked(char: Character, user: UserProfile | null, quests: Quest[]): boolean {
  if (!char.requiredQuestIds || char.requiredQuestIds.length === 0) {
    return true;
  }

  if (user?.unlockedCharacterNames?.some(name =>
    name.toLowerCase() === char.name.toLowerCase() || name.toLowerCase() === char.id.toLowerCase()
  )) {
    return true;
  }

  const completed = user?.completedQuestIds || [];
  return char.requiredQuestIds.every(requiredQuestId => completed.some(completedId => {
    if (completedId.toLowerCase() === requiredQuestId.toLowerCase()) {
      return true;
    }
    const completedQuest = quests.find(quest => quest.id === completedId);
    return completedQuest?.title.toLowerCase() === requiredQuestId.toLowerCase();
  }));
}

export function getCharacterLockReason(char: Character, user: UserProfile | null, quests: Quest[]): string | undefined {
  if (isCharacterUnlocked(char, user, quests)) {
    return undefined;
  }

  const completed = user?.completedQuestIds || [];
  const missing = (char.requiredQuestIds || []).filter(requiredQuestId => !completed.some(completedId => {
    if (completedId.toLowerCase() === requiredQuestId.toLowerCase()) {
      return true;
    }
    const completedQuest = quests.find(quest => quest.id === completedId);
    return completedQuest?.title.toLowerCase() === requiredQuestId.toLowerCase();
  })).map(requiredQuestId => quests.find(quest => quest.id === requiredQuestId)?.title || requiredQuestId);

  return `Bloqueado! Requer a missão "${missing.join(', ')}"`;
}
