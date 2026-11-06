import { expect, test } from 'bun:test';
import { createStoryDraft, editorErrors, serializeDraft, renameScene, hasPreservedSceneReference } from '../../web/src/pages/workshop/model/_editor';
import { storyPackageSchema } from '@festival/shared';

test('localized starter is valid and preserves non-editor content across export/import', () => {
  for (const locale of ['ko', 'en'] as const) {
    const source = createStoryDraft(locale);
    expect(storyPackageSchema.safeParse(source).success).toBe(true);
    expect(source.story.locale).toBe(locale);
    expect(source.content.scenes.length).toBe(2);
    source.content.assets.push({ id: 'music', path: 'music.ogg', mediaType: 'audio' });
    source.content.scenes[0]!.cues.push({ type: 'wait', durationMs: 200 });
    source.content.scenes[0]!.choices.push({ id: 'continue', label: 'Continue', targetSceneId: 'investigation', visibleWhen: { type: 'always' } });
    const preserved = structuredClone(source.content.mechanics);
    source.story.title = 'Edited';
    const imported = JSON.parse(serializeDraft(source));
    expect(imported).toEqual(source);
    expect(imported.content.mechanics).toEqual(preserved);
  }
});

test('broken references, duplicate IDs and blank dialogue cannot export', () => {
  const source = createStoryDraft('en');
  source.content.scenes[0]!.nextSceneId = 'missing';
  expect(editorErrors(source, 'en')[0]).toContain('nextSceneId');
  expect(() => serializeDraft(source)).toThrow();
  source.content.scenes[0]!.nextSceneId = 'investigation';
  source.content.scenes[1]!.id = 'intro';
  expect(editorErrors(source, 'ko').length).toBeGreaterThan(0);
  source.content.scenes[1]!.id = 'investigation';
  const cue = source.content.scenes[0]!.cues[0]!;
  if (cue.type === 'dialogue.show') cue.text = ' ';
  expect(editorErrors(source, 'en').some(error => error.includes('cues.0.text'))).toBe(true);
});


test('scene rename updates preserved choice/information references and deletion guards them', () => {
  const source = createStoryDraft('en');
  source.content.scenes[0]!.choices.push({ id: 'go', label: 'Go', targetSceneId: 'investigation', visibleWhen: { type: 'always' } });
  source.content.information.push({ id: 'news', title: ' News ', body: ' Details ', audience: { type: 'all' }, releasedWhen: { type: 'scene_entered', sceneId: 'investigation' }, sharing: 'never', shareableWithRoleIds: [] });
  expect(hasPreservedSceneReference(source, 'investigation')).toBe(true);
  renameScene(source, 1, 'new-scene');
  expect(editorErrors(source, 'en')).toEqual([]);
  expect(source.content.scenes[0]!.nextSceneId).toBe('new-scene');
  expect(source.content.scenes[0]!.choices[0]!.targetSceneId).toBe('new-scene');
  expect(source.content.information[0]!.releasedWhen).toEqual({ type: 'scene_entered', sceneId: 'new-scene' });
  const raw = JSON.parse(JSON.stringify(source));
  delete raw.content.scenes[1].choices;
  const roundtrip = JSON.parse(serializeDraft(raw));
  expect(roundtrip.content.information[0].title).toBe(' News ');
  expect(roundtrip.content.scenes[1].choices).toBeUndefined();
});
