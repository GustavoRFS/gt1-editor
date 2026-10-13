import { Gt1ProtocolError } from './types';

export function rolandChecksum(bytes: ArrayLike<number>): number {
  let sum = 0;
  for (const byte of Array.from(bytes)) sum += byte;
  return (128 - (sum % 128)) % 128;
}

export function calculateFrameChecksum(frame: Uint8Array): number {
  if (frame.length < 13) throw new Gt1ProtocolError('invalid-sysex', 'A mensagem SysEx é curta demais para conter endereço e checksum.');
  return rolandChecksum(frame.subarray(7, frame.length - 2));
}

export function hasValidFrameChecksum(frame: Uint8Array): boolean {
  return frame.length >= 13 && frame[frame.length - 2] === calculateFrameChecksum(frame);
}

export function refreshFrameChecksum(frame: Uint8Array): Uint8Array {
  if (frame.length < 13 || frame[0] !== 0xf0 || frame[frame.length - 1] !== 0xf7) {
    throw new Gt1ProtocolError('invalid-sysex', 'A mensagem SysEx precisa começar em F0 e terminar em F7.');
  }
  const updated = new Uint8Array(frame);
  updated[updated.length - 2] = calculateFrameChecksum(updated);
  return updated;
}
