export type PatchSwitchPhase = 'idle' | 'confirming' | 'saving' | 'activating';

export type PatchSwitchState = {
  activePatchId: string | null;
  targetPatchId: string | null;
  dirtyPatchIds: ReadonlySet<string>;
  phase: PatchSwitchPhase;
};

export type PatchSwitchAction =
  | { type: 'request-target'; targetPatchId: string }
  | { type: 'set-active-if-empty'; patchId: string }
  | { type: 'activate-start' }
  | { type: 'save-start' }
  | { type: 'discard' }
  | { type: 'cancel' }
  | { type: 'save-succeeded' }
  | { type: 'activation-succeeded' }
  | { type: 'operation-failed' }
  | { type: 'set-dirty'; patchId: string; dirty: boolean }
  | { type: 'set-active'; patchId: string }
  | { type: 'restore-session'; activePatchId: string | null; dirtyPatchIds: ReadonlySet<string> };

export function getPatchSwitchDecision(
  activePatchId: string | null,
  targetPatchId: string,
  hasPendingChanges: boolean,
): 'noop' | 'activate' | 'confirm' {
  if (activePatchId === targetPatchId) return 'noop';
  return hasPendingChanges ? 'confirm' : 'activate';
}

export function patchSwitchReducer(state: PatchSwitchState, action: PatchSwitchAction): PatchSwitchState {
  switch (action.type) {
    case 'request-target': {
      const decision = getPatchSwitchDecision(
        state.activePatchId,
        action.targetPatchId,
        state.activePatchId !== null && state.dirtyPatchIds.has(state.activePatchId),
      );
      if (decision === 'noop') return state;
      return { ...state, targetPatchId: action.targetPatchId, phase: decision === 'confirm' ? 'confirming' : 'activating' };
    }
    case 'set-active-if-empty':
      return state.activePatchId === null ? { ...state, activePatchId: action.patchId } : state;
    case 'activate-start':
    case 'discard':
      return { ...state, phase: 'activating' };
    case 'save-start':
      return { ...state, phase: 'saving' };
    case 'cancel':
      return { ...state, targetPatchId: null, phase: 'idle' };
    case 'save-succeeded': {
      const dirtyPatchIds = new Set(state.dirtyPatchIds);
      if (state.activePatchId) dirtyPatchIds.delete(state.activePatchId);
      return { ...state, dirtyPatchIds, phase: 'activating' };
    }
    case 'activation-succeeded': {
      const dirtyPatchIds = new Set(state.dirtyPatchIds);
      if (state.activePatchId) dirtyPatchIds.delete(state.activePatchId);
      return {
        activePatchId: state.targetPatchId ?? state.activePatchId,
        targetPatchId: null,
        dirtyPatchIds,
        phase: 'idle',
      };
    }
    case 'operation-failed':
      return {
        ...state,
        phase: state.activePatchId && state.dirtyPatchIds.has(state.activePatchId) ? 'confirming' : 'idle',
      };
    case 'set-dirty': {
      const dirtyPatchIds = new Set(state.dirtyPatchIds);
      if (action.dirty) dirtyPatchIds.add(action.patchId);
      else dirtyPatchIds.delete(action.patchId);
      return { ...state, dirtyPatchIds };
    }
    case 'set-active':
      return { ...state, activePatchId: action.patchId };
    case 'restore-session':
      return { activePatchId: action.activePatchId, targetPatchId: null, dirtyPatchIds: new Set(action.dirtyPatchIds), phase: 'idle' };
  }
}
