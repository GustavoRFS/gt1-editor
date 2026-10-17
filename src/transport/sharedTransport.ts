import { createMidiTransport } from './transport';

let shared: ReturnType<typeof createMidiTransport> | undefined;
export function getSharedMidiTransport() {
  shared ??= createMidiTransport();
  return shared;
}
