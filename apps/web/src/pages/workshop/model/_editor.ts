import { storyPackageSchema, type StoryPackage } from '@festival/shared';

/** A fictional starter, independent of the server's playable story content. */
export function createStoryDraft(locale: 'ko' | 'en'): StoryPackage {
  const text = (ko: string, en: string) => locale === 'en' ? en : ko;
  return storyPackageSchema.parse({
    format: 'murder-parker-story', formatVersion: 1,
    story: { id: `draft-${crypto.randomUUID()}`, version: 1, mode: 'solo', locale,
      title: text('새 이야기', 'New story'), subtitle: text('이야기를 소개해 주세요.', 'Describe your story.'),
      playerCount: { min: 1, max: 1 }, estimatedMinutes: 10, startSceneId: 'intro' },
    content: { characters: [], assets: [], roles: [], information: [], items: [],
      scenes: [
        { id: 'intro', cues: [{ type: 'dialogue.show', text: text('조사를 시작합니다.', 'The investigation begins.') }], nextSceneId: 'investigation', choices: [] },
        { id: 'investigation', cues: [{ type: 'dialogue.show', text: text('방 안에서 단서를 찾아보세요.', 'Look for a clue in the room.') }], choices: [] },
      ],
      mechanics: { type: 'solo-investigation',
        victim: { name: text('피해자', 'Victim'), details: text('사건의 피해자입니다.', 'The victim of this case.') },
        suspects: [{ id: 'suspect-one', name: text('용의자', 'Suspect'), details: text('사건 현장에 있었습니다.', 'Was present at the scene.') }],
        evidence: [{ id: 'clue-one', icon: '🔎', name: text('단서', 'Clue'), place: text('방', 'Room'), detail: text('사건을 해결할 단서입니다.', 'A clue to solve the case.') }],
        locations: [{ id: 'room', name: text('방', 'Room'), evidenceIds: ['clue-one'], mood: text('조용한 방입니다.', 'A quiet room.') }],
        alibis: [], reactions: [], hints: {},
        solution: { culpritId: 'suspect-one', requiredEvidenceIds: ['clue-one'], minimumEvidenceCount: 1,
          resolutionLines: [text('사건을 해결했습니다.', 'You solved the case.')],
          failureMessages: { wrongSuspect: text('다시 생각해 보세요.', 'Think again.'), insufficientEvidence: text('증거가 더 필요합니다.', 'More evidence is needed.') } },
      },
    },
  });
}

/** A minimal, playable multiplayer package.  Keep this in the editor rather
 * than shipping it as public story content: it is only a creator starting point. */
export function createRoleplayDraft(locale: 'ko' | 'en'): StoryPackage {
  const text = (ko: string, en: string) => locale === 'en' ? en : ko;
  return storyPackageSchema.parse({
    format: 'murder-parker-story', formatVersion: 1,
    story: { id: `roleplay-${crypto.randomUUID()}`, version: 1, mode: 'multiplayer', locale,
      title: text('새 역할극', 'New roleplay'), subtitle: text('참가자와 함께 진상을 밝혀 보세요.', 'Uncover the truth together.'),
      playerCount: { min: 2, max: 2 }, estimatedMinutes: 20, startSceneId: 'intro' },
    content: {
      characters: [], assets: [], information: [],
      scenes: [{ id: 'intro', cues: [{ type: 'dialogue.show', text: text('역할과 비공개 기억을 확인하세요.', 'Check your role and private memory.') }], choices: [] }],
      roles: [
        { id: 'role-one', name: text('참가자 1', 'Player one') },
        { id: 'role-two', name: text('참가자 2', 'Player two') },
      ],
      items: [],
      mechanics: {
        type: 'roleplay',
        memories: [
          { roleId: 'role-one', text: text('당신만 아는 기억을 작성하세요.', 'Write a memory only you know.') },
          { roleId: 'role-two', text: text('당신만 아는 다른 기억을 작성하세요.', 'Write another private memory.') },
        ],
        firstClues: [{ id: 'first-clue', text: text('1차 조사 단서', 'First investigation clue') }], secondClues: [],
        stageDurations: { firstInvestigationSeconds: 300, meetingSeconds: 180, secondInvestigationSeconds: 300 },
        meetingPrompt: text('각자 확인한 단서를 공유하고 토론하세요.', 'Share your clues and discuss them.'),
        finalChoices: [
          { id: 'choose-role-one', label: text('참가자 1', 'Player one'), outcome: text('진상을 확인했습니다.', 'You found the truth.') },
          { id: 'choose-role-two', label: text('참가자 2', 'Player two'), outcome: text('다른 가능성도 살펴보세요.', 'Consider another possibility.') },
        ],
        rooms: [], resources: [], itemRecipes: [],
        answer: text('진상과 결말을 작성하세요.', 'Write the truth and ending.'), answerRoleId: 'role-one',
      },
    },
  });
}

export function editorErrors(source: unknown, locale: 'ko' | 'en'): string[] {
  const result = storyPackageSchema.safeParse(source);
  if (result.success) return [];
  return result.error.issues.map(issue => `${issue.path.join('.') || 'package'}: ${locale === 'en' && issue.code === 'custom' ? 'Check IDs and references; all references must exist and IDs must be unique.' : issue.message}`);
}

export function serializeDraft(source: StoryPackage): string {
  // Validate without replacing the imported document: untouched fields retain their values.
  storyPackageSchema.parse(source);
  const serialized = JSON.stringify(source);
  if (new TextEncoder().encode(serialized).length > 900 * 1024) throw new Error('900 KB');
  return serialized;
}

export function renameScene(source: StoryPackage, index: number, id: string): boolean {
  const scene = source.content.scenes[index];
  if (!scene || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || source.content.scenes.some((entry, other) => other !== index && entry.id === id)) return false;
  const previous = scene.id;
  scene.id = id;
  if (source.story.startSceneId === previous) source.story.startSceneId = id;
  for (const entry of source.content.scenes) {
    if (entry.nextSceneId === previous) entry.nextSceneId = id;
    for (const choice of entry.choices ?? []) if (choice.targetSceneId === previous) choice.targetSceneId = id;
  }
  for (const information of source.content.information) {
    if (information.releasedWhen.type === 'scene_entered' && information.releasedWhen.sceneId === previous) information.releasedWhen.sceneId = id;
  }
  return true;
}

export function hasPreservedSceneReference(source: StoryPackage, id: string): boolean {
  return source.content.scenes.some(scene => (scene.choices ?? []).some(choice => choice.targetSceneId === id)) ||
    source.content.information.some(info => info.releasedWhen.type === 'scene_entered' && info.releasedWhen.sceneId === id);
}
