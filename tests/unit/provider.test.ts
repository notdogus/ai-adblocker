import { describe, expect, it, vi } from 'vitest';
import { TypeSafeProvider } from '../../lib/provider';
import type { SafeCandidate } from '../../lib/types';
const candidate: SafeCandidate = { id: 'abc', site: 'example.com', url: 'https://ads.example/banner.js', type: 'script' };
const response = (answers: any, model: any = 'jev-1.13.0') => new Response(JSON.stringify({ model, answers }));
describe('TypeSafe contract', () => {
  it('batches independent questions and parses Noul without inventing confidence', async () => {
    const fetcher = vi.fn(async () => response({ ad_0: { type: 'noul', noul: .98 }, essential_0: { type: 'noul', noul: .02 } }));
    expect(await new TypeSafeProvider('test-key', 'jev-1.13.0', fetcher).evaluate([candidate])).toEqual([{ id: 'abc', model: 'jev-1.13.0', ad: .98, essential: .02 }]);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    const body = JSON.parse(init.body as string);
    expect(Object.keys(body.questions)).toEqual(['ad_0', 'essential_0']);
    expect(body.questions.ad_0.instructions).toContain('`candidates[0]`');
    expect(init.redirect).toBe('error');
    expect(init.credentials).toBe('omit');
  });
  it.each([{}, { ad_0: { type: 'noul', noul: 4 }, essential_0: { type: 'noul', noul: 0 } }, { ad_0: { type: 'choice', noul: .99 }, essential_0: { type: 'noul', noul: 0 } }])('rejects malformed or missing answers', async answers => {
    await expect(new TypeSafeProvider('test-key', 'test', async () => response(answers)).evaluate([candidate])).rejects.toThrow();
  });
  it.each([401, 429, 529, 500])('does not leak server bodies or keys on HTTP %i', async status => {
    const provider = new TypeSafeProvider('secret-key', 'test', async () => new Response('private server response secret-key', { status }));
    await expect(provider.evaluate([candidate])).rejects.not.toThrow(/private|secret-key/);
  });
  it('fails open through an explicit error on network failure', async () => {
    await expect(new TypeSafeProvider('test-key', 'test', async () => { throw new Error('request with secret-key failed'); }).evaluate([candidate])).rejects.toThrow('TypeSafe nicht erreichbar');
  });
  it('binds the default browser fetch receiver', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async function (this: unknown) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      return response({ ad_0: { type: 'noul', noul: .99 }, essential_0: { type: 'noul', noul: .01 } });
    };
    try { expect(await new TypeSafeProvider('test-key', 'test').evaluate([candidate])).toHaveLength(1); }
    finally { globalThis.fetch = original; }
  });
});
