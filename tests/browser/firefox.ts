import firefox from 'selenium-webdriver/firefox.js';
import { download } from 'geckodriver';
import { mkdtemp, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';

export async function firefoxDriver() {
  const profile = await mkdtemp(join(tmpdir(), 'ai-adblocker-firefox-'));
  const uuid = '301bade4-04b1-4e61-92b4-1099038be105';
  const extensionId = 'ai-adblocker@notdogus.github.io';
  const gecko = await download();
  const addon = join(profile, 'test-addon.xpi');
  execFileSync('zip', ['-qr', addon, '.'], { cwd: resolve('.output/firefox-mv3') });
  let driver: firefox.Driver; let optionsHandle: string; let pageHandle: string;
  let service: ReturnType<firefox.ServiceBuilder['build']>;
  async function shutdown() {
    try { await driver.quit(); }
    catch (error) {
      // Some Firefox releases close Marionette before returning the quit reply.
      // Only tolerate this shutdown transport error; test commands still fail.
      if (!(error instanceof Error) || !error.message.includes('Failed to decode response from marionette')) throw error;
      console.warn('Firefox closed before acknowledging quit; stopping geckodriver.');
    } finally { await service.kill(); }
  }
  async function launch() {
    await writeFile(join(profile, 'user.js'), `user_pref("extensions.webextensions.uuids", ${JSON.stringify(JSON.stringify({ [extensionId]: uuid }))});\nuser_pref("extensions.autoDisableScopes", 0);\n`);
    const options = new firefox.Options().addArguments('-headless', '-profile', profile);
    const binary = process.env.FIREFOX_BINARY ?? (process.platform === 'darwin' ? '/Applications/Firefox.app/Contents/MacOS/firefox' : undefined);
    if (binary) { await access(binary); options.setBinary(binary); }
    service = new firefox.ServiceBuilder(gecko).addArguments('--allow-system-access').build();
    driver = await firefox.Driver.createSession(options, service);
    await driver.installAddon(addon, true);
    await driver.setContext(firefox.Context.CHROME);
    await driver.executeScript(`gBrowser.selectedBrowser.loadURI(Services.io.newURI(arguments[0]), { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });`, `moz-extension://${uuid}/options.html`);
    await driver.setContext(firefox.Context.CONTENT);
    await driver.wait(async () => driver.executeScript('return !!document.querySelector("input[name=model]")'), 15000);
    optionsHandle = await driver.getWindowHandle();
    await driver.switchTo().newWindow('tab'); pageHandle = await driver.getWindowHandle();
  }
  await launch();
  return {
    name: 'Firefox', errors: [] as string[],
    get native() { return driver; },
    async usePage() { await driver.switchTo().window(pageHandle); },
    async recordAds() {
      await driver.switchTo().window(optionsHandle);
      await driver.executeAsyncScript(`const done=arguments[arguments.length-1];browser.runtime.getBackgroundPage().then(bg=>{
        bg.__adEvents={responses:[],blocked:[]};
        const host=url=>{try{return new URL(url).hostname;}catch{return '';}};
        const isAd=h=>/(^|\\.)(googlesyndication\\.com|doubleclick\\.net|powerad\\.ai|intergient\\.com|adscale\\.de)$/.test(h);
        bg.browser.webRequest.onResponseStarted.addListener(d=>{const h=host(d.url);if(isAd(h))bg.__adEvents.responses.push(h);},{urls:['<all_urls>']});
        bg.browser.webRequest.onErrorOccurred.addListener(d=>{const h=host(d.url);if(isAd(h)&&/NS_ERROR_(ABORT|BLOCKED_BY_POLICY)/.test(d.error))bg.__adEvents.blocked.push(h);},{urls:['<all_urls>']});done();
      }).catch(e=>done(String(e)));`);
    },
    async adEvents(reset: boolean) {
      await driver.switchTo().window(optionsHandle);
      return driver.executeAsyncScript(`const done=arguments[arguments.length-1],reset=arguments[0];browser.runtime.getBackgroundPage().then(bg=>{if(reset)bg.__adEvents={responses:[],blocked:[]};done(bg.__adEvents);});`, reset);
    },
    async mock(mode: 'success' | 'offline' | 'malformed') {
      await driver.switchTo().window(optionsHandle);
      // Firefox MV3 uses an event page; getBackgroundPage exposes its actual
      // global to extension pages. eval is disabled by production CSP, so use
      // a function assigned directly instead (the closure belongs to this page).
      const result = await driver.executeAsyncScript(`const done=arguments[arguments.length-1]; browser.runtime.getBackgroundPage().then(bg=>{
        bg.__originalFetch ??= bg.fetch.bind(bg); bg.__inferenceCalls=0; bg.__evaluatedCandidates=[];
        bg.fetch=async (input,init)=>{
          if(String(input)!=='https://api.typesafe.ai/v1/systemone')return bg.__originalFetch(input,init);
          bg.__inferenceCalls++;
          if(arguments[0]==='offline')throw new Error('offline');
          if(arguments[0]==='malformed')return new bg.Response('{}');
          const body=JSON.parse(init.body), answers={};
          bg.__evaluatedCandidates.push(...body.state.candidates);
          body.state.candidates.forEach((c,i)=>{const ad=/commercial-loader|banner\\.svg|standalone-unit/.test(c.url)||c.type==='popup'||c.type==='overlay'&&(/sponsor-layer/.test(c.marker)||c.evidence?.interceptsPlayback);answers['ad_'+i]={type:'noul',noul:ad?.99:.01};answers['essential_'+i]={type:'noul',noul:ad?.01:.99};});
          return new bg.Response(JSON.stringify({model:'jev-test-fixture',answers}));
        };done(null);
      }).catch(e=>done(String(e)));`, mode);
      if (result) throw new Error(String(result));
    },
    async evaluations(): Promise<any[]> {
      await driver.switchTo().window(optionsHandle);
      return driver.executeAsyncScript(`const done=arguments[arguments.length-1];browser.runtime.getBackgroundPage().then(bg=>done(bg.__evaluatedCandidates??[]));`);
    },
    async rpc(type: string, args: Record<string, unknown> = {}) {
      await driver.switchTo().window(optionsHandle);
      const result: any = await driver.executeAsyncScript(`const done=arguments[arguments.length-1]; browser.runtime.sendMessage(arguments[0]).then(value=>done({value})).catch(e=>done({error:String(e)}));`, { type, ...args });
      if (result.error) throw new Error(result.error); return result.value;
    },
    async open(url: string) { await driver.switchTo().window(pageHandle); await driver.get(url); },
    async appReady() { await driver.switchTo().window(pageHandle); return driver.executeScript('return document.querySelector("#app-status")?.textContent'); },
    async screenshot(path: string) { await driver.switchTo().window(optionsHandle); await writeFile(path, await driver.takeScreenshot(), 'base64'); },
    async refreshOptions() { /* Keep the mock's extension-page closure alive. */ },
    async restart() { await shutdown(); await launch(); },
    async close() { try { await shutdown(); } finally { await rm(profile, { recursive: true, force: true }); } },
  };
}
