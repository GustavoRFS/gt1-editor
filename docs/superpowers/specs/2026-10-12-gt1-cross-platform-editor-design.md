# BOSS GT-1 Cross-Platform Editor — Design Specification

**Status:** Submitted for user review  
**Date:** 2026-10-12

## Goal

Build an offline editor for the BOSS GT-1 that runs on Linux desktop and Android, shares one React Native interface, and communicates with the pedal over USB MIDI SysEx.

## Confirmed requirements

- Desktop target: Linux, packaged with Tauri.
- Mobile target: Android, built with React Native and Expo.
- The Tauri UI must be the web export produced by the Expo project.
- Android communication must use Android native APIs through an Expo native module.
- Tauri communication must go through native Rust commands.
- The supplied GT-1 FxFloorBoard source is the protocol and behavior reference.

## Initial product scope

The first usable version will support the core patch workflow:

1. Enumerate available MIDI devices and connect/disconnect from the GT-1.
2. Request and display the selected/current patch.
3. Edit parameters represented by the supplied FxFloorBoard source and transmit edits to the pedal.
4. Write a patch to the pedal and import/export patch files in formats supported by the source (`.syx`, `.mid`, and `.gcl`, subject to confirming the source's exact file handling during implementation).
5. Show connection, permission, timeout, malformed-message, and device-disconnect errors in the UI.

The app controls the pedal over MIDI; audio streaming, amp simulation, cloud accounts, and exact feature parity with the Windows editor are outside this first scope. Protocol features not represented in the supplied source are not assumed.

## Architecture

The Expo project owns the React Native UI, shared application state, patch model, and GT-1 SysEx encoding/decoding. Expo's web export produces the frontend bundle in `dist`; Tauri loads that directory as its frontend. There is no separate desktop UI implementation.

All platform-specific I/O is behind a TypeScript `MidiTransport` contract:

```ts
export type MidiDevice = { id: string; name: string };

export interface MidiTransport {
  listDevices(): Promise<MidiDevice[]>;
  connect(deviceId: string): Promise<void>;
  disconnect(): Promise<void>;
  sendSysEx(bytes: Uint8Array): Promise<void>;
  onSysEx(listener: (bytes: Uint8Array) => void): () => void;
}
```

- `transport.android.ts` calls a local Expo module implemented in Kotlin. The module uses Android MIDI/USB-host APIs to enumerate USB MIDI devices, open MIDI ports, send SysEx, and deliver incoming SysEx messages.
- `transport.web.ts` is selected for the Expo web export. It detects the Tauri runtime and uses `@tauri-apps/api` to invoke Rust commands and receive MIDI events. A normal browser reports that pedal access is unavailable.
- The Tauri Rust backend owns Linux MIDI enumeration and I/O through ALSA-compatible MIDI access. It exposes only the transport operations needed by the shared TypeScript layer.
- Shared protocol code handles GT-1 message framing, checksums, patch conversion, and validation. Device access and operating-system permissions stay in the platform adapters.

The Tauri configuration runs `npx expo export -p web` before a production build and sets `build.frontendDist` to the Expo `dist` directory. During desktop development, Tauri's `devUrl` points at the Expo web development server.

## Proposed project layout

```text
.
├── app/                         # Expo Router screens
├── src/
│   ├── gt1/                     # patch types, SysEx protocol, workflows
│   ├── transport/
│   │   ├── transport.ts         # shared contract and platform selector
│   │   ├── transport.android.ts # Expo/Kotlin bridge
│   │   └── transport.web.ts     # Tauri invoke/event bridge
│   └── components/              # shared React Native UI
├── modules/gt1-midi/            # local Expo module, Kotlin implementation
├── src-tauri/
│   ├── src/                      # Rust MIDI backend and Tauri commands
│   └── tauri.conf.json
└── docs/
```

## Runtime and hardware constraints

- The Android native module requires an Expo development/production build; it cannot run in Expo Go unless the required native code is already included there.
- The Android device must support USB host/OTG. The pedal connects through a USB-C-to-USB-B host cable/adapter; the pedal may need its own power supply.
- On Linux, the user must have a working ALSA MIDI device and the required device permissions.
- Both platforms must handle no-device, denied-permission, failed-connect, disconnect-during-transfer, timeout, and invalid-SysEx conditions without crashing or writing incomplete patch data.

## Acceptance criteria

1. The Expo web export builds to `dist`, and a Tauri development/build configuration loads that exact output.
2. Android and Tauri render the same shared screens and use the same patch/protocol model.
3. Android and Linux adapters can enumerate MIDI devices, connect, send SysEx, and deliver incoming SysEx events through the common contract.
4. On physical GT-1 hardware, the core patch workflow can read, edit, write, import, and export supported patch data.
5. The app remains usable without a network connection and reports unsupported browser mode clearly.

## Open implementation details

- Audit the supplied FxFloorBoard source to confirm message mappings, handshake/device identifiers, exact file-format behavior, and which editing operations can be implemented without gaps.
- Confirm actual Android USB MIDI recognition and power behavior with the user's phone, USB-C-to-B cable/adapter, and GT-1. Emulator-only work cannot validate this hardware path.
- Confirm the project's package manager and supported Android minimum before generating the Expo scaffold; do not add dependency versions until the current toolchain is inspected.

## Out of scope for the initial version

- iOS, Windows, and macOS targets.
- USB audio input/output or real-time audio effects.
- Features that require undocumented GT-1 commands not present in the supplied source.
- Cloud synchronization or remote preset services.
