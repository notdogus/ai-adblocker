import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

export async function startFixture() {
  const counts: Record<string, number> = {};
  const server = createServer((req, res) => {
    const path = new URL(req.url!, 'http://fixture').pathname;
    counts[path] = (counts[path] ?? 0) + 1;
    res.setHeader('Cache-Control', 'no-store');
    const port = (server.address() as AddressInfo).port;
    if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
      res.end(path.includes('commercial') ? `window.fixtureAdLoaded=true;fetch('/ad-child');` : `window.fixtureAppLoaded=true;document.querySelector('#app-status').textContent='Application ready';`);
    } else if (path === '/banner.svg') {
      res.setHeader('Content-Type', 'image/svg+xml'); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="100"><rect width="320" height="100" fill="orange"/></svg>');
    } else if (path === '/ad-child') { res.end('ad delivery'); }
    else {
      res.setHeader('Content-Type', 'text/html');
      const nested = path === '/nested';
      res.end(`<!doctype html><html><head><title>Blocker test fixture</title></head><body><h1>Article and player remain usable</h1><p id="app-status">Loading</p><video id="player" controls></video><script src="/app.js"></script>${nested ? `<iframe title="Nested test" src="http://127.0.0.1:${port}/frame"></iframe>` : `<script title="Advertisement" class="advertisement" src="http://127.0.0.1:${port}/commercial-loader.js?unit=sidebar"></script><img title="Advertisement" src="http://127.0.0.1:${port}/banner.svg"><div class="adsbygoogle" style="height:20px">Known cosmetic advert</div>`}</body></html>`);
    }
  });
  await new Promise<void>(resolve => server.listen(0, '0.0.0.0', resolve));
  const port = (server.address() as AddressInfo).port;
  return { url: `http://localhost:${port}`, otherUrl: `http://127.0.0.1:${port}`, counts,
    reset() { for (const key of Object.keys(counts)) delete counts[key]; },
    close() { server.closeAllConnections(); return new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); },
  };
}

// Injected into the real background global by the test driver, never compiled
// into the extension. This replaces only the TypeSafe transport in offline CI.
export function mockTransport(mode: 'success' | 'offline' | 'malformed') {
  const root = globalThis as any;
  root.__originalFetch ??= root.fetch.bind(root);
  root.__inferenceCalls = 0;
  root.fetch = async (input: any, init?: RequestInit) => {
    if (String(input) !== 'https://api.typesafe.ai/v1/systemone') return root.__originalFetch(input, init);
    root.__inferenceCalls++;
    if (mode === 'offline') throw new Error('Test provider unavailable');
    if (mode === 'malformed') return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
    const body = JSON.parse(String(init?.body));
    const answers: Record<string, unknown> = {};
    body.state.candidates.forEach((candidate: any, index: number) => {
      const ad = /commercial-loader|banner\.svg|standalone-unit/.test(candidate.url) || candidate.type === 'popup' || candidate.type === 'overlay' && /sponsor-layer/.test(candidate.marker);
      answers[`ad_${index}`] = { type: 'noul', noul: ad ? .99 : .01 };
      answers[`essential_${index}`] = { type: 'noul', noul: ad ? .01 : .99 };
    });
    return new Response(JSON.stringify({ model: 'jev-test-fixture', answers }), { headers: { 'Content-Type': 'application/json' } });
  };
}
