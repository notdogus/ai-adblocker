import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromiumDriver } from './chromium';
import { startFixture } from './fixture';

if (!process.env.TYPESAFE_API_KEY) throw new Error('Set TYPESAFE_API_KEY to run the live model fixture.');
await mkdir('test-results', { recursive: true });
const report: any = { testedAt: new Date().toISOString() };
const chrome = await chromiumDriver();
try {
  const fixture = await startFixture();
  try {
    await chrome.open('about:blank');
    await chrome.rpc('key', { key: process.env.TYPESAFE_API_KEY });
    const state = await chrome.rpc('state');
    await chrome.rpc('settings', { settings: { ...state.settings, aiEnabled: true } });
    await chrome.open(fixture.url);
    let learned; const deadline = Date.now() + 20000;
      do { learned = await chrome.rpc('state'); if (learned.rules.length || /fail|invalid|unreachable/i.test(learned.status)) break; await delay(500); } while (Date.now() < deadline);
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
} finally { await chrome.close(); await writeFile('test-results/live.json', JSON.stringify(report, null, 2)); }
