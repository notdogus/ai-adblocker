import { browser } from 'wxt/browser';
import { openDB } from 'idb';
import { initialState, type State } from './types';
let cache: State | undefined;
let writes = Promise.resolve();
export async function readState(): Promise<State> {
  if (!cache) {
    const saved = (await browser.storage.local.get('state')).state as State | undefined;
    cache = saved?.version === 1 ? saved : initialState();
  }
  return cache;
}
export function updateState(update: (state: State) => void): Promise<State> {
  const operation = writes.then(async () => {
    const next = structuredClone(await readState());
    update(next);
    await browser.storage.local.set({ state: next });
    cache = next;
    return next;
  });
  writes = operation.then(() => {}, () => {});
  return operation;
}
const secretDb = () => openDB('ai-adblocker-private', 1, { upgrade(db) { db.createObjectStore('credentials'); } });
export async function getKey(): Promise<string> { return (await (await secretDb()).get('credentials', 'typesafe')) ?? ''; }
export async function setKey(key: string): Promise<void> {
  const db = await secretDb();
  if (key) await db.put('credentials', key, 'typesafe'); else await db.delete('credentials', 'typesafe');
}
