# GT-1 Live Editing and Persisted Patch Cache

**Status:** Approved design; awaiting written-spec review

**Date:** 2026-10-15

## Goal

When a patch is selected or edited in the app, make the corresponding sound active in the connected GT-1 immediately, without writing the user-memory slot until the user chooses to save. Restore the most recently read GT-1 user patches from a TanStack Query cache at app startup, then reread all 99 user slots every time the pedal connects.

## Confirmed requirements

- Parameter changes and the patch name are transmitted while editing; the user does not need to save the patch to hear those changes.
- Selecting a different patch in the drawer makes that patch active on the GT-1.
- If the current patch has unsaved changes, selecting another patch opens a modal with **Salvar alterações**, **Trocar sem salvar**, and **Cancelar**.
- Saving a patch already associated with a GT-1 user slot writes back to that slot and verifies it. Saving an imported patch asks for a destination slot and verifies that write before switching.
- Selecting an imported patch loads it into the temporary edit buffer. That transfer may display **“Bulk data sending...”** on the pedal, but it must not issue the permanent `patch_write` command.
- The app restores the last successfully read U01–U99 library from persistent TanStack Query storage at startup. On every USB connection, it reads all 99 slots again and updates the cache.
- The active GT-1 edit buffer, imported files, UI selection, and in-session edit overlays remain app state; only the last read user-slot library is required to persist.
- Physical confirmation depends on the GT-1 being available during verification.

## Approaches considered

1. **TanStack Query cache for the device library; local edit overlays for unsaved changes (selected).** The persisted query represents the last hardware read. In-session edits are overlays kept separately, so a scan refreshes the hardware snapshot without erasing the user's pending changes. This preserves a single source for fetched device data while keeping unsaved edits explicit.
2. **Keep the current patch list in React state and mirror it to TanStack Query.** This changes fewer component props initially, but duplicates the library and can let the UI and persisted cache diverge.

## Architecture and data flow

### Device patch library

- Wrap the Expo Router stack in `PersistQueryClientProvider` from `@tanstack/react-query-persist-client`.
- Use the `['gt1', 'user-patches']` query as the source for the last device-read snapshot. A manually triggered query reads U01–U99 after the communication handshake on every connection; progress updates the query cache as slots arrive.
- Keep the query disabled until the connection flow explicitly refetches it. Restored data remains visible while the USB scan runs.
- Persist only the successful user-patch query. Imported patches and current-buffer reads stay session-local.
- Use AsyncStorage through `@react-native-async-storage/async-storage` on Android and `window.localStorage` in the Tauri/web runtime. Use a custom persister codec that tags and reconstructs `Uint8Array` patch frames. Set query garbage-collection time no shorter than the persister's maximum age.
- Hold rendering behind a small cache-restore state in the root layout so the library does not first render as empty while asynchronous restoration is underway.

### Live edits and patch activation

- Extend the editor callback to include the changed parameter ID and value. Apply the edit optimistically to the selected patch and mark it dirty. If USB is connected, send one mapped DT1 SysEx write to the GT-1 edit buffer through the existing serialized client queue. Do not send the persistent `patch_write` command for an edit.
- Add a DT1 patch-name write for the 16-byte name at the current-buffer base. Commit the name when the text field finishes editing; keep local edits and the dirty indicator until memory save succeeds or the edit is discarded.
- Add raw MIDI-message sending to `MidiTransport`, the Tauri Rust command, and the Android Expo module. Selecting a user slot sends Program Change on MIDI channel 1, mapping U01–U99 to program bytes 0–98, then reads the current buffer and compares the transferred patch ranges with the chosen slot.
- Selecting an imported or current-buffer patch with no user slot loads its complete supported payload into the temporary `60 00` edit buffer via the existing range-based transfer, without a destination or `patch_write` command. Read the current buffer back to verify it before changing the active selection.
- Selecting the already active patch does not prompt or resend it.

### Unsaved-change navigation

- If a different drawer item is selected while the current patch is dirty, retain the pending target and show the three-option modal.
- **Salvar alterações:** for a user patch, call `writeUserPatchAndVerify` for its current slot; for a patch without a user slot, open the existing destination-slot picker and write there. Update the persisted device query only with the verified readback. Only after verification should the app load the requested target and update the active selection.
- **Trocar sem salvar:** discard the local overlay and activate the requested target using Program Change or temporary-buffer transfer. Clear the overlay only after the target activation verifies.
- **Cancelar:** close the modal and keep the active patch and edits unchanged.

## Error handling and protocol limits

- A transport send failure leaves the local edit visible and dirty, reports an operation error, and does not claim that the pedal received the edit.
- Individual DT1 parameter/name writes have no application-level acknowledgement in the current protocol flow; successful `sendSysEx` means the platform accepted the send, not that the pedal confirmed the value. Patch activation is confirmed separately by reading the current buffer.
- A failed slot save/readback keeps the old selection and its pending edits. A failed Program Change or imported-patch buffer transfer keeps the old selection and does not discard the overlay.
- If the GT-1 MIDI receive channel or Program Change map differs from the assumed channel-1 direct mapping, current-buffer readback can detect that the requested slot was not loaded. The app reports the failure; configurable MIDI channels/maps are outside this change.
- A complete imported-patch load can display the pedal's bulk-transfer message, but never persists to a user slot unless the user explicitly chooses Save and confirms a destination.

## Components expected to change

- `app/_layout.tsx`: persistent query provider and restoration gate.
- `app/index.tsx`: query-backed user library, connection-triggered refresh, live edit and patch-switch orchestration, dirty overlays, and navigation modal state.
- `src/gt1/client.ts` and `src/gt1/sysex.ts`: name-write and patch activation/verification helpers while retaining the existing persistent-save sequence.
- `src/transport/transport.ts`, Tauri Rust command/transport, and Android Expo MIDI module: raw MIDI message send support.
- `src/components/PatchEditor.tsx`, `ParameterControl.tsx`, and `PatchLibraryDrawer.tsx`: propagate edits and target selection; show save/discard/cancel confirmation.
- New persistence adapter/query modules plus package dependencies for TanStack Query and AsyncStorage.

## Verification plan

- Unit-check Program Change bytes, patch-name frame address/data/checksum, parameter-write routing, and the existing distinction between temporary buffer transfer and persistent slot write.
- Check the cache codec round-trip preserves all 17 frames as `Uint8Array`, then verify provider restoration displays the last device library before USB refresh.
- Check USB scan refreshes slots while preserving active unsaved overlays; verified saves update the query snapshot and clear dirty state.
- Check drawer transitions for clean selection and all three dirty-patch modal choices, including failed save/activation paths.
- Run the Android TypeScript check and the existing GT-1 protocol/client/effect test suite. With physical hardware available, verify direct edit, patch selection, imported temporary load, save, and discard behavior on the pedal.

## Out of scope

- Cloud sync, multiple-pedal profiles, custom MIDI receive-channel or Program Change-map settings.
- Persisting imported files, the current selection, or unsaved edit overlays across app restarts.
- Firmware updates or any change that writes user memory during a parameter edit or imported-patch load.
