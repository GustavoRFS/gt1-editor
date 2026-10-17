# GT-1 System Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Sistema effect tab for the GT-1’s six Tone Studio system-setting groups, read them on connection, apply edits directly over SysEx, and clarify the no-patch disconnected state.

**Architecture:** Add an independent GT-1 system-settings model and protocol path alongside patch handling. Reuse the MIDI client’s serialized queue and existing Roland frame/checksum utilities; keep system values out of patch objects, dirty state, and the persisted user-patch query. Render settings through the existing top-tab navigator and parameter control primitives.

**Tech Stack:** React Native, TypeScript, Expo Router material top tabs, existing MIDI transports, Roland SysEx, existing app state and feedback.

**Spec:** `docs/superpowers/specs/2026-10-16-gt1-system-settings-design.md`

## Global Constraints

- System settings are device-global and are not stored in, or restored from, the persisted patch cache.
- No save/copy action is added for system settings; Tone Studio applies each setting directly.
- Disable these controls until connected system data has been read.
- Use the seven system memory blocks and size 64 defined by the GT-1 Tone Studio decompilation.
- Output Select exposes eight named choices, values 0 through 7.
- The disconnected empty state is a presentation change only and must not alter connection, patch selection, or fetch behavior.

## Review Focus

- A system read/write response with the wrong address or malformed checksum must not update settings state.
- Device disconnect during a system operation must stop the operation and disable the controls.
- A system edit must not call patch parameter/name writers or mark any patch dirty.
- Output Select must not expose a ninth value, even though decompiled range metadata says max 8.
- Empty-state copy must follow connection state without changing the existing selected-patch view.

---

## File map

- Create `src/gt1/systemSettings.ts` for supported GT-1 setting definitions, option labels, address mapping, and conversion between stored values and UI values.
- Create `src/gt1/knobAssignmentOptions.ts` for the 310 KNOB assignment names from the GT-1 Tone Studio definition.
- Modify `src/gt1/sysex.ts` for system memory RQ1 and DT1 frame creation, using existing checksum and wire-frame validation.
- Modify `src/gt1/client.ts` for serialized system block reads and single-setting writes.
- Modify `app/index.tsx` to read settings during connection and expose a handler that updates system-setting state independently from patch state.
- Modify `src/components/PatchEditor.tsx` to add the Sistema top tab, render the six groups, and show a disconnected empty state when no patch is selected.
- Reuse `src/components/ParameterControl.tsx` for switches, selects and numeric values; add only system-specific presentation where existing control types cannot represent the Tone Studio definitions.
- Use the existing error feedback in `app/index.tsx` for failed setting writes.

## Task 1: Model GT-1 system settings and SysEx frames

**Files:**
- Create: `src/gt1/systemSettings.ts`
- Modify: `src/gt1/sysex.ts`

**Interfaces:**
- Produce `Gt1SystemSettingId` as the union of the 21 GT-1 setting IDs listed in `SystemSettingDefinitionGT.as`, and `Gt1SystemSettings` as `Record<Gt1SystemSettingId, number>`.
- Produce `Gt1SystemSettingDefinition` with `id: Gt1SystemSettingId`, `group: string`, `label: string`, `address: readonly [number, number, number, number]`, `width: 1 | 2`, `control: 'toggle' | 'select' | 'number'`, `min: number`, `max: number`, `step: number`, and optional `options: { value: number; label: string }[]`.
- Produce `gt1SystemSettingGroups` containing Play Option, Knob Setting, Preference, Phrase Loop, USB, and Output Select.
- Produce `encodeSystemSettingsReadRequest(unitId, blockIndex): Uint8Array` for the seven `(address, size 64)` ranges in the spec.
- Produce `encodeSystemSettingWrite(unitId, settingId, value): Uint8Array` for a single mapped parameter.
- Produce `decodeSystemSettingsBlock(response, blockIndex, previous): Gt1SystemSettings`, which validates the Roland frame and address before applying the returned bytes.

