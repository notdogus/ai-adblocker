import { browser } from 'wxt/browser';
import { httpUrl } from '../lib/privacy';
import type { CandidateType, ResourceType } from '../lib/types';
import { PLAYER_CONFIG, PLAYER_OBSERVATION, PLAYER_READY, validOverlaySelector, youtubeHost } from '../lib/player-policy';
import { adLabel, isSeparateOverlay, mediaSurfaces, overlayCandidates, overlaySelector } from '../lib/player-dom';
import { playerEvidence } from '../lib/privacy';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'], allFrames: true, matchAboutBlank: true, matchOriginAsFallback: true, runAt: 'document_start',
  main(ctx) {
    let enabled = false; let aiEnabled = false;
    let style: HTMLStyleElement | undefined;
    let learned: { url: string; type: CandidateType; selector?: string }[] = [];
    let revision = 0;
    const reported = new Set<string>();
    const hidden = new Map<HTMLElement, { value: string; priority: string; overlay: boolean }>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const behaviorReported = new Set<string>();
    const skipped = new WeakMap<Element, number>();
    const blockedShields = new Set<HTMLElement>();
    let lastTarget: { element: Element; at: number } | undefined;
    const rememberTarget = (event: Event) => {
      if (event.isTrusted && event.target instanceof Element) lastTarget = { element: event.target, at: performance.now() };
    };
    window.addEventListener('pointerdown', rememberTarget, true);
    window.addEventListener('click', rememberTarget, true);
    function configurePlayer() {
      window.dispatchEvent(new CustomEvent(PLAYER_CONFIG, { detail: JSON.stringify({ enabled, callers: learned.filter(r => r.type === 'popup').map(r => r.url) }) }));
    }
    function reportBehavior(event: Event) {
      if (!enabled) return;
      try {
        const raw = (event as CustomEvent).detail;
        if (typeof raw !== 'string' || raw.length > 6000) return;
        const data = JSON.parse(raw);
        const evidence = playerEvidence(data.evidence);
        if (evidence?.kind !== 'popup' || !(evidence.playerGesture || evidence.unrequestedBlank) || !evidence.unrelatedDestination) return;
        const candidates: unknown[] = [];
        const target = lastTarget && performance.now() - lastTarget.at < 1200 ? lastTarget.element : undefined;
        // A proven, empty click shield is not a play control or poster. Disarm it
        // locally even without a key, so a blocked popup cannot leave playback trapped.
        if (target && target.childNodes.length === 0 && isSeparateOverlay(target) && !target.matches('a,img,iframe')) {
          const selector = overlaySelector(target);
          if (blockedShields.size < 60) { blockedShields.add(target); hide(target, true); }
          if (selector) candidates.push({ url: `${new URL(document.baseURI).origin}/`, type: 'overlay', selector, tag: target.tagName.toLowerCase(),
            marker: `${target.id} ${target.className}`.slice(0, 180), evidence: { kind: 'overlay', overlaysPlayer: true, interceptsPlayback: true, containsMedia: false, containsControls: false } });
        }
        if (!aiEnabled || behaviorReported.size >= 60) return;
        const source = httpUrl(data.source);
        if (!source) {
          if (candidates.length) void browser.runtime.sendMessage({ type: 'candidates', candidates }).catch(() => {});
          return;
        }
        const script = [...document.scripts].find(s => s.src === source.href);
        if (script && !behaviorReported.has(source.href)) {
          behaviorReported.add(source.href);
          const marker = `${script.id} ${script.className}`.slice(0, 180);
          const item = { url: source.href, tag: 'script', marker, label: adLabel(script), evidence };
          // Separate judgments: only the whole-resource judgment can block a bundle.
          candidates.push({ ...item, type: 'popup' }, { ...item, type: 'script' });
        }
        if (candidates.length) void browser.runtime.sendMessage({ type: 'candidates', candidates }).catch(() => {});
      } catch { /* Ignore malformed or forged bridge data. */ }
    }
    window.addEventListener(PLAYER_OBSERVATION, reportBehavior);
    window.addEventListener(PLAYER_READY, configurePlayer);
    function hide(element: HTMLElement, overlay = false) {
      if (!hidden.has(element)) hidden.set(element, { value: element.style.getPropertyValue('display'), priority: element.style.getPropertyPriority('display'), overlay });
      if (element.style.getPropertyValue('display') !== 'none' || element.style.getPropertyPriority('display') !== 'important') element.style.setProperty('display', 'none', 'important');
    }
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
      const surfaces = mediaSurfaces();
      const frameOrigin = location.origin === 'null' ? new URL(document.baseURI).origin : location.origin;
      for (const element of blockedShields) if (!element.isConnected || element.childNodes.length) blockedShields.delete(element);
      // A recycled ad container must never keep a newly inserted real player hidden.
      for (const [element, previous] of hidden) {
        if (!element.isConnected) { hidden.delete(element); continue; }
        const staleOverlay = previous.overlay && (!blockedShields.has(element) && !learned.some(r => r.type === 'overlay' && r.url === `${frameOrigin}/` && validOverlaySelector(r.selector) && element.matches(r.selector)) || (!element.matches('a[href]') && !['absolute', 'fixed'].includes(getComputedStyle(element).position)));
        if (staleOverlay || element.querySelector('video,audio,iframe,input,[role="slider"],.vjs-control-bar,.jw-controls,.plyr__controls,.ytp-chrome-bottom')) {
          if (previous.value) element.style.setProperty('display', previous.value, previous.priority); else element.style.removeProperty('display');
          hidden.delete(element);
        }
      }
      for (const element of blockedShields) {
        if (!element.isConnected || element.childNodes.length) { blockedShields.delete(element); continue; }
        if (isSeparateOverlay(element, surfaces)) hide(element, true);
      }
      for (const rule of learned) {
        if (rule.type !== 'overlay' || rule.url !== `${frameOrigin}/` || !validOverlaySelector(rule.selector)) continue;
        for (const element of document.querySelectorAll(rule.selector)) if (isSeparateOverlay(element, surfaces)) hide(element, true);
      }
      for (const element of overlayCandidates(surfaces)) {
        const selector = overlaySelector(element);
        if (!selector || !aiEnabled || candidates.length >= 24) continue;
        const marker = `${element.getAttributeNames().filter(n => /^data-(ad|cl-overlay)/.test(n)).join(' ')} ${element.id} ${element.className}`.slice(0, 180);
        const key = `overlay:${frameOrigin}:${selector}:${marker}`;
        if (reported.has(key) || reported.size >= 240) continue;
        reported.add(key);
        const link = element.matches('a[href]') ? element as HTMLAnchorElement : element.querySelector<HTMLAnchorElement>('a[href]');
        candidates.push({ url: `${frameOrigin}/`, type: 'overlay', selector, tag: element.tagName.toLowerCase(), marker, label: adLabel(element),
          evidence: { kind: 'overlay', overlaysPlayer: true, externalLink: Boolean(link && httpUrl(link.href)?.origin !== frameOrigin), containsMedia: false, containsControls: Boolean(element.querySelector('button,[role="button"],[role="slider"]')) } });
      }
      if (youtubeHost(location.hostname)) {
        const player = document.querySelector('#movie_player.ad-showing');
        const skip = player?.querySelector<HTMLElement>('.ytp-skip-ad-button,.ytp-ad-skip-button,.ytp-ad-skip-button-modern');
        if (skip && (Date.now() - (skipped.get(skip) ?? 0) > 1000) && skip.getBoundingClientRect().width > 0 && getComputedStyle(skip).visibility !== 'hidden' && !skip.hasAttribute('disabled')) {
          skipped.set(skip, Date.now()); skip.click();
        }
      }
      for (const element of document.querySelectorAll('script[src],img,iframe[src],video[src],audio[src],source[src]')) {
        const item = resource(element); if (!item) continue;
        if (learned.some(rule => rule.url === item.url && rule.type === item.type) && element instanceof HTMLElement && element.tagName !== 'SCRIPT') {
          hide(element);
        }
        const key = `${item.type}:${item.url}`;
        if (!aiEnabled || reported.has(key) || reported.size >= 200 || candidates.length >= 60) continue;
        reported.add(key);
        // Deliberately never read textContent, ancestor text, forms or chat messages.
        // Only explicit advertising labels are eligible as short textual evidence.
        const label = adLabel(element);
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
        enabled = result.enabled; aiEnabled = result.aiEnabled; learned = result.rules;
        configurePlayer();
        restore(); style?.remove();
        if (!enabled) blockedShields.clear();
        if (enabled && result.selectors.length) {
          style = document.createElement('style');
          style.dataset.aiAdblocker = 'cosmetic';
          style.textContent = result.selectors.map((selector: string) => `${selector}{display:none!important}`).join('\n');
          (document.head ?? document.documentElement)?.append(style);
        }
        if (!aiEnabled) { reported.clear(); behaviorReported.clear(); }
        scan();
      } catch { /* Extension reload: leave page functional. */ }
    }
    const observer = new MutationObserver(records => {
      if (!enabled || timer || records.every(r => r.target === style)) return;
      timer = setTimeout(() => { timer = undefined; scan(); }, 250);
    });
    observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset', 'class', 'id', 'style', 'aria-label', 'title', 'data-ad', 'data-ad-slot', 'data-cl-overlay'] });
    browser.runtime.onMessage.addListener(message => { if (message?.type === 'refresh') void refresh(); });
    document.addEventListener('DOMContentLoaded', () => void refresh(), { once: true });
    ctx.onInvalidated(() => { enabled = false; configurePlayer(); window.removeEventListener('pointerdown', rememberTarget, true); window.removeEventListener('click', rememberTarget, true); window.removeEventListener(PLAYER_OBSERVATION, reportBehavior); window.removeEventListener(PLAYER_READY, configurePlayer); observer.disconnect(); style?.remove(); restore(); if (timer) clearTimeout(timer); });
    void refresh();
  },
});
