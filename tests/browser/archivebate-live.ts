import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromiumDriver } from './chromium';

// Explicit live check of the user-supplied page. No screenshots, page text,
// popup destinations, media URLs or API payloads are retained.
const driver = await chromiumDriver();
const model = process.env.LIVE_MODEL !== '0' && Boolean(process.env.TYPESAFE_API_KEY);
const report: any = { browser: driver.name, model, visits: [] };
let popups = 0;
driver.context.on('page', async page => { popups++; await page.close().catch(() => {}); });
try {
  if (model) {
    await driver.rpc('key', { key: process.env.TYPESAFE_API_KEY });
    const state = await driver.rpc('state');
    await driver.rpc('settings', { settings: { ...state.settings, aiEnabled: true, dailyLimit: 12 } });
  }
  for (const visit of ['initial', 'keyless-revisit']) {
    if (visit === 'keyless-revisit') await driver.rpc('key', { key: '' });
    const callsBefore = (await driver.rpc('state')).budget.calls;
    await driver.page.goto('https://archivebate.com/watch/16451951', { waitUntil: 'domcontentloaded', timeout: 40000 });
    await delay(5000);
    const gate = driver.page.locator('#verification #verify');
    const continued = await gate.isVisible();
    if (continued) { await gate.click(); await delay(1800); }
    const container = driver.page.locator('iframe.video-frame');
    await container.waitFor({ state: 'visible' });
    await container.evaluate(e => e.scrollIntoView({ block: 'center' }));
    const frame = await (await container.elementHandle())!.contentFrame();
    assert.ok(frame, 'embedded player frame is available');
    const video = frame.locator('video').first();
    await video.waitFor({ state: 'visible' });
    let clicks = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await video.evaluate(v => !(v as HTMLVideoElement).paused)) break;
      const box = await container.boundingBox();
      assert.ok(box, 'player has a visible click surface');
      await driver.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      clicks++;
      await delay(2600);
    }
    const before = await video.evaluate(v => (v as HTMLVideoElement).currentTime);
    await delay(5000);
    const playback = await video.evaluate(element => {
      const v = element as HTMLVideoElement, r = v.getBoundingClientRect();
      return { time: v.currentTime, paused: v.paused, ready: v.readyState, error: v.error?.code ?? null,
        emptyShields: document.elementsFromPoint(r.x + r.width / 2, r.y + r.height / 2).filter(e =>
          e.tagName === 'DIV' && !e.childNodes.length && ['absolute', 'fixed'].includes(getComputedStyle(e).position)).length };
    });
    const state = await driver.rpc('state');
    const entry = { visit, continued, clicks, popups, ...playback, advanced: playback.time > before + 1,
      calls: state.budget.calls - callsBefore, status: state.status,
      rules: state.rules.filter((r: any) => r.site === 'archivebate.com').map((r: any) => ({ type: r.type, frame: new URL(r.url).hostname, selector: r.selector, ad: r.ad, essential: r.essential })) };
    report.visits.push(entry); console.log(JSON.stringify(entry));
    assert.equal(popups, 0, 'no advertising window was created (closing one would still fail)');
    assert.equal(playback.error, null, 'requested video has no media error');
    assert.ok(entry.advanced && !playback.paused && playback.ready >= 2, 'requested video plays and advances');
    assert.equal(playback.emptyShields, 0, 'no empty click shield remains at the player center');
    if (visit === 'keyless-revisit') assert.equal(entry.calls, 0, 'revisit makes no cloud calls');
  }
} catch (error) {
  report.error = error instanceof Error ? error.message.split('\n')[0] : String(error);
  throw error;
} finally {
  await mkdir('test-results', { recursive: true });
  await writeFile(`test-results/archivebate-${model ? 'model' : 'keyless'}-live.json`, JSON.stringify(report, null, 2));
  await driver.close();
}
