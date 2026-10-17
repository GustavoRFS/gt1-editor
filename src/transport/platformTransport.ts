import { MidiTransportError } from './transportError';
import type { MidiTransport } from './transport';

export function createMidiTransport(): MidiTransport {
  const unavailable = async (): Promise<never> => {
    throw new MidiTransportError('unavailable', 'O acesso MIDI não está disponível nesta plataforma.');
  };
  return {
    listDevices: unavailable,
    connect: unavailable,
    disconnect: async () => undefined,
    sendSysEx: unavailable,
    sendMidiMessage: unavailable,
    onSysEx: () => () => undefined,
  };
}
