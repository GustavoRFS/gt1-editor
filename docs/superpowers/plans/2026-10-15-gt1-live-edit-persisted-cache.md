# GT-1 Live Editing and Persisted Patch Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make selected GT-1 patches and edits live on the pedal without writing memory until Save, and restore the latest device-read user-patch library from persistent TanStack Query cache.

**Architecture:** TanStack Query owns the last successfully read U01–U99 snapshot, persisted by a platform storage adapter. Session edits are overlays so USB refreshes cannot erase pending changes. `Gt1Client` serializes live parameter/name writes, Tone Studio user-slot selection, imported-patch temporary-buffer loads, and explicit persistent saves.

**Tech Stack:** Expo 57, React Native, TanStack Query v5 with `PersistQueryClientProvider`, AsyncStorage on Android, `localStorage` in Tauri/web, Roland GT-1 SysEx, Android MIDI API, Rust `midir`.

**Spec:** `docs/superpowers/specs/2026-10-15-gt1-live-edit-persisted-cache-design.md`

> **Protocol amendment:** Later static decompilation of the bundled BOSS Tone Studio SWF showed that selecting a user slot writes its index to `setup.current_patch_no` at `00 01 00 00`, waits for the selected-index response, then reads the active buffer. This supersedes the temporary-buffer-copy selection described in the original implementation steps below. Imported patches still load into `60 00`.

## Global Constraints

- Device-slot cache data is the last hardware-read snapshot; imported patches, current-buffer reads, selection, and in-session edit overlays remain session-local.
- USB connection always rereads U01–U99; the restored query cache remains visible during that scan.
- Live parameter and name edits use DT1 writes to buffer `60 00`; do not issue `patch_write` until explicit Save.
- User slots select through `setup.current_patch_no` and the editor verifies the echoed slot index before reading the active buffer. Do not write patch parameters or issue `patch_write` during slot selection.
- A complete imported patch is transferred to the temporary `60 00` buffer without a destination or `patch_write` command.
- A failed send, slot write/readback, or activation must preserve the current app selection and pending edit overlay.
- Persist the successful `['gt1', 'user-patches']` query only; encode and restore its frame bytes as `Uint8Array`.
- Set TanStack Query `gcTime` to at least the persisted cache `maxAge`; `Infinity` avoids browser timer overflow and the app keeps only the small user-patch snapshot in memory.
- Existing uncommitted edits predate this plan. Do not stage or commit their hunks accidentally; leave implementation changes reviewable in the working tree unless new hunks can be isolated safely.

## Review Focus

1. A truncated or invalid reply for one slot must preserve that slot's last cached patch while later slots continue scanning — test this in Task 2.
2. Persisted patch frames must return as `Uint8Array`, including all 17 frames, before protocol code uses `.subarray` or `.set` — test this in Task 1.
3. User-slot selection must wait for the echoed current-patch index and leave the app's selected patch unchanged if the requested index is not confirmed.
4. Parameter/name changes must never issue `patch_write`; a successful transport send must not be represented as a device acknowledgement — test this in Task 3 and Task 4.
5. Save failure, activation failure, Discard, and Cancel must leave the correct dirty patch and selection intact — test this in Task 5.

---

### Task 1: Persist the device query cache across Android and desktop

**Files:**
- Create: `src/query/patchFrameCodec.ts`
- Create: `src/query/persistStorage.ts`
- Create: `src/query/persistStorage.android.ts`
- Create: `src/query/persistStorage.web.ts`
- Create: `src/query/queryClient.ts`
- Modify: `app/_layout.tsx`
- Modify: `package.json` (dependencies and test script)
- Modify: `package-lock.json`
- Modify: `tests/gt1-query-persistence.test.cjs`

