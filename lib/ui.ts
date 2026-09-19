import { browser } from 'wxt/browser';
import type { State } from './types';
export type PublicState = State & { hasKey: boolean };
export const rpc = <T = unknown>(type: string, args: Record<string, unknown> = {}): Promise<T> => browser.runtime.sendMessage({ type, ...args });
