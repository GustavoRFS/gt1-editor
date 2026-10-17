import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { MidiTransportError } from './transportError';
import type { MidiDevice, MidiTransport } from './transport';

function requireTauri(): void {
  if (!isTauri()) {
    throw new MidiTransportError('browser-unavailable', 'A comunicação MIDI por USB está disponível somente pelo aplicativo desktop Tauri.');
  }
}

export function createTauriMidiTransport(): MidiTransport {
  const listeners = new Set<(bytes: Uint8Array) => void>();
  const midiListeners = new Set<(event: { bytes: Uint8Array; timestamp: number }) => void>();
  const nativeEventsReady = isTauri()
    ? listen<number[]>('gt1-sysex', (event) => {
        const bytes = Uint8Array.from(event.payload);
        for (const listener of listeners) listener(bytes);
      }).then((unlisten) => () => unlisten())
    : Promise.resolve(() => undefined);
  const nativeMidiEventsReady = isTauri()
    ? listen<number[]>('gt1-midi', (event) => {
        const input = { bytes: Uint8Array.from(event.payload), timestamp: Date.now() };
        for (const listener of midiListeners) listener(input);
      }).then((unlisten) => () => unlisten())
    : Promise.resolve(() => undefined);

  return {
    async listDevices(): Promise<MidiDevice[]> {
      requireTauri();
      return invoke<MidiDevice[]>('list_midi_devices');
    },
    async connect(deviceId: string): Promise<void> {
      requireTauri();
      await nativeEventsReady;
      await nativeMidiEventsReady;
      await invoke('connect_midi', { deviceId });
    },
    async disconnect(): Promise<void> {
      requireTauri();
      await invoke('disconnect_midi');
    },
    async sendSysEx(bytes: Uint8Array): Promise<void> {
      requireTauri();
      await nativeEventsReady;
      await invoke('send_sysex', { data: Array.from(bytes) });
    },
    async sendMidiMessage(bytes: Uint8Array): Promise<void> {
      requireTauri();
      await nativeEventsReady;
      await invoke('send_midi_message', { data: Array.from(bytes) });
    },
    onSysEx(listener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    onMidi(listener): () => void {
      midiListeners.add(listener);
      return () => { midiListeners.delete(listener); };
    },
  };
}
