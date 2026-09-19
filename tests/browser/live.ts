import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromiumDriver } from './chromium';
import { firefoxDriver } from './firefox';
import { startFixture } from './fixture';

await mkdir('test-results', { recursive: true });
const report: any = { testedAt: new Date().toISOString(), chromium: [], firefox: [] };
const adHost = (host: string) => /(^|\.)(googlesyndication\.com|doubleclick\.net|powerad\.ai|intergient\.com|adscale\.de)$/.test(host);
const paths = ['/', '/anime/folge/1178'];
const chrome = await chromiumDriver();
try {
  const completed: string[] = []; const failed: string[] = [];
  chrome.context.on('response', response => { const host = new URL(response.url()).hostname; if (adHost(host)) completed.push(host); });
  chrome.context.on('requestfailed', request => { const host = new URL(request.url()).hostname; if (adHost(host)) failed.push(host); });
  for (const enabled of [false, true]) {
    await chrome.rpc('site', { site: 'onepiece.tube', enabled });
    for (const path of paths) {
      completed.length = 0; failed.length = 0;
      await chrome.open(`https://onepiece.tube${path}`);
      await chrome.page.getByRole('button', { name: /Anime Streams/ }).waitFor();
      await delay(3000);
      const row: any = { path, enabled, adResponses: [...new Set(completed)], blockedAdHosts: [...new Set(failed)], title: await chrome.page.title(), frames: chrome.page.frames().map(f => { try { return new URL(f.url()).hostname; } catch { return ''; } }).filter(Boolean) };
      row.visibleAdElements = await chrome.page.locator('ins.adsbygoogle, iframe[title="Advertisement"]').evaluateAll(elements => elements.filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; }).length);
      row.chatPresent = row.frames.some((host: string) => host.includes('chatango'));
      if (path.includes('/folge/')) {
        row.playerFrames = [];
        for (const frame of chrome.page.frames()) {
          try {
          const video = frame.locator('video').first();
          if (await video.count()) {
            const host = new URL(frame.url()).hostname;
            if (enabled && ['www.ani-stream.com', 'hubu.cloud'].includes(host)) {
              // Do not click or call play from the test. The player adapter must
              // disable the pre-roll configuration and start the content stream.
              await delay(1800);
            }
            row.playerFrames.push({ host, videoPresent: true, state: await video.evaluate((v: any) => ({ readyState: v.readyState, paused: v.paused, currentTime: v.currentTime })) });
          }
          } catch { /* Advertising frames can disappear during a baseline capture. */ }
        }
      }
      if (enabled && path.includes('/folge/')) {
        await chrome.page.locator('iframe[src*="ani-stream"]').scrollIntoViewIfNeeded();
        await chrome.page.screenshot({ path: 'test-results/onepiece-visible-player.png' });
      }
      await chrome.page.screenshot({ path: `test-results/onepiece-${enabled ? 'protected' : 'baseline'}-${path === '/' ? 'home' : 'episode'}.png`, fullPage: true });
      report.chromium.push(row);
      console.log('Chromium live', JSON.stringify(row));
      if (enabled) {
        assert.equal(row.adResponses.length, 0, 'known ad loaders never return a response'); assert.equal(row.visibleAdElements, 0, 'known ad containers are hidden'); assert.ok(row.chatPresent, 'chat remains loaded');
        if (path.includes('/folge/')) assert.ok(row.playerFrames.some((p: any) => !p.state.paused && p.state.currentTime > 0), 'real video player can play');
      }
    }
  }
  if (process.env.TYPESAFE_API_KEY) {
    const fixture = await startFixture();
    try {
      await chrome.open('about:blank');
      await chrome.rpc('key', { key: process.env.TYPESAFE_API_KEY });
      const state = await chrome.rpc('state');
      await chrome.rpc('settings', { settings: { ...state.settings, aiEnabled: true } });
      await chrome.open(fixture.url);
      let learned; const deadline = Date.now() + 20000;
      do { learned = await chrome.rpc('state'); if (learned.rules.length || learned.status.includes('fehlgeschlagen') || learned.status.includes('ungültig')) break; await delay(500); } while (Date.now() < deadline);
      const fixtureRules = learned.rules.filter((r: any) => r.site === 'localhost');
      report.liveLearning = { rules: fixtureRules.map((r: any) => ({ type: r.type, ad: r.ad, essential: r.essential, model: r.model })), status: learned.status, calls: learned.budget.calls };
      if (!fixtureRules.length) throw new Error(`Live learning produced no fixture rules: ${learned.status}`);
      await chrome.rpc('key', { key: '' });
      fixture.reset(); await chrome.open(fixture.url); await delay(500);
      for (const rule of fixtureRules) {
        const path = new URL(rule.url).pathname;
        assert.equal(fixture.counts[path] ?? 0, 0, 'real Jev decision blocks next visit without a key');
      }
      report.liveLearning.preventedWithoutKey = true;
      console.log('Actual TypeSafe learning', JSON.stringify(report.liveLearning));
    } finally { await chrome.rpc('key', { key: '' }); await fixture.close(); }
  }
} finally { await chrome.close(); await writeFile('test-results/live.json', JSON.stringify(report, null, 2)); }

const ff = await firefoxDriver();
try {
  await ff.recordAds();
  for (const path of paths) {
    await ff.adEvents(true);
    await ff.open(`https://onepiece.tube${path}`); await delay(3000); await ff.usePage();
    const row: any = await ff.native.executeScript(`return {
      title: document.title,
      attemptedAdResourceHosts: [...new Set(performance.getEntriesByType('resource').filter(r=>/(googlesyndication|doubleclick|powerad|intergient|adscale)/.test(r.name)).map(r=>new URL(r.name).hostname))],
      visibleAdElements: [...document.querySelectorAll('ins.adsbygoogle,iframe[title="Advertisement"]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden';}).length,
      chatPresent: [...document.querySelectorAll('iframe')].some(e=>e.src.includes('chatango')),
      frameHosts: [...document.querySelectorAll('iframe')].map(e=>{try{return new URL(e.src).hostname;}catch{return '';}})
    };`);
    row.network = await ff.adEvents(false);
    row.path = path; report.firefox.push(row); console.log('Firefox live', JSON.stringify(row));
    assert.equal(row.visibleAdElements, 0); assert.ok(row.chatPresent);
    assert.equal(row.network.responses.length, 0, 'Firefox native observer sees no ad response');
    assert.ok(row.network.blocked.length > 0, 'Firefox native observer confirms blocking');
  }
} finally { await ff.close(); await writeFile('test-results/live.json', JSON.stringify(report, null, 2)); }
