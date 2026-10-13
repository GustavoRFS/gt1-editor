export type PatchFileFormat = 'syx' | 'mid' | 'gcl' | 'device';

export type Gt1Patch = {
  id: string;
  name: string;
  frames: Uint8Array[];
  sourceFormat: PatchFileFormat;
  sourceName?: string;
  bank?: number;
  patchNumber?: number;
  complete: boolean;
};

export type Gt1ParameterOption = {
  value: number;
  label: string;
};

export type Gt1ParameterDefinition = {
  id: string;
  group: string;
  label: string;
  /** Offset in the flattened patch payload (128-byte data blocks). */
  offset: number;
  control: 'toggle' | 'select' | 'number';
  min: number;
  max: number;
  options?: Gt1ParameterOption[];
};

export type Gt1PatchDestination = {
  /** User bank, numbered 1 through 50 as in FxFloorBoard. */
  bank: number;
  /** Patch slot in the bank, numbered 1 through 5. */
  patch: number;
};

export type Gt1ProtocolErrorCode =
  | 'invalid-unit-id'
  | 'invalid-sysex'
  | 'invalid-checksum'
  | 'invalid-address'
  | 'incomplete-patch'
  | 'unsupported-format'
  | 'malformed-file';

export class Gt1ProtocolError extends Error {
  constructor(
    public readonly code: Gt1ProtocolErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'Gt1ProtocolError';
  }
}