**Interfaces:**
- Produces: `serializePersistedClient(client: PersistedClient): string` and `deserializePersistedClient(serialized: string): PersistedClient` in `patchFrameCodec.ts`.
- Produces: one exported `queryClient`, one `asyncStoragePersister`, and constants `USER_PATCH_QUERY_KEY = ['gt1', 'user-patches']`, `PERSIST_MAX_AGE_MS`, and `QUERY_GC_TIME_MS` in `queryClient.ts`.
- Produces: platform-resolved storage implementing `getItem`, `setItem`, and `removeItem`; Android uses AsyncStorage, web/Tauri uses `localStorage`.

- [ ] **Step 1: Write the failing codec test**

Add `persistedQueryCodecRestoresEveryPatchFrameAsUint8Array` to `tests/gt1-query-persistence.test.cjs`. Build a persisted-client fixture whose query data contains one complete patch with 17 distinct `Uint8Array` frames; serialize and deserialize it; assert the name, slot, every byte, and `frame instanceof Uint8Array` for all frames.

- [ ] **Step 2: Run the codec test and confirm it fails**

Run: `node --test tests/gt1-query-persistence.test.cjs`

Expected: FAIL because the codec module does not exist.

- [ ] **Step 3: Implement the tagged frame codec**

Implement JSON replacer/reviver helpers that encode each `Uint8Array` as a tagged numeric array and reconstruct it as `Uint8Array`. Keep the serialized object compatible with TanStack's `PersistedClient` shape.

- [ ] **Step 4: Install the persistence packages and platform storage**

Install `@tanstack/react-query@5`, `@tanstack/react-query-persist-client@5`, and `@tanstack/query-async-storage-persister@5`; install `@react-native-async-storage/async-storage` through `npx expo install`. Implement the Android and web storage adapters. In the web adapter, resolve `localStorage` lazily and report unavailable storage without crashing static export.

- [ ] **Step 5: Add the persistent QueryClient and provider**

Create one `QueryClient` with `gcTime` equal to the one-year `PERSIST_MAX_AGE_MS`; configure the async persister with the tagged codec and a dehydration filter that persists only the successful `USER_PATCH_QUERY_KEY`. Wrap the Expo Router stack in `PersistQueryClientProvider`. Use `useIsRestoring()` inside the provider to show a small restoration state before rendering the editor screen.

- [ ] **Step 6: Run the codec test and Android typecheck**

Run: `node --test tests/gt1-query-persistence.test.cjs`

Expected: PASS with all 17 frames restored as `Uint8Array`.

Run: `npm run typecheck:android`

Expected: PASS with platform storage and provider types resolved.

---

### Task 2: Move the hardware patch snapshot into a query

**Files:**
- Create: `src/gt1/userPatchQuery.ts`
- Modify: `app/index.tsx`
- Modify: `src/gt1/editorState.ts`
- Modify: `tests/gt1-client.test.cjs`

**Interfaces:**
- Consumes: `USER_PATCH_QUERY_KEY` and `queryClient` from Task 1.
- Produces: `mergeUserPatchScan(previous: Gt1Patch[], scanned: Gt1Patch[], failures: Array<{ userPatch: number }>): Gt1Patch[]` in `userPatchQuery.ts`.
- Produces: query data containing only the last hardware-read versions of U01–U99; local edit overlays stay outside the persisted query.

- [ ] **Step 1: Write a failing partial-scan merge test**

Add `partialUserPatchScanPreservesCachedFailedSlotsAndRefreshesSuccessfulSlots` to `tests/gt1-client.test.cjs`. Start with cached U01 and U02, scan a changed U01 while U02 fails, and assert U01 is refreshed, cached U02 is retained, and a newly read U03 is appended.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `node --test --test-name-pattern="partialUserPatchScanPreservesCachedFailedSlotsAndRefreshesSuccessfulSlots" tests/gt1-client.test.cjs`

Expected: FAIL because the merge helper does not exist.

- [ ] **Step 3: Implement the stable user-patch query and scan merge**

