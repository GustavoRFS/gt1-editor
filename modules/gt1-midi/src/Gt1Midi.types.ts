export type Gt1MidiDevice = {
  id: string;
  name: string;
};

export type Gt1MidiModuleEvents = {
  onSysEx: (event: { bytes: number[] }) => void;
  onDisconnect: (event: { deviceId: string }) => void;
};
