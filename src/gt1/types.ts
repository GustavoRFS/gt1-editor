export type PatchFileFormat = 'syx' | 'mid' | 'gcl' | 'device';

export type Gt1Patch = {
  id: string;
  name: string;
  frames: Uint8Array[];
  sourceFormat: PatchFileFormat;
  sourceName?: string;
  /** User-memory slot on the GT-1, numbered 1 through 99. */
  userPatch?: number;
  bank?: number;
  patchNumber?: number;
  complete: boolean;
};

export type Gt1ParameterOption = {
  value: number;
  label: string;
};

export type Gt1EffectSectionId = 'fx1-comp' | 'od-ds' | 'preamp' | 'fx2-mod' | 'delay' | 'reverb';
export type Gt1ParameterVisibilityCondition = { parameterId: string; values: number[] };

export type Gt1ParameterDefinition = {
  id: string;
  group: string;
  label: string;
  sectionId?: Gt1EffectSectionId;
  /** Offset in the flattened patch payload (128-byte data blocks). */
  offset: number;
  control: 'toggle' | 'select' | 'number';
  min: number;
  max: number;
  /** Number of adjacent 7-bit bytes used for the encoded value. */
  width?: 1 | 2;
  /** Add this to the encoded value to get the value shown in the editor. */
  displayOffset?: number;
  /** Show an integer editor value as a decimal by dividing it by this value. */
  displayDivisor?: number;
  /** Show this control only when every visibility condition matches. */
  visibleWhen?: Gt1ParameterVisibilityCondition[];
  options?: Gt1ParameterOption[];
};

export type Gt1PatchDestination = {
  /** User patch slot, numbered 1 through 99. */
  userPatch: number;
};

export type Gt1ProtocolErrorCode =
  | 'invalid-unit-id'
  | 'invalid-sysex'
  | 'invalid-checksum'
  | 'invalid-address'
  | 'incomplete-patch'
  | 'cancelled'
  | 'device-disconnected'
  | 'write-verification-failed'
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
