import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { startFixture } from './fixture';
import { chromiumDriver } from './chromium';
import { firefoxDriver } from './firefox';

await mkdir('test-results', { recursive: true });
const target = process.env.TEST_BROWSER ?? 'both';
const factories = target === 'chromium' ? [chromiumDriver] : target === 'firefox' ? [firefoxDriver] : [chromiumDriver, firefoxDriver];
for (const factory of factories) {
  const fixture = await startFixture();
  console.log('Fixture ready; starting', factory.name);
  const driver = await factory();
  console.log(driver.name, 'extension loaded');
  try {
    await driver.mock('success');
    await driver.rpc('key', { key: 'test-only-not-a-real-key' });
    const state = await driver.rpc('state');
    await driver.rpc('settings', { settings: { ...state.settings, aiEnabled: true } });
    await driver.open(`${fixture.url}/nested`);
    const deadline = Date.now() + 20000;
    let learned;
    do { learned = await driver.rpc('state'); if (learned.rules.length >= 2) break; await delay(300); } while (Date.now() < deadline);
    assert.equal(learned.rules.length, 2, `${driver.name}: learned script and banner; status=${learned.status}`);
    assert.ok(learned.rules.every((r: any) => r.site === 'localhost'));
    assert.ok((fixture.counts['/commercial-loader.js'] ?? 0) > 0, 'first visit reaches source');
    assert.ok((fixture.counts['/ad-child'] ?? 0) > 0, 'first visit runs loader');
    assert.equal(await driver.appReady(), 'Application ready');
    await driver.mock('offline');
    fixture.reset();
    await driver.open(`${fixture.url}/nested`);
    await delay(400);
    assert.equal(fixture.counts['/commercial-loader.js'] ?? 0, 0, 'learned loader never reaches server');
    assert.equal(fixture.counts['/banner.svg'] ?? 0, 0, 'learned banner never reaches server');
    assert.equal(fixture.counts['/ad-child'] ?? 0, 0, 'blocking loader prevents child request');
    assert.equal(await driver.appReady(), 'Application ready');
    await driver.restart(); await driver.mock('offline');
    assert.equal((await driver.rpc('state')).rules.length, 2, 'rules survive browser restart');
    fixture.reset(); await driver.open(`${fixture.url}/nested`); await delay(400);
    assert.equal(fixture.counts['/commercial-loader.js'] ?? 0, 0, 'restart preserves pre-request blocking');
    assert.equal(fixture.counts['/banner.svg'] ?? 0, 0);
    fixture.reset(); await driver.open(fixture.otherUrl); await delay(300);
    assert.ok((fixture.counts['/commercial-loader.js'] ?? 0) > 0, 'same source on another top-level host stays allowed');
    const rule = (await driver.rpc('state')).rules.find((r: any) => r.type === 'script');
    await driver.rpc('allow', { id: rule.id });
    fixture.reset(); await driver.open(`${fixture.url}/nested`); await delay(300);
    assert.ok((fixture.counts['/commercial-loader.js'] ?? 0) > 0, 'manual release loads resource');
    assert.equal(fixture.counts['/banner.svg'] ?? 0, 0, 'independent rule still blocks');
    await driver.rpc('site', { site: 'localhost', enabled: false });
    const callsBeforeBypass = (await driver.rpc('state')).budget.calls;
    fixture.reset(); await driver.open(`${fixture.url}/nested`); await delay(300);
    assert.ok((fixture.counts['/banner.svg'] ?? 0) > 0, 'site bypass includes nested frames');
    await delay(1800);
    assert.equal((await driver.rpc('state')).budget.calls, callsBeforeBypass, 'excluded site cannot trigger cloud analysis');

    // Exhausted budget must not turn off existing rules or delay the page.
    const beforeLimit = await driver.rpc('state');
    await driver.rpc('settings', { settings: { ...beforeLimit.settings, dailyLimit: beforeLimit.budget.calls || 1 } });
    await driver.rpc('site', { site: 'localhost', enabled: true });
    await driver.mock('success');
    fixture.reset(); await driver.open(`${fixture.url}/nested`); await delay(2000);
    assert.equal(fixture.counts['/banner.svg'] ?? 0, 0, 'budget exhaustion preserves learned rules');
    assert.equal((await driver.rpc('state')).budget.calls, beforeLimit.budget.calls, 'budget never exceeded');
    assert.equal(await driver.appReady(), 'Application ready');

    // With no remaining rules, an invalid provider response must not create any.
    await driver.rpc('reset');
    const reset = await driver.rpc('state');
    assert.equal(reset.rules.length, 0);
    assert.equal(reset.allows.length, 1, 'reset preserves explicit releases');
    await driver.rpc('settings', { settings: { ...reset.settings, dailyLimit: 200 } });
    await driver.mock('malformed');
    fixture.reset(); await driver.open(`${fixture.url}/nested`); await delay(2200);
    const malformed = await driver.rpc('state');
    assert.equal(malformed.rules.length, 0, 'malformed inference never becomes a rule');
    assert.ok((fixture.counts['/banner.svg'] ?? 0) > 0, 'unknown requests remain allowed on failure');
    assert.equal(await driver.appReady(), 'Application ready');
    await driver.rpc('key', { key: '' });
    assert.equal((await driver.rpc('state')).hasKey, false);
    assert.equal((await driver.rpc('state')).settings.aiEnabled, false);
    await driver.refreshOptions();
    await driver.screenshot(`test-results/${driver.name.toLowerCase()}-options.png`);
    assert.deepEqual(driver.errors, []);
    console.log(`${driver.name}: PASS — learning, nested frames, network prevention, restart/offline, site isolation, releases, bypass, budget, reset and provider failures.`);
  } finally { await driver.close(); await fixture.close(); }
}
