import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { By } from 'selenium-webdriver';
import { chromiumDriver } from './chromium';
import { firefoxDriver } from './firefox';
import { playerFixture } from './player-fixture';

const factories = process.env.TEST_BROWSER === 'chromium' ? [chromiumDriver] : process.env.TEST_BROWSER === 'firefox' ? [firefoxDriver] : [chromiumDriver, firefoxDriver];
for (const factory of factories) {
  const fixture = await playerFixture();
  const driver = await factory();
  let frame = false;
  async function execute(script: string): Promise<any> {
    if ('page' in driver) {
      const target = frame ? await (await driver.page.$('#nested'))!.contentFrame() : driver.page;
      return target!.evaluate(script);
    }
    await driver.usePage(); await driver.native.switchTo().defaultContent();
    if (frame) await driver.native.switchTo().frame(await driver.native.findElement(By.css('#nested')));
    return driver.native.executeScript(`return (${script})`);
  }
  async function click(selector: string) {
    if ('page' in driver) { await (frame ? driver.page.frameLocator('#nested').locator(selector) : driver.page.locator(selector)).click(); return; }
    await driver.usePage(); await driver.native.switchTo().defaultContent();
    if (frame) await driver.native.switchTo().frame(await driver.native.findElement(By.css('#nested')));
    await driver.native.findElement(By.css(selector)).click();
  }
  async function windows() { return 'context' in driver ? driver.context.pages().length : (await driver.native.getAllWindowHandles()).length; }
  async function until(predicate: () => Promise<boolean>, label: string) {
    const end = Date.now() + 22000;
    while (Date.now() < end) { if (await predicate()) return; await delay(150); }
    assert.fail(`${driver.name}: timed out: ${label}`);
  }
  try {
    await driver.mock('success'); await driver.rpc('key', { key: 'test-only-not-a-real-key' });
    const state = await driver.rpc('state');
    await driver.rpc('settings', { settings: { ...state.settings, aiEnabled: true } });
    await driver.open(`${fixture.url}/nested-player`); frame = true;
    await delay(600);
    const count = await windows();
    await click('#play'); await delay(250);
    assert.equal(await windows(), count, 'no blank, resized or direct advertising window is created');
    assert.equal(await execute('window.afterPopup'), true, 'remaining player handler still runs');
    await until(async () => await execute('document.querySelector("video").currentTime > .2'), 'real video frames advance');
    await until(async () => (await driver.rpc('state')).rules.some((r: any) => r.type === 'popup' && r.url.includes('shared-player')), 'shared player popup rule');
    await until(async () => (await driver.rpc('state')).rules.some((r: any) => r.type === 'overlay'), 'overlay rule');
    await until(async () => await execute('getComputedStyle(document.querySelector(".sponsor-layer")).display === "none"'), 'overlay removed on current page');
    const learned = await driver.rpc('state');
    assert.ok(!learned.rules.some((r: any) => r.type === 'script' && r.url.includes('shared-player')), 'shared playback code is not blocked as a resource');
    assert.ok(learned.rules.every((r: any) => r.site === 'localhost'), 'nested behavior belongs to publisher');
    assert.equal(await execute('getComputedStyle(document.querySelector(".vjs-control-bar")).display'), 'block');
    await click('#outside'); await delay(200);
    assert.equal(await windows(), count, 'learned side effect is suppressed outside the initial play gesture');
    await execute('(() => { document.querySelector("#player").append(document.querySelector("#synthetic")); document.querySelector("#synthetic").style="position:absolute;top:150px;left:250px"; return true; })()');
    await click('#synthetic'); await delay(200);
    assert.equal(await windows(), count, 'synthetic new-tab anchor cannot evade the play intent guard');
    await click('#realm'); await delay(200);
    assert.equal(await execute('window.realmDone'), true);
    assert.equal(await windows(), count, 'fresh same-origin iframe cannot supply an unguarded open function');
    await click('#share-link'); await delay(300);
    assert.equal(await windows(), count + 1, 'explicit player navigation still opens');
    await click('#share-button'); await delay(200);
    assert.equal(await windows(), count + 2, 'explicit share control still opens');
    await click('#navigate'); await delay(150);
    assert.equal(await execute('location.hash'), '#details', 'same-context navigation is not treated as a popup');

    // Unlabelled player shield: an uncertain geometry judgment must
    // not suppress stronger evidence when the same element triggers a popup.
    await execute('window.addClickShield()');
    await until(async () => (await driver.evaluations()).some(c => c.type === 'overlay' && !c.marker.trim() && !c.evidence.interceptsPlayback), 'unlabelled shield assessed from geometry');
    assert.notEqual(await execute('getComputedStyle(window.shield).display'), 'none', 'geometry alone does not hide an unclassified layer');
    const beforeLearnedShield = await windows();
    await click('#player > div:last-child');
    await until(async () => (await driver.rpc('state')).rules.some((r: any) => r.type === 'overlay' && r.selector.includes('nth-of-type')), 'popup evidence upgrades the previously uncertain shield');
    assert.equal(await windows(), beforeLearnedShield, 'previously observed caller cannot open a new advertising window');
    assert.equal(await execute('getComputedStyle(window.shield).display'), 'none', 'fresh shield from the same caller is disarmed');
    await execute('window.addClickShield()');
    await until(async () => await execute('getComputedStyle(window.shield).display === "none"'), 'learned shield removed before another click');
    assert.equal((await driver.evaluations()).filter(c => c.type === 'overlay' && c.evidence.interceptsPlayback).length, 1, 'stronger evidence is evaluated once');

    await driver.mock('offline'); await driver.rpc('key', { key: '' });
    await driver.restart(); await driver.mock('offline');
    fixture.reset(); await driver.open(`${fixture.url}/nested-player`); frame = true; await delay(600);
    assert.equal(fixture.counts['/standalone-unit.js'] ?? 0, 0, 'learned advertising loader blocked before request');
    assert.equal(fixture.counts['/unit-child'] ?? 0, 0, 'loader child chain never starts');
    assert.ok((fixture.counts['/shared-player.js'] ?? 0) > 0, 'mixed-use player still loads');
    await until(async () => await execute('getComputedStyle(document.querySelector(".sponsor-layer")).display === "none"'), 'persisted overlay works without key');
    await click('#play');
    await until(async () => await execute('document.querySelector("video").currentTime > .2'), 'playback without inference');
    await execute('window.addClickShield()');
    await until(async () => await execute('getComputedStyle(window.shield).display === "none"'), 'learned unlabelled shield removed without a key after restart');
    const beforeShield = await windows();
    await execute('(() => { const cover=document.createElement("div"); cover.style="position:absolute;inset:0;z-index:100000"; cover.onclick=()=>window.open("about:blank"); document.querySelector("#player").append(cover); return true; })()');
    await click('#player > div:last-child');
    await until(async () => await execute('getComputedStyle(document.querySelector("#player > div:last-child")).display === "none"'), 'classless proven click shield disarmed without AI');
    assert.equal(await windows(), beforeShield, 'shield creates no blank window');
    await execute('(() => { document.querySelector("#player > div:last-child").append(document.createElement("video")); return true; })()');
    await until(async () => await execute('getComputedStyle(document.querySelector("#player > div:last-child")).display !== "none"'), 'recycled shield containing media restored');
    await execute('(() => { document.querySelector("#player > div:last-child").remove(); return true; })()');
    const overlay = (await driver.rpc('state')).rules.find((r: any) => r.type === 'overlay');
    await driver.rpc('allow', { id: overlay.id });
    await until(async () => await execute('getComputedStyle(document.querySelector(".sponsor-layer")).display !== "none"'), 'manual overlay release restores current page');

    await driver.open(`${fixture.url}/blank-player`); frame = true; await delay(600);
    const beforeBlank = await windows(); await click('#play'); await delay(300);
    assert.equal(await windows(), beforeBlank, 'inherited-origin srcdoc frame cannot open a popup');
    await until(async () => await execute('document.querySelector("video").currentTime > .2'), 'srcdoc playback remains functional');
    await driver.rpc('site', { site: 'localhost', enabled: false });
    await driver.open(`${fixture.url}/nested-player`); frame = true; await delay(600);
    assert.notEqual(await execute('getComputedStyle(document.querySelector(".sponsor-layer")).display'), 'none', 'bypass restores overlays');
    const beforeBypass = await windows(); await click('#play'); await delay(400);
    assert.ok(await windows() > beforeBypass, 'bypass restores native new-window behavior');
    console.log(`${driver.name}: PASS — player popup prevention, source learning, overlay removal, advancing video, intended navigation, synthetic links, srcdoc, offline and bypass.`);
  } finally { await driver.close(); await fixture.close(); }
}
