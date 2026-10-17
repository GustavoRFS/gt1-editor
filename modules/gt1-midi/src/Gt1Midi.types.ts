export type Gt1MidiDevice = {
  id: string;
  name: string;
};

export type Gt1MidiModuleEvents = {
  onSysEx: (event: { bytes: number[] }) => void;
  onMidi: (event: { bytes: number[]; timestamp: number }) => void;
  onDisconnect: (event: { deviceId: string }) => void;
};

export type Gt1CaptureDevice = { id: string; label: string; kind: 'audioinput' | 'videoinput' };
