export type FocusRecovery = {
  ready: boolean;
  dialogOpen: boolean;
  navigationChanged: boolean;
  mainReplaced: boolean;
  focusedControlRemoved: boolean;
  initialSignedIn: boolean;
  focusLost: boolean;
};

export function shouldRecoverFocus(state: FocusRecovery) {
  if (!state.ready || state.dialogOpen) return false;
  if (state.navigationChanged) return true;
  return state.focusLost && (state.mainReplaced || state.focusedControlRemoved || state.initialSignedIn);
}
