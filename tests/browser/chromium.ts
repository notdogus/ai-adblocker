import { chromium, type BrowserContext, type Page, type Worker } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { mockTransport } from './fixture';

export async function chromiumDriver() {
  const profile = await mkdtemp(join(tmpdir(), 'ai-adblocker-chromium-'));
  const extension = resolve('.output/chrome-mv3');
  let context: BrowserContext; let options: Page; let page: Page; let worker: Worker;
  const errors: string[] = [];
  async function launch() {
    context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
    context.setDefaultTimeout(15000);
    context.on('weberror', error => errors.push(error.error().message));
    worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 15000 });
    const id = worker.url().split('/')[2];
    options = await context.newPage(); await options.goto(`chrome-extension://${id}/options.html`);
    try { await options.waitForSelector('input[name=model]'); }
    catch (error) {
      console.error('Options startup:', await options.locator('body').innerText());
      console.error('Background status:', await worker.evaluate(async () => {
        const api = (globalThis as any).chrome;
        return { rules: (await api.declarativeNetRequest.getDynamicRules()).length, state: (await api.storage.local.get('state')).state?.status };
      }));
      await context.close(); throw error;
    }
    page = await context.newPage();
  }
  await launch();
  return {
    name: 'Chromium', errors,
    get page() { return page; }, get context() { return context; }, get optionsPage() { return options; }, get worker() { return worker; },
    async mock(mode: 'success' | 'offline' | 'malformed') { await worker.evaluate(mockTransport, mode); },
    async evaluations(): Promise<any[]> { return worker.evaluate(() => (globalThis as any).__evaluatedCandidates ?? []); },
    async rpc(type: string, args: Record<string, unknown> = {}) { return options.evaluate(({ type, args }) => (globalThis as any).chrome.runtime.sendMessage({ type, ...args }), { type, args }); },
    async open(url: string) { await page.goto(url, { waitUntil: 'load' }); },
    async appReady() { return page.locator('#app-status').textContent(); },
    async screenshot(path: string) { await options.screenshot({ path, fullPage: true }); },
    async refreshOptions() { await options.reload(); await options.waitForSelector('input[name=model]'); },
    async restart() { await context.close(); await launch(); },
    async close() { await context.close(); await rm(profile, { recursive: true, force: true }); },
  };
}
