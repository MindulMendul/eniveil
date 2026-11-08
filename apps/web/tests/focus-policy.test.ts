import { expect, test } from 'bun:test';
import { shouldRecoverFocus, type FocusRecovery } from '../src/shared/lib/focus-policy';

const idle: FocusRecovery = { ready: true, dialogOpen: false, navigationChanged: false, mainReplaced: false, focusedControlRemoved: false, initialSignedIn: false, focusLost: false };

test('server phase updates preserve focus on an existing game or header control', () => {
  expect(shouldRecoverFocus(idle)).toBe(false);
  expect(shouldRecoverFocus({ ...idle, mainReplaced: true })).toBe(false);
  expect(shouldRecoverFocus({ ...idle, focusLost: true })).toBe(false);
});

test('solo and other screen replacements recover only lost focus', () => {
  expect(shouldRecoverFocus({ ...idle, mainReplaced: true, focusLost: true })).toBe(true);
  expect(shouldRecoverFocus({ ...idle, mainReplaced: true, focusLost: false })).toBe(false);
});

test('signed-in initialization waits for the final rendered screen', () => {
  const initial = { ...idle, initialSignedIn: true, focusLost: true };
  expect(shouldRecoverFocus({ ...initial, ready: false })).toBe(false);
  expect(shouldRecoverFocus(initial)).toBe(true);
  expect(shouldRecoverFocus({ ...initial, focusLost: false })).toBe(false);
});

test('explicit navigation focuses content while open dialogs retain focus', () => {
  expect(shouldRecoverFocus({ ...idle, navigationChanged: true })).toBe(true);
  expect(shouldRecoverFocus({ ...idle, navigationChanged: true, dialogOpen: true })).toBe(false);
  expect(shouldRecoverFocus({ ...idle, mainReplaced: true, focusLost: true, dialogOpen: true })).toBe(false);
});

test('a removed in-game control recovers focus without waiting for a route change', () => {
  expect(shouldRecoverFocus({ ...idle, focusedControlRemoved: true, focusLost: true })).toBe(true);
  expect(shouldRecoverFocus({ ...idle, focusedControlRemoved: true, focusLost: false })).toBe(false);
});
