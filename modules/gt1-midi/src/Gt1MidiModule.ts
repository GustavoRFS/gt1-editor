import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { Gt1CaptureDevice, Gt1MidiDevice, Gt1MidiModuleEvents } from './Gt1Midi.types';

declare class Gt1MidiModule extends NativeModule<Gt1MidiModuleEvents> {
  listDevices(): Promise<Gt1MidiDevice[]>;
  connect(deviceId: string): Promise<void>;
  disconnect(): Promise<void>;
  sendSysEx(bytes: number[]): Promise<void>;
  sendMidiMessage(bytes: number[]): Promise<void>;
  listCaptureDevices(): Promise<Gt1CaptureDevice[]>;
  startVideoRecording(cameraId: string, audioDeviceId: string, width: number, height: number, fps: number, bitrate: number): Promise<string>;
  stopVideoRecording(audioDelayMs: number): Promise<string>;
}

const Gt1Midi = requireOptionalNativeModule<Gt1MidiModule>('Gt1Midi');

export const Gt1MidiEmitter = Gt1Midi;
export default Gt1Midi;
