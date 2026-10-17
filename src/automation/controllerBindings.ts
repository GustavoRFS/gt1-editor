import type { MidiInputEvent } from '../transport/transport';
import { invoke, isTauri } from '@tauri-apps/api/core';

export type BindingGesture = 'press' | 'release' | 'hold';
export type ControllerBinding = {
  id: string;
  label: string;
  /** Full MIDI event bytes. Learn these again if the GT-1 assignment changes. */
  pressBytes: number[];
  releaseBytes?: number[];
  expressionCc?: number;
  expressionChannel?: number;
  expressionThreshold?: number;
  expressionDirection?: 'above' | 'below';
  /** Patch id limits this learned signal to the assignment active in that patch. */
  patchId?: string;
  gesture: BindingGesture;
  holdMs: number;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
};

export type BindingEvent = { bytes: number[]; timestamp: number; patchId: string | null };

export function midiBytesMatch(expected: number[], received: Uint8Array): boolean {
  return expected.length === received.length && expected.every((byte, index) => byte === received[index]);
}

/**
 * Matches learned input events against the patch context. GT-1 controller
 * assignments are patch/system dependent; callers should never treat a pedal
 * as one universal MIDI button. Learning records the actual event in context.
 */
export function bindingMatches(binding: ControllerBinding, event: BindingEvent): boolean {
  return (!binding.patchId || binding.patchId === event.patchId) && midiBytesMatch(binding.pressBytes, Uint8Array.from(event.bytes));
}

export class ControllerBindingRunner {
  private active = new Map<string, ReturnType<typeof setTimeout>>();
  private expressionValues = new Map<string, number>();

  constructor(
    private readonly bindings: () => ControllerBinding[],
    private readonly onError: (binding: ControllerBinding, error: unknown) => void,
  ) {}

  handle(event: BindingEvent): void {
    for (const binding of this.bindings()) {
      const ccMessage = event.bytes.length === 3 && (event.bytes[0] & 0xf0) === 0xb0 && event.bytes[1] === binding.expressionCc
        && (binding.expressionChannel === undefined || (event.bytes[0] & 0x0f) === binding.expressionChannel);
      let expressionCrossing = false;
      let expressionRelease = false;
      if (binding.expressionCc !== undefined && ccMessage) {
        const value = event.bytes[2];
        const threshold = binding.expressionThreshold ?? 64;
        const previous = this.expressionValues.get(binding.id);
        this.expressionValues.set(binding.id, value);
        expressionCrossing = binding.expressionDirection === 'below'
          ? value <= threshold && (previous === undefined || previous > threshold)
          : value >= threshold && (previous === undefined || previous < threshold);
        expressionRelease = binding.expressionDirection === 'below' ? value > threshold : value < threshold;
      }
      const isPress = binding.expressionCc !== undefined ? expressionCrossing : bindingMatches(binding, event);
      const isRelease = binding.releaseBytes?.length
        ? (!binding.patchId || binding.patchId === event.patchId) && midiBytesMatch(binding.releaseBytes, Uint8Array.from(event.bytes))
        : expressionRelease && (!binding.patchId || binding.patchId === event.patchId);
      if (isPress && !this.active.has(binding.id)) {
        if (binding.gesture === 'press') void this.fire(binding);
        if (binding.gesture === 'hold') {
          if (!binding.releaseBytes?.length) continue;
          const timeout = setTimeout(() => {
            this.active.delete(binding.id);
            void this.fire(binding);
          }, Math.max(250, binding.holdMs));
          this.active.set(binding.id, timeout);
        } else {
          const cooldownMs = binding.gesture === 'release' ? 60_000 : 250;
          this.active.set(binding.id, setTimeout(() => this.active.delete(binding.id), cooldownMs));
        }
      }
      if (isRelease && this.active.has(binding.id)) {
        clearTimeout(this.active.get(binding.id));
        this.active.delete(binding.id);
        if (binding.gesture === 'release') void this.fire(binding);
      }
    }
  }

  dispose(): void {
    for (const timeout of this.active.values()) clearTimeout(timeout);
    this.active.clear();
    this.expressionValues.clear();
  }

  private async fire(binding: ControllerBinding): Promise<void> {
    try { await fireHttpBinding(binding); } catch (error) { this.onError(binding, error); }
  }
}

export function bindingEventFromMidi(event: MidiInputEvent, patchId: string | null): BindingEvent {
  return { bytes: Array.from(event.bytes), timestamp: event.timestamp, patchId };
}

export async function fireHttpBinding(binding: ControllerBinding): Promise<void> {
  const headers = { ...binding.headers };
  const hasBody = binding.body !== undefined && binding.body.length > 0;
  if (hasBody && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
    headers['Content-Type'] = 'application/json';
  }
  const body = hasBody && binding.method !== 'GET' && binding.method !== 'DELETE' ? binding.body : undefined;
  if (isTauri()) {
    const response = await invoke<{ status: number; body?: string }>('send_http_request', { url: binding.url, method: binding.method, headers, body });
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}${response.body ? `: ${response.body.slice(0, 200)}` : ''}`);
    return;
  }
  const response = await fetch(binding.url, { method: binding.method, headers, body });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
}

export const HTTP_BINDINGS_QUERY_KEY = ['gt1', 'controller-http-bindings'] as const;
export const ACTIVE_PATCH_CONTEXT_QUERY_KEY = ['gt1', 'active-patch-context'] as const;
export const HTTP_BINDINGS_STORAGE_KEY = 'gt1-editor-http-bindings-v1';
