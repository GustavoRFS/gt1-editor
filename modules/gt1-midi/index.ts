// Re-export the native module. On web, it will be resolved to Gt1MidiModule.web.ts
// and on native platforms to Gt1MidiModule.ts
export { default, Gt1MidiEmitter } from './src/Gt1MidiModule';
export * from './src/Gt1Midi.types';
