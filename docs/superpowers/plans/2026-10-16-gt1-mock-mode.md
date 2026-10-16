# GT-1 Mock Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users exercise the editor UI without a connected GT-1 by enabling a session-only simulated device.

**Architecture:** Keep the existing screen and handlers, but type the GT-1 operation dependency as a shared client interface and provide a stateful mock implementation. A footer switch controls the session; mock devices, patches and system settings remain isolated from hardware and the persisted user-patch query cache.

**Tech Stack:** React Native, Expo Router, TypeScript, existing GT-1 patch/SysEx helpers, TanStack Query.

**Spec:** `docs/superpowers/specs/2026-10-16-gt1-mock-mode-design.md`

## Global Constraints

- The mock mode starts disabled on every app launch.
- Mock patch and system-setting data is session-only.
- Mock patches must not enter `USER_PATCH_QUERY_KEY` or persisted query storage.
- No MIDI messages may be sent while mock mode is active.
- Disabling mock mode clears mock-only state and resumes actual MIDI discovery.

## Review Focus

- Exactly 99 mock user slots are exposed; selecting U99 remains within the library.
- Mock edits update the current simulated buffer so the app's patch polling does not undo them.
- Turning mock mode on while hardware is connected disconnects hardware before switching.
- Mock saves/copies update only mock memory and do not pollute persisted cache.
- Turning mock mode off while asynchronous mock work is pending does not restore stale mock state.

---

### Task 1: Mock GT-1 client and sample data

**Files:**
- Modify: `src/gt1/client.ts`
- Create: `src/gt1/mockClient.ts`
- Create: `src/gt1/mockData.ts`

**Interfaces:**
- Produce `Gt1EditorClient`, a public interface for the editor-used methods of `Gt1Client`.
- Produce `createMockGt1Client(): Gt1EditorClient`, with `reset()` and session-local patch/settings state.
- Produce `createMockUserPatches(): Gt1Patch[]` returning patch ids `gt1-user-01` through `gt1-user-99`, slots 1–99, and complete frame data accepted by existing patch controls.

- [ ] **Step 1: Define `Gt1EditorClient` and make `Gt1Client` implement it**

Include the methods already called by `app/index.tsx`: `initializeEditorCommunication`, `readCurrentPatch`, `readSystemSettings`, `writeSystemSetting`, `readUserPatchNames`, `selectUserPatch`, `loadPatchToEditBufferAndVerify`, `writeUserPatchAndVerify`, `setParameter`, and `setPatchName`.

- [ ] **Step 2: Add mock sample patch and system-setting factories**

Generate 99 distinct patch names and valid parameter frames using existing local patch-edit helpers. Initialize each system setting to a value within its existing definition; set initial current patch to U11.

- [ ] **Step 3: Implement `createMockGt1Client()`**

Implement all interface methods in memory. `readUserPatchNames` must synchronously report all 99 patches through the existing progress callback. Selection and buffer reads return the current simulated patch. Parameter/name writes update that buffer. User-memory writes/copies replace the requested slot and return its saved patch. Setting writes update mock system settings. `reset()` restores sample values.

- [ ] **Step 4: Run Android TypeScript typecheck**

Run: `npm run typecheck:android`

Expected: exits with code 0.

### Task 2: Footer switch and mock session lifecycle

**Files:**
- Create: `src/components/MockModeSwitch.tsx`
- Modify: `app/index.tsx`

**Interfaces:**
- `MockModeSwitch` accepts `{ enabled: boolean; disabled?: boolean; onChange: (enabled: boolean) => void }`.
- The screen chooses `Gt1Client` or `Gt1EditorClient` based on `mockMode` and shows a synthetic device named `BOSS GT-1 (mock)` while enabled.

- [ ] **Step 1: Add a footer switch labeled “Modo mock”**

Use the app's existing colors, spacing, typography, and accessible React Native switch semantics.

- [ ] **Step 2: Add session-only `mockMode` state and select the client**

Initialize `mockMode` as `false`. Enabling it disconnects the physical transport first, resets the mock client, and installs mock device/selection state. Disabling it cancels mock scan/poll work, clears connection, settings, session patches, edits and dirty state, resets the mock client, then calls `refreshDevices()`.

- [ ] **Step 3: Keep mock queries isolated from persisted cache**

When mock scanning, use the mock client directly and update only the screen's session state; do not call `userPatchQuery.refetch()` or write mock patches under `USER_PATCH_QUERY_KEY`. Preserve the existing real-device scan path unchanged while mock mode is off.

- [ ] **Step 4: Route editor operations through the selected client**

Connect, current-patch read, system settings read/write, live patch writes, selection, and save/copy must use the active client. Mock mode must never call `transport.sendSysEx`, `transport.sendMidiMessage`, or real `transport.connect`.

- [ ] **Step 5: Add mock mode switch at the bottom of the page**

Render it after the existing footer. Disable the switch while an operation is running; if enabling from an active hardware connection, disconnect cleanly before enabling.

- [ ] **Step 6: Run Android TypeScript typecheck and whitespace check**

Run: `npm run typecheck:android`

Expected: exits with code 0.

Run: `git diff --check`

Expected: no output.

### Task 3: Verify mock interactions in the UI

**Files:**
- Review: `app/index.tsx`, `src/gt1/mockClient.ts`, `src/components/MockModeSwitch.tsx`

- [ ] **Step 1: Enable mock mode with the pedal disconnected**

Confirm the header shows `BOSS GT-1 (mock)`, the drawer shows 99 user slots, U11 is active, the System tab contains values, and the no-patch disconnected empty state is gone.

- [ ] **Step 2: Exercise editor interactions**

Change an effect parameter and name, switch to another patch, save/copy to a slot, and alter a System setting. Confirm each visible change stays in the mock session and no operation error is shown.

- [ ] **Step 3: Disable mock mode and relaunch**

Confirm mock state is cleared, real device discovery resumes, the mock is not in persisted query cache, and after app restart mock mode is off.
