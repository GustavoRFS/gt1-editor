import type { Gt1Patch } from './types';

export const DEFAULT_GT1_UNIT_ID = 0;

export function updatePatchList(patches: Gt1Patch[], updated: Gt1Patch): Gt1Patch[] {
  return patches.map((patch) => patch.id === updated.id ? updated : patch);
}

export function setPatchDirty(ids: ReadonlySet<string>, patchId: string, dirty: boolean): Set<string> {
  const next = new Set(ids);
  if (dirty) next.add(patchId);
  else next.delete(patchId);
  return next;
}

export function addPatches(current: Gt1Patch[], incoming: Gt1Patch[]): Gt1Patch[] {
  return [...current, ...incoming];
}

export function upsertUserPatch(current: Gt1Patch[], incoming: Gt1Patch, dirtyPatchIds: ReadonlySet<string>): Gt1Patch[] {
  if (incoming.userPatch === undefined) return addPatches(current, [incoming]);
  const index = current.findIndex((patch) => patch.sourceFormat === 'device' && patch.userPatch === incoming.userPatch);
  if (index < 0) return [...current, incoming];
  if (dirtyPatchIds.has(current[index].id)) return current;
  const next = [...current];
  next[index] = incoming;
  return next;
}
