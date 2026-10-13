import { NativeModule, registerWebModule } from 'expo';

import type { Gt1MidiDevice, Gt1MidiModuleEvents } from './Gt1Midi.types';

class Gt1MidiModule extends NativeModule<Gt1MidiModuleEvents> {
  async listDevices(): Promise<Gt1MidiDevice[]> {
    throw new Error('USB MIDI está disponível apenas no Android e no aplicativo desktop.');
  }

  async connect(_deviceId: string): Promise<void> {
    throw new Error('USB MIDI está disponível apenas no Android e no aplicativo desktop.');
  }

  async disconnect(): Promise<void> {}

  async sendSysEx(_bytes: number[]): Promise<void> {
    throw new Error('USB MIDI está disponível apenas no Android e no aplicativo desktop.');
  }
}

export default registerWebModule(Gt1MidiModule, 'Gt1MidiModule');
