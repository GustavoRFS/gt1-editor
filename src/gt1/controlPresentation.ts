import type { Gt1ParameterDefinition } from './types';

export function usesPercentSlider(definition: Pick<Gt1ParameterDefinition, 'control' | 'min' | 'max'>): boolean {
  return definition.control === 'number' && definition.min === 0 && definition.max === 100;
}
