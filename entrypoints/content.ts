import { browser } from 'wxt/browser';
import { httpUrl } from '../lib/privacy';
import type { ResourceType } from '../lib/types';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'], allFrames: true, runAt: 'document_start',
  main(ctx) {
    let enabled = false; let aiEnabled = false;
    let style: HTMLStyleElement | undefined;
    let learned: { url: string; type: ResourceType }[] = [];
    let revision = 0;
    const reported = new Set<string>();
    const hidden = new Map<HTMLElement, { value: string; priority: string }>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    function resource(el: Element): { url: string; type: ResourceType } | undefined {
      const tag = el.tagName.toLowerCase();
      const attr = el instanceof HTMLImageElement ? el.currentSrc || el.src : el.getAttribute('src');
      if (!attr) return;
      let resolved: string;
      try { resolved = new URL(attr, document.baseURI).href; } catch { return; }
      const url = httpUrl(resolved);
      if (!url) return;
      url.hash = '';
      const type = ({ script: 'script', img: 'image', iframe: 'sub_frame', video: 'media', audio: 'media', source: 'media' } as const)[tag as 'script'];
      if (!type) return;
      return { url: url.href, type };
    }
    function restore() {
      for (const [element, previous] of hidden) {
        if (element.style.getPropertyValue('display') === 'none' && element.style.getPropertyPriority('display') === 'important') {
          if (previous.value) element.style.setProperty('display', previous.value, previous.priority); else element.style.removeProperty('display');
        }
      }
      hidden.clear();
    }
    function scan() {
      if (!enabled || ctx.isInvalid) return;
      const candidates: unknown[] = [];
      for (const element of document.querySelectorAll('script[src],img,iframe[src],video[src],audio[src],source[src]')) {
        const item = resource(element); if (!item) continue;
        if (learned.some(rule => rule.url === item.url && rule.type === item.type) && element instanceof HTMLElement && element.tagName !== 'SCRIPT') {
          if (!hidden.has(element)) hidden.set(element, { value: element.style.getPropertyValue('display'), priority: element.style.getPropertyPriority('display') });
          element.style.setProperty('display', 'none', 'important');
        }
        const key = `${item.type}:${item.url}`;
        if (!aiEnabled || reported.has(key) || reported.size >= 200 || candidates.length >= 60) continue;
        reported.add(key);
        // Deliberately never read textContent, ancestor text, forms or chat messages.
        // Only explicit advertising labels are eligible as short textual evidence.
        const label = [element.getAttribute('aria-label'), element.getAttribute('title'), element.getAttribute('alt')]
          .filter((v): v is string => Boolean(v && /\b(advertisement|sponsored|werbung|anzeige|advertising)\b/i.test(v))).join(' ').slice(0, 180);
        const marker = `${element.id} ${element.getAttribute('class') ?? ''}`.slice(0, 180);
        candidates.push({ ...item, tag: element.tagName.toLowerCase(), marker, label });
      }
      if (candidates.length) void browser.runtime.sendMessage({ type: 'candidates', candidates }).catch(() => {});
    }
    async function refresh() {
      const current = ++revision;
      try {
        const result = await browser.runtime.sendMessage({ type: 'context' });
        if (current !== revision || ctx.isInvalid) return;
        // postMessage crosses Chrome/Firefox's isolated-to-main-world boundary
        // reliably; custom-event objects do not on every browser version.
        window.postMessage({ type: 'ai-adblocker-player-state', enabled: result.enabled === true }, '*');
        enabled = result.enabled; aiEnabled = result.aiEnabled; learned = result.rules;
        restore(); style?.remove();
        if (enabled && result.selectors.length) {
          style = document.createElement('style');
          style.dataset.aiAdblocker = 'cosmetic';
          style.textContent = result.selectors.map((selector: string) => `${selector}{display:none!important}`).join('\n');
          (document.head ?? document.documentElement)?.append(style);
        }
        if (!aiEnabled) reported.clear();
        scan();
      } catch { /* Extension reload: leave page functional. */ }
    }
    const observer = new MutationObserver(records => {
      if (!enabled || timer || records.every(r => r.target === style)) return;
      timer = setTimeout(() => { timer = undefined; scan(); }, 250);
    });
    observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset'] });
    browser.runtime.onMessage.addListener(message => { if (message?.type === 'refresh') void refresh(); });
    document.addEventListener('DOMContentLoaded', () => void refresh(), { once: true });
    ctx.onInvalidated(() => { observer.disconnect(); style?.remove(); restore(); if (timer) clearTimeout(timer); });
    void refresh();
  },
});
