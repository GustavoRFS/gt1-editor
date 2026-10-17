import type { Gt1Patch } from './types';
import { patchContentsEqual } from './sysex';

export function findMatchingUserPatch(currentPatch: Gt1Patch, userPatches: Gt1Patch[]): Gt1Patch | undefined {
  return userPatches.find((patch) => patch.userPatch !== undefined && patchContentsEqual(currentPatch, patch));
}

export function mergeUserPatchScan(
  previous: Gt1Patch[],
  scanned: Gt1Patch[],
  failures: Array<{ userPatch: number }>,
): Gt1Patch[] {
  const failedSlots = new Set(failures.map(({ userPatch }) => userPatch));
  const bySlot = new Map<number, Gt1Patch>();
  const scannedSlots = new Set(scanned.map(({ userPatch }) => userPatch));

  for (const patch of previous) {
    const refreshingNameOnly = scanned.some((candidate) => candidate.userPatch === patch.userPatch && !candidate.complete);
    if (patch.userPatch !== undefined && (failedSlots.has(patch.userPatch) || !scannedSlots.has(patch.userPatch) || (refreshingNameOnly && patch.complete))) {
      bySlot.set(patch.userPatch, patch);
    }
  }
  for (const patch of scanned) {
    if (patch.userPatch === undefined) continue;
    const cached = bySlot.get(patch.userPatch);
    // Tone Studio refreshes the compact slot name list first; retain the last
    // hardware-read payload until this slot is opened and hydrated in full.
    bySlot.set(patch.userPatch, cached?.complete && !patch.complete
      ? { ...cached, name: patch.name, sourceName: patch.sourceName }
      : patch);
  }

  return [...bySlot.values()].sort((left, right) => (left.userPatch ?? 0) - (right.userPatch ?? 0));
}

export function composePatchLibrary(
  devicePatches: Gt1Patch[],
  sessionPatches: Gt1Patch[],
  editOverlays: Record<string, Gt1Patch>,
): Gt1Patch[] {
  return [...devicePatches, ...sessionPatches].map((patch) => editOverlays[patch.id] ?? patch);
}
