import Gt1Midi, { Gt1MidiEmitter } from '../../modules/gt1-midi';
import { MidiTransportError } from './transportError';
import type { MidiDevice, MidiTransport } from './transport';

function requireModule() {
  if (!Gt1Midi) throw new MidiTransportError('native-module-missing', 'O módulo MIDI não está instalado. Use um development build Android do GT-1 Editor.');
  return Gt1Midi;
}

function asTransportError(error: unknown): MidiTransportError {
  if (error instanceof MidiTransportError) return error;
  const candidate = error as { code?: unknown; message?: unknown } | null;
  const code = typeof candidate?.code === 'string' ? candidate.code : 'native-midi-error';
  const message = typeof candidate?.message === 'string' ? candidate.message : 'Falha na comunicação MIDI USB.';
  return new MidiTransportError(code, message);
}

export function createAndroidMidiTransport(): MidiTransport {
  return {
    async listDevices(): Promise<MidiDevice[]> {
      try {
        return await requireModule().listDevices();
      } catch (error) {
        throw asTransportError(error);
      }
    },
    async connect(deviceId: string): Promise<void> {
      try {
        await requireModule().connect(deviceId);
      } catch (error) {
        throw asTransportError(error);
      }
    },
    async disconnect(): Promise<void> {
      try {
        if (Gt1Midi) await Gt1Midi.disconnect();
      } catch (error) {
        throw asTransportError(error);
      }
    },
    async sendSysEx(bytes: Uint8Array): Promise<void> {
      try {
        await requireModule().sendSysEx(Array.from(bytes));
      } catch (error) {
        throw asTransportError(error);
      }
    },
    async sendMidiMessage(bytes: Uint8Array): Promise<void> {
      try {
        await requireModule().sendMidiMessage(Array.from(bytes));
      } catch (error) {
        throw asTransportError(error);
      }
    },
    onSysEx(listener): () => void {
      if (!Gt1MidiEmitter) return () => undefined;
      const subscription = Gt1MidiEmitter.addListener('onSysEx', ({ bytes }) => listener(Uint8Array.from(bytes)));
      return () => subscription.remove();
    },
    onMidi(listener): () => void {
      if (!Gt1MidiEmitter) return () => undefined;
      const subscription = Gt1MidiEmitter.addListener('onMidi', ({ bytes, timestamp }) => listener({ bytes: Uint8Array.from(bytes), timestamp }));
      return () => subscription.remove();
    },
    onDisconnect(listener): () => void {
      if (!Gt1MidiEmitter) return () => undefined;
      const subscription = Gt1MidiEmitter.addListener('onDisconnect', () => listener());
      return () => subscription.remove();
    },
  };
}
