# GT-1 mock mode design

## Goal

Allow the editor screens to be exercised while the GT-1 is unavailable. A switch at the bottom of the main page enables an in-memory simulated GT-1. The mode starts disabled on every app launch.

## User-visible behavior

- The switch is labeled “Modo mock” and lives at the bottom of the main page.
- Enabling it presents a connected device named “BOSS GT-1 (mock)”, 99 example user patches, a current patch, and populated system settings.
- Patch selection, live parameter and name changes, patch writes/copies, current-patch reads, and system-setting changes operate only on mock state. No MIDI messages are sent while mock mode is active.
- Mock patch and system-setting state remains in memory while the mode is active. Disabling mock mode clears that state and resumes real MIDI device discovery.
- Enabling mock mode while a physical device is connected disconnects the real transport first.

## Implementation approach

Keep the existing editor UI and operation handlers as the source of interaction behavior. Add a mock client/transport boundary that provides simulated connection data and in-memory operations, and select it from the screen based on the mode switch. Mock-generated patches must use the same `Gt1Patch` model and existing patch parsing/edit helpers so the patch tabs, drawer, save picker, dirty-state flow, and cache presentation remain realistic. Mock system settings use the existing `Gt1SystemSettings` model.

Mock data is session-only and must not be written into the persisted TanStack Query cache, which represents patches read from actual user memory. When mock mode is disabled, restore real device discovery and discard mock-only connection, settings, session patches, and edits.

## Out of scope

- Persisting mock mode or simulated edits between app launches.
- Sending mocked MIDI data to real hardware.
- Changing the existing patch or system-setting protocol.

## Acceptance criteria

1. The footer switch can enable and disable the mock mode.
2. With no pedal connected, enabling mock mode shows a connected mock GT-1, exactly 99 user slots, an active patch, and populated system settings.
3. Existing patch and system screens can be interacted with in mock mode; writes and edits update only in-memory mock state.
4. The persisted user-patch cache is not contaminated by mock patches.
5. Disabling mock mode clears mock-only state and refreshes actual MIDI devices.
6. The mode is off after restarting the app.
