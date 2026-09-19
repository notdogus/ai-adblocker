import type { State } from './types';
export const DISABLED_PRIORITY = 100_000;
export function compileRules(state: State, firefox: boolean): any[] {
  const disabled = state.settings.disabledSites.map((site, index) => ({
    id: 1_000_000 + index, priority: DISABLED_PRIORITY,
    action: { type: 'allowAllRequests' },
    condition: { requestDomains: [site], resourceTypes: ['main_frame'] },
  }));
  const learned = firefox ? [] : state.rules.map(rule => ({
    id: rule.id, priority: 1000, action: { type: 'block' },
    condition: { urlFilter: `|${rule.url}|`, isUrlFilterCaseSensitive: true, topDomains: [rule.site], resourceTypes: [rule.type],
      excludedTopDomains: state.allows.filter(allow => allow.url === rule.url && allow.type === rule.type).map(allow => allow.site) },
  }));
  return [...disabled, ...learned];
}
// DNR urlFilter treats these characters as operators. Such URLs cannot be
// represented as exact rules without regex; leave them unlearned in v1.
export const supportsExactRule = (url: string) => !/[|*^]/.test(url);
