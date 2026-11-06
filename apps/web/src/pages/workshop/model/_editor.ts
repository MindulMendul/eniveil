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

export function renameScene(source: StoryPackage, index: number, id: string): void {
  const scene = source.content.scenes[index];
  if (!scene) return;
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
}

export function hasPreservedSceneReference(source: StoryPackage, id: string): boolean {
  return source.content.scenes.some(scene => (scene.choices ?? []).some(choice => choice.targetSceneId === id)) ||
    source.content.information.some(info => info.releasedWhen.type === 'scene_entered' && info.releasedWhen.sceneId === id);
}
