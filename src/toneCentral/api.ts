import { invoke, isTauri } from '@tauri-apps/api/core';

const DEFINITION_URL = 'https://api.roland.com/app/btc/define/gt-1.json';

export type ToneCentralSet = {
  id: number;
  title: string;
  basename: string;
  categories: string[];
  tags: string[];
  description: string;
};

export type ToneCentralPatch = {
  id: string | number;
  name: string;
  note?: string;
  params: Record<string, unknown>;
};

type ToneCentralDefinition = {
  btc: { domain: string; dataapi: string; liveset_file: string };
};

type ToneCentralIndex = { items: Array<Record<string, unknown>> };
type ToneCentralLiveSet = { patchList: ToneCentralPatch[] };
let definitionPromise: Promise<ToneCentralDefinition> | undefined;

async function requestText(url: string, signal?: AbortSignal): Promise<string> {
  let status: number;
  let body: string;
  if (isTauri()) {
    const response = await invoke<{ status: number; body: string }>('send_http_request', {
      url,
      method: 'GET',
      headers: { Accept: 'application/json, application/octet-stream' },
      body: null,
    });
    status = response.status;
    body = response.body;
  } else {
    const response = await fetch(url, { signal, headers: { Accept: 'application/json, application/octet-stream' } });
    status = response.status;
    body = await response.text();
  }
  if (status < 200 || status >= 300) throw new Error(`Tone Central respondeu HTTP ${status}.`);
  return body;
}

async function requestJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const body = await requestText(url, signal);
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error('A resposta do Tone Central não contém JSON válido.');
  }
}

export async function fetchToneCentralSets(signal?: AbortSignal): Promise<ToneCentralSet[]> {
  const definition = await getDefinition(signal);
  const indexUrl = new URL(definition.btc.dataapi, definition.btc.domain).toString();
  const index = await requestJson<ToneCentralIndex>(indexUrl, signal);
  return (index.items ?? []).map((item) => ({
    id: Number(item.id),
    title: String(item.title ?? item.basename ?? 'Live set'),
    basename: String(item.basename ?? ''),
    categories: Array.isArray(item.categories) ? item.categories.map(String) : [],
    tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
    description: getCustomField(item.customFields, 'caption_en') || getCustomField(item.customFields, 'caption_ja'),
  })).filter((item) => item.basename.length > 0 && item.categories.some((category) => category.toLowerCase().includes('gt-1')));
}

export async function fetchToneCentralLiveSet(set: ToneCentralSet, signal?: AbortSignal): Promise<ToneCentralPatch[]> {
  const definition = await getDefinition(signal);
  const url = new URL(`${definition.btc.liveset_file}${encodeURIComponent(set.basename)}.tsl`, definition.btc.domain).toString();
  const liveSet = await requestJson<ToneCentralLiveSet>(url, signal);
  if (!Array.isArray(liveSet.patchList)) throw new Error('O live set do Tone Central não contém uma lista de patches.');
  return liveSet.patchList;
}

function getDefinition(signal?: AbortSignal): Promise<ToneCentralDefinition> {
  definitionPromise ??= requestJson<ToneCentralDefinition>(DEFINITION_URL, signal).catch((error) => {
    definitionPromise = undefined;
    throw error;
  });
  return definitionPromise;
}

function getCustomField(value: unknown, basename: string): string {
  if (!Array.isArray(value)) return '';
  const field = value.find((item) => item && typeof item === 'object' && (item as { basename?: unknown }).basename === basename) as { value?: unknown } | undefined;
  if (typeof field?.value !== 'string') return '';
  return field.value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