Define the stable `USER_PATCH_QUERY_KEY`; merge incoming slots by `userPatch`; preserve last-known cached data for slots reported as failed; retain ascending slot order. Do not merge session edits into query data.

- [ ] **Step 4: Replace device-patch React state with `useQuery` data**

In `app/index.tsx`, add a disabled-by-default `useQuery<Gt1Patch[]>` for the device snapshot with `retry: false`. Its query function calls `client.readUserPatches`; on each progress callback, update `queryClient.setQueryData` so the library fills progressively. On each successful USB connection, explicitly `refetch()` this query. Compose the visible library from query patches, imported/current session patches, and local edit overlays. Keep prior query data visible during refresh.

- [ ] **Step 5: Run the focused scan test and Android typecheck**

Run: `node --test --test-name-pattern="partialUserPatchScanPreservesCachedFailedSlotsAndRefreshesSuccessfulSlots" tests/gt1-client.test.cjs`

Expected: PASS; failed slots retain their cached version and later successful slots are visible.

Run: `npm run typecheck:android`

Expected: PASS with query data typed as `Gt1Patch[]` and UI library composition typed correctly.

---

### Task 3: Add live name writes and verified patch activation

**Files:**
- Modify: `src/gt1/sysex.ts`
- Modify: `src/gt1/client.ts`
- Modify: `src/transport/transport.ts`
- Modify: `src/transport/tauriMidiTransport.ts`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/midi.rs`
- Modify: `modules/gt1-midi/src/Gt1MidiModule.ts`
- Modify: `modules/gt1-midi/src/Gt1MidiModule.web.ts`
- Modify: `modules/gt1-midi/src/Gt1Midi.types.ts`
- Modify: `modules/gt1-midi/android/src/main/java/com/gt1midi/Gt1MidiModule.kt`
- Modify: `src/transport/androidTransport.ts`
- Modify: `tests/gt1-protocol.test.cjs`
- Modify: `tests/gt1-client.test.cjs`

**Interfaces:**
- Produces: `encodeProgramChange(userPatch: number, channel?: number): Uint8Array`; validate slots 1–99 and channels 1–16, default channel 1, and encode slot `n` as program byte `n - 1`.
- Produces: `encodePatchNameWrite(unitId: number, name: string): Uint8Array`; write 16 sanitized 7-bit name bytes at edit-buffer address `60 00 00 00` with a valid Roland checksum.
- Produces: `MidiTransport.sendMidiMessage(bytes: Uint8Array): Promise<void>`; platform adapters accept only a valid two-byte Program Change message.
- Produces: `Gt1Client.selectUserPatch(unitId: number, userPatch: number): Promise<Gt1Patch>` and `Gt1Client.loadPatchToEditBufferAndVerify(patch: Gt1Patch, unitId: number): Promise<Gt1Patch>`.

- [ ] **Step 1: Write failing Program Change and patch-name frame tests**

Add tests asserting U01 encodes as `[0xC0, 0]`, U99 as `[0xC0, 98]`, invalid slots reject, and the patch-name DT1 frame targets `60 00 00 00`, contains 16 sanitized/padded bytes, and passes checksum validation.

- [ ] **Step 2: Run focused protocol tests and confirm they fail**

Run: `node --test --test-name-pattern="program change|patch name" tests/gt1-protocol.test.cjs`

Expected: FAIL because the encoders do not exist.

- [ ] **Step 3: Implement protocol encoders and raw MIDI bridge method**

Implement the two encoders. Add `sendMidiMessage` through the TypeScript transport, Android Expo module, and Tauri command/Rust `midir` output. Reject malformed or non-Program-Change messages at both native boundaries.

- [ ] **Step 4: Implement atomic activation and temporary-buffer verification**

Refactor `Gt1Client` operations so selection is serialized with other MIDI traffic. `selectUserPatch` writes the index to `00 01 00 00`, retries every 500 ms like Tone Studio until that index is echoed, then reads the active buffer. Do not copy user-slot ranges to `60 00` during selection.

- [ ] **Step 5: Write and run activation/client tests**

Add tests proving U11 selection writes `[00, 0A]` to `00 01 00 00`, waits for the matching response, performs no writes to `60 00`, and reads the active patch after confirmation. Imported-patch loading remains a temporary-buffer transfer without `7F 00 01 04`.

Run: `node --test tests/gt1-protocol.test.cjs tests/gt1-client.test.cjs`

Expected: PASS with the existing Tone Studio save/readback tests unchanged.

- [ ] **Step 6: Check both transport builds**

Run: `npm run typecheck:android`

Expected: PASS for the Android transport interface.

Run: `cargo check --manifest-path src-tauri/Cargo.toml`

Expected: PASS for the new Tauri Program Change command.

---

### Task 4: Send each editor change to the connected pedal

**Files:**
- Modify: `src/components/ParameterControl.tsx`
- Modify: `src/components/PatchEditor.tsx`
- Modify: `app/index.tsx`
- Modify: `src/gt1/client.ts`
- Modify: `tests/gt1-client.test.cjs`

**Interfaces:**
- Produces: editor callbacks `onParameterChange(patchId: string, parameterId: string, value: number)` and `onPatchNameChange(patchId: string, name: string)`.
- Consumes: `Gt1Client.setParameter(...)` and the name-write protocol method from Task 3.

- [ ] **Step 1: Write a failing client test for live parameter and name writes**

Add tests asserting `setParameter` sends exactly one mapped DT1 frame and updates the returned patch, and `setPatchName` sends one name frame without any `patch_write` frame.

- [ ] **Step 2: Run the focused client test and confirm the missing name path**

Run: `node --test --test-name-pattern="live parameter|patch name" tests/gt1-client.test.cjs`

Expected: FAIL for the missing name-write method or incorrect message sequence.

- [ ] **Step 3: Add the queued name-write method**

Implement `Gt1Client.setPatchName(patch: Gt1Patch, name: string): Promise<Gt1Patch>` using `encodePatchNameWrite`; reject an invalid/incomplete patch before sending.

- [ ] **Step 4: Propagate exact edits from controls to the app**

Change `PatchEditor` and `ParameterControl` to report patch ID plus parameter ID/value. On text-field completion, report the sanitized name. In `app/index.tsx`, immediately store the optimistic session overlay and mark the patch dirty; if connected, await the queued client send and surface transport errors without clearing the overlay. If disconnected, retain the local edit without attempting USB I/O.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `node --test --test-name-pattern="live parameter|patch name" tests/gt1-client.test.cjs`

Expected: PASS; live edits do not use persistent memory commands.

Run: `npm run typecheck:android`

Expected: PASS with the new editor callback signatures.

---

### Task 5: Confirm save, discard, or cancel before changing patches

**Files:**
- Create: `src/components/PendingPatchSwitchModal.tsx`
- Create: `src/gt1/patchSwitchState.ts`
- Modify: `app/index.tsx`
- Modify: `src/components/PatchEditor.tsx`
- Modify: `src/components/PatchLibraryDrawer.tsx`
- Create: `src/components/PatchSlotPicker.tsx`
- Modify: `src/gt1/editorState.ts`
- Modify: `tests/gt1-editor-state.test.cjs`

**Interfaces:**
- Produces: `getPatchSwitchDecision(activePatchId: string | null, targetPatchId: string, hasPendingChanges: boolean): 'noop' | 'activate' | 'confirm'`.
- Produces: `patchSwitchReducer(state: PatchSwitchState, action: PatchSwitchAction): PatchSwitchState`; state tracks the active and requested target IDs, dirty patch IDs, and `idle | confirming | saving | activating` phase.
- Produces: modal callbacks for `save`, `discard`, and `cancel`, with the requested target patch retained until activation succeeds.
- Consumes: `selectUserPatch` and `loadPatchToEditBufferAndVerify` from Task 3; live session overlays from Task 4.

- [ ] **Step 1: Write failing patch-switch decision tests**

Add tests for selecting the same patch (`noop`), selecting a different clean patch (`activate`), and selecting a different dirty patch (`confirm`). Add reducer tests that cancel preserves the active and dirty IDs, discard retains dirty data until target activation succeeds, successful activation changes the active ID and clears only the resolved dirty ID, and save or activation failure leaves the prior selection and dirty data pending.

- [ ] **Step 2: Run the focused state tests and confirm they fail**

Run: `node --test tests/gt1-editor-state.test.cjs`

Expected: FAIL because the switch-decision helper does not exist.

- [ ] **Step 3: Implement the switch decision helper and modal**

Implement the pure decision helper and a modal with exactly three actions: **Salvar alterações**, **Trocar sem salvar**, and **Cancelar**. Keep the requested target ID outside the modal so failed operations can be retried without changing the active patch. Extract the existing 99-slot chooser into `PatchSlotPicker` so both the normal copy flow and saving an unassigned patch during navigation use the same component.

- [ ] **Step 4: Implement activation and save/discard orchestration**

In `app/index.tsx`, clean user-slot selections use `selectUserPatch`; imported selections use temporary-buffer transfer. Dirty selections close the drawer and show the modal. Save writes the current user slot or opens the existing destination-slot picker for patches without a slot; clear dirty state and update the device query only after write/readback verification, then select the pending target. Discard removes the current edit overlay only after the target is confirmed. Cancel changes neither selection nor data. On any failure, preserve the active selection, overlay, and pending target.

- [ ] **Step 5: Run state/client tests and Android typecheck**

Run: `node --test tests/gt1-editor-state.test.cjs tests/gt1-client.test.cjs`

Expected: PASS for all modal decisions, save failure, activation mismatch, and retained pending data.

Run: `npm run typecheck:android`

Expected: PASS with drawer/modal callback types.

---

### Task 6: Verify persistence, UI integration, and platform output

**Files:**
- Modify: `tests/gt1-query-persistence.test.cjs`
- Modify: `tests/gt1-client.test.cjs`
- Modify: `tests/gt1-editor-state.test.cjs`
- Modify: `docs/gt1-protocol.md`

**Interfaces:**
- Consumes: all interfaces from Tasks 1–5.
- Produces: a checked implementation matching the approved spec, with protocol documentation distinguishing live edit, temporary import load, and persistent save.

- [ ] **Step 1: Add cache and navigation integration regressions**

Assert that query restoration makes the last U01–U99 snapshot available before USB refresh, refresh is still called for every connection, pending overlays remain visible during refresh, verified save updates the base snapshot, and cancel/failure never changes the selection.

- [ ] **Step 2: Run all GT-1 automated tests**

Run: `npm run test:gt1`

Expected: PASS for protocol, client, effect mapping, persistence codec, scan merge, and switch-state coverage.

- [ ] **Step 3: Run static and platform builds**

Run: `npm run typecheck:android`

Expected: PASS.

Run: `npm run export:web`

Expected: Expo exports the desktop UI successfully with web storage selected.

Run: `cargo check --manifest-path src-tauri/Cargo.toml`

Expected: PASS for the Tauri MIDI command changes.

- [ ] **Step 4: Verify with the physical GT-1 when available**

Connect the pedal and check: persisted patches appear before scan; USB connect rereads 99 slots; selecting U01 and U99 loads the corresponding patch; changing an effect and the name updates the pedal without saving memory; imported-patch selection uses temporary transfer only; Save persists and verifies; Discard changes selection without writing the old patch; Cancel keeps the old selection. Note any unavailable hardware verification explicitly.

- [ ] **Step 5: Review the final diff without committing pre-existing hunks**

Run: `git diff --check` and `git status --short`. Confirm that unrelated pre-existing user modifications remain present and that no commit includes them.
