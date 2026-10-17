import { NativeModule, registerWebModule } from 'expo';

import type { Gt1CaptureDevice, Gt1MidiDevice, Gt1MidiModuleEvents } from './Gt1Midi.types';

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

  async sendMidiMessage(_bytes: number[]): Promise<void> {
    throw new Error('USB MIDI está disponível apenas no Android e no aplicativo desktop.');
  }

  async listCaptureDevices(): Promise<Gt1CaptureDevice[]> { return []; }
  async startVideoRecording(_cameraId: string, _audioDeviceId: string, _width: number, _height: number, _fps: number, _bitrate: number): Promise<string> {
    throw new Error('Use o gravador de navegador nesta plataforma.');
  }
  async stopVideoRecording(_audioDelayMs: number): Promise<string> { throw new Error('Nenhuma gravação nativa ativa.'); }
}

export default registerWebModule(Gt1MidiModule, 'Gt1MidiModule');
export const Gt1MidiEmitter = null;
