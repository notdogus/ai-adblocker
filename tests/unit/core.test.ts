import { describe, expect, it } from 'vitest';
import { initialState, type Candidate } from '../../lib/types';
import { sanitizedUrl, sanitizeCandidate } from '../../lib/privacy';
import { blocked, known, shouldLearn, topSite } from '../../lib/policy';
import { compileRules, supportsExactRule } from '../../lib/rules';
import { parseCosmetic, selectorsFor } from '../../lib/cosmetics';
import { compactRules } from '../../lib/compact-rules';

const candidate: Candidate = { id: '1', site: 'publisher.example', url: 'https://cdn.example/banner.js?unit=sidebar', type: 'script', origin: 'network' };
describe('privacy boundary', () => {
  it('removes query values, fragments, emails and path tokens', () => {
    expect(sanitizedUrl('https://example.com/u/user%40example.org/0123456789abcdef0123456789?token=secret#private')).toBe('https://example.com/u/[redacted]/[redacted]');
    expect(sanitizedUrl('https://user:password@example.com/')).toBe('');
    expect(sanitizedUrl('javascript:alert(1)')).toBe('');
  });
  it('constructs a new allowlisted object, not a redacted copy of arbitrary data', () => {
    const safe = sanitizeCandidate({ ...candidate, label: 'Advertisement user@example.com', cookies: 'private', pageText: 'chat' } as Candidate);
    expect(JSON.stringify(safe)).not.toMatch(/private|chat|unit=|user@example/);
    expect(safe.label).toContain('[email]');
  });
});
describe('conservative local policy', () => {
  it('requires both independent decision thresholds', () => {
    const d = { id: '1', model: 'test', ad: .95, essential: .1 };
    expect(shouldLearn(d)).toBe(true);
    for (const change of [{ ad: .949 }, { essential: .101 }, { ad: NaN }, { ad: 2 }, { essential: -1 }]) expect(shouldLearn({ ...d, ...change })).toBe(false);
  });
  it('keeps resources exact, scopes hosts and honors user exceptions', () => {
    const state = initialState();
    state.rules.push({ ...candidate, id: 1, ad: .99, essential: .01, model: 'test', classifierVersion: 'v1', createdAt: '' });
    expect(blocked(candidate, state)).toBe(true);
    expect(blocked({ ...candidate, url: 'https://cdn.example/banner.js?unit=content' }, state)).toBe(false);
    expect(blocked({ ...candidate, site: 'different.example' }, state)).toBe(false);
    expect(blocked({ ...candidate, site: 'notpublisher.example' }, state)).toBe(false);
    expect(blocked({ ...candidate, site: 'sub.publisher.example' }, state)).toBe(true);
    state.allows.push(candidate);
    expect(known(candidate, state)).toBe(true);
    expect(blocked(candidate, state)).toBe(false);
    state.allows = []; state.settings.disabledSites = ['publisher.example'];
    expect(blocked(candidate, state)).toBe(false);
  });
  it('uses the outermost ancestor and never guesses an unknown nested scope', () => {
    expect(topSite({ frameId: 4, type: 'script', url: candidate.url, frameAncestors: [{ url: 'https://nested.example' }, { url: 'https://publisher.example' }] })).toBe('publisher.example');
    expect(topSite({ frameId: 4, type: 'script', url: candidate.url }, 'https://unrelated.example')).toBeUndefined();
  });
  it('compiles Chrome site scoping and preserves original query semantics', () => {
    const state = initialState(); state.rules.push({ ...candidate, id: 1, ad: .99, essential: .01, model: 'test', classifierVersion: 'v1', createdAt: '' });
    expect(compileRules(state, false)[0].condition).toMatchObject({ topDomains: ['publisher.example'], urlFilter: `|${candidate.url}|`, isUrlFilterCaseSensitive: true });
    expect(compileRules(state, true)).toEqual([]);
    expect(supportsExactRule('https://example.com/*')).toBe(false);
  });
  it('preserves a subdomain release when a parent-domain rule is learned later', () => {
    const state = initialState();
    state.allows.push({ ...candidate, site: 'sub.publisher.example' });
    state.rules.push({ ...candidate, id: 1, ad: .99, essential: .01, model: 'test', classifierVersion: 'v1', createdAt: '' });
    expect(blocked({ ...candidate, site: 'sub.publisher.example' }, state)).toBe(false);
    expect(blocked(candidate, state)).toBe(true);
    expect(compileRules(state, false)[0].condition.excludedTopDomains).toEqual(['sub.publisher.example']);
  });
});
describe('filter semantics', () => {
  it('honors generic and per-domain cosmetic exceptions and exclusions', () => {
    const rules = ['##.ad', 'news.example#@#.ad', 'publisher.example,~private.publisher.example##.sponsored'].map(parseCosmetic).filter(r => r !== undefined);
    expect(selectorsFor(rules, 'news.example')).toEqual([]);
    expect(selectorsFor(rules, 'publisher.example')).toEqual(['.ad', '.sponsored']);
    expect(selectorsFor(rules, 'private.publisher.example')).toEqual(['.ad']);
    expect(parseCosmetic('example.com##+js(abort-on-property-read, x)')).toBeUndefined();
    expect(parseCosmetic('##.ad:style(color:red)')).toBeUndefined();
  });
  it('compacts only equivalent domain rules while preserving allow and type restrictions', () => {
    const rules: { id: number; priority: number; action: { type: string }; condition: Record<string, any> }[] = [
      { id: 1, priority: 1, action: { type: 'block' }, condition: { urlFilter: '||a.example^' } },
      { id: 2, priority: 1, action: { type: 'block' }, condition: { urlFilter: '||b.example^' } },
      { id: 3, priority: 2, action: { type: 'allow' }, condition: { urlFilter: '||c.example^' } },
      { id: 4, priority: 1, action: { type: 'block' }, condition: { urlFilter: '||d.example^', resourceTypes: ['script'] } },
      { id: 5, priority: 1, action: { type: 'block' }, condition: { urlFilter: '||a.example/path' } },
    ];
    const compact = compactRules(rules);
    expect(compact).toHaveLength(4);
    expect(compact.find(r => r.condition.requestDomains?.length === 2)?.condition.requestDomains).toEqual(['a.example', 'b.example']);
    expect(compact.find(r => r.action.type === 'allow')?.priority).toBe(2);
    expect(compact.some(r => r.condition.urlFilter === '||a.example/path')).toBe(true);
  });
});
