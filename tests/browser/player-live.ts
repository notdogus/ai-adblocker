import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromiumDriver } from './chromium';

// Targets are supplied locally; no private test websites are published.
const urls = (process.env.LIVE_TEST_URLS ?? '').split('\n').map(url => url.trim()).filter(Boolean);
if (!urls.length) throw new Error('Set LIVE_TEST_URLS to the HTTP(S) pages you want to test.');
for (const value of urls) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Test URLs must use HTTP(S) without credentials.');
}
const embeddedOnly = process.env.LIVE_EMBEDDED_ONLY === '1';
const driver = await chromiumDriver();
const report: any[] = [];
try {
  if (process.env.TYPESAFE_API_KEY) {
    await driver.rpc('key', { key: process.env.TYPESAFE_API_KEY });
    const state = await driver.rpc('state');
    await driver.rpc('settings', { settings: { ...state.settings, aiEnabled: true, dailyLimit: 12 } });
  }
  for (const url of urls) {
    const entry: any = { site: new URL(url).hostname, opened: false, popups: 0, clicks: [], frames: [] };
    const popup = async (page: any) => { entry.popups++; await page.close().catch(() => {}); };
    driver.page.on('popup', popup);
    try {
      await driver.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 }); entry.opened = true;
      await delay(5000);
      if (entry.site === 'www.youtube.com') {
        // The consent button's accessible name differs from its visible text.
        // Decline optional cookies in this disposable test profile.
        for (const frame of driver.page.frames()) {
          for (const button of await frame.getByRole('button').filter({ hasText: /^Alle ablehnen$|^Reject all$/i }).all()) {
            if (await button.isVisible()) { await button.click(); await delay(1500); break; }
          }
        }
      }
      // Inspect player structure before selecting targets.
      for (const frame of driver.page.frames()) {
        const info = await frame.evaluate(() => ({ host: location.hostname, videos: document.querySelectorAll('video').length,
          gate: Boolean(document.querySelector('#verification') && getComputedStyle(document.querySelector('#verification')!).display !== 'none'),
          buttons: [...document.querySelectorAll('button')].map(e => ({ cls: e.className, label: e.getAttribute('aria-label') })).filter(e => /play|spiel|abspiel|skip|überspring/i.test(`${e.cls} ${e.label}`)).slice(0, 8),
          covers: [...document.querySelectorAll('video')].map(v => { const r = v.getBoundingClientRect(); const e = document.elementFromPoint(r.x+r.width/2, r.y+r.height/2); return e ? { tag: e.tagName, id: e.id, cls: e.getAttribute('class') } : null; })
        })).catch(() => null);
        if (!info) continue;
        entry.frames.push(info);
        if (info.gate) entry.blockedBy = 'site verification';
        if (entry.blockedBy || !info.videos || !/^https?:/.test(frame.url()) || entry.clicks.length) continue;
        if (embeddedOnly && frame === driver.page.mainFrame()) continue;
        const video = frame.locator('video').first();
        if (!await video.isVisible().catch(() => false)) continue;
        // Click the actual surface coordinate, including an intercepted overlay.
        await driver.page.bringToFront();
        if (frame !== driver.page.mainFrame()) await (await frame.frameElement()).evaluate(e => (e as Element).scrollIntoView({ block: 'center' }));
        else await video.evaluate(e => e.scrollIntoView({ block: 'center' }));
        const box = frame !== driver.page.mainFrame() ? await (await frame.frameElement()).boundingBox() : await video.boundingBox();
        if (box) {
          const paused = await video.evaluate(v => (v as HTMLVideoElement).paused);
          if (entry.site !== 'www.youtube.com' || paused) await driver.page.mouse.click(box.x+box.width/2, box.y+box.height/2);
          entry.clicks.push(info.host);
        }
        await delay(1500);
        // Observe a second gesture after any first-click gate has been removed.
        if (box && entry.site !== 'www.youtube.com' && await video.evaluate(v => (v as HTMLVideoElement).paused)) await driver.page.mouse.click(box.x+box.width/2, box.y+box.height/2);
      }
      await delay(5000);
      entry.playback = [];
      for (const frame of driver.page.frames()) {
        const before = await frame.evaluate(() => [...document.querySelectorAll('video')].map(v => ({ time: v.currentTime, paused: v.paused, ready: v.readyState, error: v.error?.code ?? null }))).catch(() => []);
        await delay(400);
        const after = await frame.evaluate(() => [...document.querySelectorAll('video')].map(v => v.currentTime)).catch(() => []);
        if (before.length && /^https?:/.test(frame.url()) && !(embeddedOnly && frame === driver.page.mainFrame())) entry.playback.push({ host: new URL(frame.url()).hostname, videos: before.map((v,i) => ({ ...v, advanced: (after[i] ?? 0) > v.time })) });
      }
      const state = await driver.rpc('state');
      entry.rules = state.rules.filter((r: any) => r.site === entry.site).map((r: any) => ({ type: r.type, url: r.url, selector: r.selector, ad: r.ad, essential: r.essential }));
      entry.calls = state.budget.calls; entry.status = state.status;
    } catch (error) { entry.error = error instanceof Error ? error.message.split('\n')[0] : String(error); }
    finally { driver.page.off('popup', popup); }
    report.push(entry); console.log(JSON.stringify(entry));
  }
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/player-live.json', JSON.stringify(report, null, 2));
} finally { await driver.close(); }
