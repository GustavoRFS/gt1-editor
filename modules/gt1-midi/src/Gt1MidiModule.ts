import { EventEmitter, NativeModule, requireOptionalNativeModule } from 'expo';

import type { Gt1MidiDevice, Gt1MidiModuleEvents } from './Gt1Midi.types';

declare class Gt1MidiModule extends NativeModule<Gt1MidiModuleEvents> {
  listDevices(): Promise<Gt1MidiDevice[]>;
  connect(deviceId: string): Promise<void>;
  disconnect(): Promise<void>;
  sendSysEx(bytes: number[]): Promise<void>;
}

const Gt1Midi = requireOptionalNativeModule<Gt1MidiModule>('Gt1Midi');

export const Gt1MidiEmitter = Gt1Midi ? new EventEmitter(Gt1Midi) : null;
export default Gt1Midi;