- [ ] Extract each GT-1 control’s exact address, width, min/max, step and options from the decompiled address map and `SystemSettingDefinitionGT.as`; include only controls marked `gt001`.
- [ ] Implement RQ1 request generation for all seven system blocks, each requesting 64 bytes, and DT1 single-setting writes using the existing checksum/wire-frame conversion path.
- [ ] Decode block responses into the independent settings model; reject invalid checksums, unexpected addresses and unsupported values.
- [ ] Keep Output Select’s options to the explicit eight labels with values `0..7`, regardless of broad metadata max.

## Task 2: Serialize system reads and writes in `Gt1Client`

**Files:**
- Modify: `src/gt1/client.ts`

**Interfaces:**
- Produce `readSystemSettings(unitId, onProgress?: (completed: number, total: number) => void, signal?: AbortSignal): Promise<Gt1SystemSettings>`.
- Produce `writeSystemSetting(unitId, settingId, value): Promise<void>`.
- Both methods use the existing `enqueue` queue and transport event subscriptions; system response listeners must be removed on success, timeout, abort, disconnect, and protocol error.

- [ ] Add a block read loop using the seven request definitions from Task 1, confirming each response address before requesting the next block.
- [ ] Add a single-setting write method that sends the mapped DT1 frame and does not touch patch data.
- [ ] Preserve the existing patch read, selection, and write code paths and keep all protocol errors actionable through `Gt1ProtocolError`.

## Task 3: Load and update device-global settings in app state

**Files:**
- Modify: `app/index.tsx`

**Interfaces:**
- Keep `systemSettings: Gt1SystemSettings | null` as separate component state.
- Add `changeSystemSetting(settingId: string, value: number): Promise<void>`; only update confirmed state after the client write resolves and restore/report failure otherwise.

- [ ] During `connect`, initialize editor communication and read system settings before exposing controls as ready; retain current patch and user-patch scanning behavior.
- [ ] On disconnect or failed connection, clear or mark system settings unavailable so stale values cannot be edited as current device values.
- [ ] Pass settings, loading/busy state, and the change callback to `PatchEditor` without including system settings in `editOverlays`, `dirtyPatchIds`, or `USER_PATCH_QUERY_KEY`.
- [ ] Route system write failures through existing `operationError` feedback.

## Task 4: Add Sistema tab and state-aware empty message

**Files:**
- Modify: `src/components/PatchEditor.tsx`
- Reuse: `src/components/ParameterControl.tsx`

**Interfaces:**
- Extend `PatchEditorProps` with `systemSettings: Gt1SystemSettings | null`, `systemSettingsBusy: boolean`, and `onSystemSettingChange(settingId: string, value: number): void`.
- Add one screen component for the Sistema tab that renders the six defined setting groups with the matching control definitions.

- [ ] Add Sistema after Reverb in the material top-tab navigator, retaining the existing six effect screens and swipe/navigation options.
- [ ] Render each setting from the typed definitions, using Switch for booleans, select for enumerations, and slider plus editable value for ranged values; preserve the existing visual layout of effect controls.
- [ ] Disable system controls until settings have loaded and while a system write is in progress. For system sliders, hold the thumb value locally during drag and send one write when the drag ends so the write lock does not interrupt the gesture.
- [ ] Restore numeric text inputs to the last confirmed value when a write fails.
- [ ] When there is no selected patch and `connected` is false, show a concise disconnected message with a clear connection prompt; retain useful library/import guidance when connected without a selected patch.

## Task 5: Integration review

**Files:**
- Review changes in `src/gt1/systemSettings.ts`, `src/gt1/sysex.ts`, `src/gt1/client.ts`, `app/index.tsx`, and `src/components/PatchEditor.tsx`.

- [ ] Confirm each setting’s mapped address and byte width against the decompiled GT-1 address map and `SystemParams.as`.
- [ ] Inspect all connection failure, disconnect, and write failure paths for stale or falsely confirmed values.
- [ ] Confirm there is no patch write, patch dirty-state update, or patch-query-cache update in system-setting handlers.
- [ ] Confirm the six existing effect tabs, live patch edits, and patch switching remain unchanged.
