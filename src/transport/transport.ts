export type MidiDevice = {
  /** Opaque identifier returned by the active platform adapter. */
  id: string;
  name: string;
};

export interface MidiTransport {
  listDevices(): Promise<MidiDevice[]>;
  connect(deviceId: string): Promise<void>;
  disconnect(): Promise<void>;
  sendSysEx(bytes: Uint8Array): Promise<void>;
  onSysEx(listener: (bytes: Uint8Array) => void): () => void;
  onDisconnect?(listener: () => void): () => void;
}

export { createMidiTransport } from './platformTransport';
export { MidiTransportError } from './transportError';
