# GT-1 System Settings Design

## Goal

Add a **Sistema** tab to the patch editor for the global GT-1 options exposed by BOSS Tone Studio. These settings belong to the pedal, not the currently edited patch. Also make the editor’s empty state clearly explain when the GT-1 is disconnected.

## User experience

Add a seventh top tab named **Sistema**, after Reverb, with six setting groups displayed as clearly separated cards or sections:

1. **Play Option** — EXP pedal hold, knob lock, pedal combinations and pedal light options supported by the GT-1 definition.
2. **Knob Setting** — KNOB 1, KNOB 2 and KNOB 3 assignments.
3. **Preference** — EXP1, CTL1, EXP SW, DOWN, UP, EXP2, CTL2 and CTL3 assignments.
4. **Phrase Loop** — playback level.
5. **USB** — MIX LEVEL and EFFECT OUT LEVEL.
6. **Output Select** — output simulation selection, with the names and values from the GT-1 Tone Studio definition.

Use a select for enumerated settings and a slider with an editable numeric value for ranges. Boolean options should use the existing switch control. Display the values read from the connected device, and update the device immediately when an option is changed. These system settings do not change the patch, create a patch dirty state, or require saving the patch.

When no patch is selected and the GT-1 is disconnected, replace the generic empty-state copy with a clear disconnected state that asks the user to connect the GT-1. When connected with no patch selected, keep the existing guidance to open the library, connect the device, or import a file as appropriate to the current state.

## Device communication

Follow the GT-1 Tone Studio behavior found in the supplied decompilation:

- After device connection and editor communication setup, read global system data using the seven system memory blocks at addresses `00 00 00 00`, `00 00 00 40`, `00 00 01 00`, `00 00 01 40`, `00 00 02 00`, `00 00 02 40`, and `00 00 03 00`, each with size 64.
- Decode returned bytes using the GT-1 system address map and retain the setting values in a separate system-settings model.
- On edit, write only the changed system parameter to its mapped address using the normal Roland DT1 SysEx frame/checksum path. Do not send a patch write or mark the patch dirty.
- Serialize system reads and writes through the existing MIDI client queue so they cannot interleave with patch transfers. Reflect a value as confirmed only after the write succeeds; on failure, restore the previous displayed value and report the error through the app’s existing error feedback.
- Do not make a disconnected or not-yet-loaded setting appear as a real zero/default from the pedal. Disable these controls until connected system data has been read.

The decompilation source is `SystemSettingDefinitionGT.as`, `SystemExclusive.as`, `ToneCentralLogic.as`, `SystemParams.as`, and the corresponding GT-1 address map from the user-provided BOSS Tone Studio archive. Preserve the model’s actual option labels, supported controls, value ranges and address widths; validate these against the address map rather than inferring addresses from parameter names. Output Select is modeled separately in Tone Studio, but belongs in this tab because it is a global GT-1 setting.

## Boundaries

- The settings are device-global and are not stored in, or restored from, the persisted patch cache.
- No save/copy action is added for system settings; Tone Studio applies each setting directly.
- Language, manual, device information and version are not included because they are Tone Studio application/device information pages rather than editable GT-1 global parameters.
- The disconnected empty state is a presentation change only and must not alter connection, patch selection, or fetch behavior.

## Acceptance criteria

- The top navigator contains a Sistema tab and exposes all six groups above.
- A successful connection loads values from system memory before enabling the controls.
- Changing any supported setting sends a write for its exact system address and does not send a patch-memory write.
- A failed setting write leaves the device value represented accurately in the UI and communicates the failure.
- System settings never affect patch dirty tracking or the patch query cache.
- The no-patch empty state explicitly says the GT-1 is disconnected when it is not connected, while preserving usable guidance when it is connected.
- Existing six effect tabs and patch editing behavior remain intact.

## Open implementation detail

The decompiled UI metadata contains some model-family options and broad ranges. The implementation must filter to controls confirmed for GT-1 (`gt001`) and map option values using the address map and parameter definitions. In particular, Output Select offers eight named choices even though the decompiled metadata reports a maximum of 8; the UI must use the eight explicit choices (values 0 through 7), not expose an unnamed ninth value.
