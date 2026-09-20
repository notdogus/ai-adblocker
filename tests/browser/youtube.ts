import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { chromiumDriver } from './chromium';
if (process.env.TEST_BROWSER === 'firefox') process.exit(0);
const driver = await chromiumDriver();
const data = { videoDetails: { videoId: 'fixture' }, streamingData: { adaptiveFormats: [{ url: 'https://media.example/main?token=preserved' }] }, captions: { tracks: ['de'] }, playabilityStatus: { status: 'OK' }, playerAds: [{ creative: true }], adPlacements: [{ slot: true }], adSlots: [{ slot: true }] };
try {
  await driver.page.route('https://www.youtube.com/**', route => {
    if (new URL(route.request().url()).pathname === '/youtubei/v1/player') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><script>window.ytInitialPlayerResponse=${JSON.stringify(data)}</script><div id="movie_player"><video></video><button class="ytp-skip-ad-button" onclick="window.skips=(window.skips||0)+1;document.querySelector('#movie_player').className=''">Skip</button></div>` });
  });
  await driver.open('https://www.youtube.com/watch?v=fixture'); await delay(600);
  const original = await driver.page.evaluate(() => (window as any).ytInitialPlayerResponse);
  assert.equal(original.adSlots, undefined, 'initial response captured before startup is cleaned after context arrives');
  assert.deepEqual(original.streamingData, data.streamingData, 'content URL and parameters are preserved');
  for (const method of ['json', 'text', 'xhr-text', 'xhr-json']) {
    const result = await driver.page.evaluate(async method => {
      if (method === 'json') return (await fetch('/youtubei/v1/player')).json();
      if (method === 'text') return JSON.parse(await (await fetch('/youtubei/v1/player')).text());
      return new Promise(resolve => {
        const xhr = new XMLHttpRequest(); xhr.open('GET', '/youtubei/v1/player');
        if (method === 'xhr-json') xhr.responseType = 'json';
        xhr.onload = () => resolve(method === 'xhr-json' ? xhr.response : JSON.parse(xhr.responseText)); xhr.send();
      });
    }, method) as any;
    assert.equal(result.playerAds, undefined, `${method}: ad metadata removed`);
    assert.equal(result.adPlacements, undefined, `${method}: placement removed`);
    assert.deepEqual(result.streamingData, data.streamingData);
    assert.deepEqual(result.captions, data.captions);
  }
  assert.equal(await driver.page.evaluate(() => (window as any).skips ?? 0), 0, 'skip-like control outside an ad is untouched');
  await driver.page.evaluate(() => { document.querySelector('#movie_player')!.className = 'ad-showing'; });
  await driver.page.waitForFunction(() => (window as any).skips === 1);
  assert.equal(await driver.page.locator('video').evaluate(v => (v as HTMLVideoElement).currentTime), 0, 'fallback never seeks through content');
  await driver.rpc('site', { site: 'youtube.com', enabled: false });
  await delay(300);
  const bypass = await driver.page.evaluate(async () => (await fetch('/youtubei/v1/player')).json());
  assert.deepEqual(bypass, data, 'site bypass restores response semantics');
  console.log('Chromium: PASS — YouTube initial response, fetch JSON/text, XHR JSON/text, separate ad metadata, captions/content preservation, skip guard and bypass. Synthetic responses, not a live ad guarantee.');
} finally { await driver.close(); }
