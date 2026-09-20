import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromiumDriver } from './chromium';
import { playerFixture } from './player-fixture';

if (!process.env.TYPESAFE_API_KEY) throw new Error('Set TYPESAFE_API_KEY in the local test process.');
// Real browser-to-Jev smoke test; at most five calls, no transport substitution.
const fixture = await playerFixture();
const driver = await chromiumDriver();
try {
  await driver.rpc('key', { key: process.env.TYPESAFE_API_KEY });
  const state = await driver.rpc('state');
  await driver.rpc('settings', { settings: { ...state.settings, aiEnabled: true, dailyLimit: 5 } });
  await driver.open(`${fixture.url}/nested-player`);
  await delay(700);
  await driver.page.frameLocator('#nested').locator('#play').click();
  await delay(15000);
  const learned = await driver.rpc('state');
  const frame = driver.page.frameLocator('#nested');
  const report = {
    rules: learned.rules.map((rule: any) => ({ type: rule.type, url: rule.url, selector: rule.selector, ad: rule.ad, essential: rule.essential })),
    calls: learned.budget.calls, status: learned.status,
    media: await frame.locator('video').evaluate(element => {
      const video = element as HTMLVideoElement;
      return { time: video.currentTime, paused: video.paused };
    }),
    overlayHidden: await frame.locator('.sponsor-layer').evaluate(element => getComputedStyle(element).display === 'none'),
  };
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/player-real-learning.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  assert.ok(report.media.time > .2 && !report.media.paused, 'requested video keeps playing');
  assert.ok(!learned.rules.some((rule: any) => rule.type === 'script' && rule.url.includes('shared-player')), 'shared player bundle stays allowed');
  assert.ok(learned.rules.length, 'at least one safe rule is learned; uncertainty is not hidden');
} finally { await driver.close(); await fixture.close(); }
