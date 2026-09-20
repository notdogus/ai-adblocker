import { PLAYER_CONFIG, PLAYER_OBSERVATION, PLAYER_READY, preventPopup, scriptFromStack, youtubeHost, prunePlayerAds } from '../lib/player-policy';
import { PLAYER_ROOT, mediaSurfaces } from '../lib/player-dom';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'], allFrames: true, matchAboutBlank: true,
  matchOriginAsFallback: true, runAt: 'document_start', world: 'MAIN',
  main() {
    // Page-world code has no extension privileges or credentials. Its bridge is
    // untrusted evidence only; the isolated script validates it before forwarding.
    let enabled = false;
    let callers = new Set<string>();
    let gesture: { until: number; player: boolean; href?: string; target?: Element; explicitAction: boolean } | undefined;
    const nativeOpen = window.open;
    const nativeParse = JSON.parse;
    const dispatch = window.dispatchEvent.bind(window);
    const add = window.addEventListener.bind(window);
    const now = performance.now.bind(performance);
    const observed = new Set<string>();
    const initialResponses = new Set<object>();
    let observations = 0;
    function emit(value: unknown) {
      if (observations++ < 80) dispatch(new CustomEvent(PLAYER_OBSERVATION, { detail: JSON.stringify(value) }));
    }
    function normalize(value: string): string | undefined {
      try { const url = new URL(value, location.href); url.hash = ''; return url.href; } catch { return; }
    }
    const reusesContext = (target?: string) => typeof target === 'string' && ['_self', '_parent', '_top'].includes(target.toLowerCase());
    add(PLAYER_CONFIG, event => {
      try {
        const data = nativeParse((event as CustomEvent).detail);
        if (typeof data.enabled !== 'boolean' || !Array.isArray(data.callers)) return;
        enabled = data.enabled;
        callers = new Set(data.callers.filter((s: unknown) => typeof s === 'string').slice(0, 2000));
        if (enabled) for (const response of initialResponses) { try { prunePlayerAds(response); } catch { /* frozen page objects */ } }
      } catch { /* Invalid page-world data never gains privileges. */ }
    });
    function capture(event: Event) {
      if (!event.isTrusted) return;
      if (event instanceof KeyboardEvent && !['Enter', ' ', 'Spacebar'].includes(event.key)) { gesture = undefined; return; }
      const path = event.composedPath();
      const target = path.find(el => el instanceof Element) as Element | undefined;
      if (!target) { gesture = undefined; return; }
      const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
      const surfaces = mediaSurfaces();
      const root = target.closest(PLAYER_ROOT);
      const point = event instanceof MouseEvent ? { x: event.clientX, y: event.clientY } : undefined;
      const onPlayer = target.matches('video') || Boolean(root?.querySelector('video,iframe')) || surfaces.some(surface => {
        const r = surface.getBoundingClientRect();
        return point && point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom;
      });
      const control = target.closest('button,[role="button"]');
      const actionLabel = `${control?.getAttribute('aria-label') ?? ''} ${control?.getAttribute('title') ?? ''}`;
      const explicitAction = /\b(share|teilen|sign in|log in|login|anmelden|cast|chromecast|picture.in.picture)\b/i.test(actionLabel);
      gesture = { until: now() + (explicitAction ? 5000 : 1200), player: onPlayer, href: anchor ? normalize(anchor.href) : undefined, target, explicitAction };
    }
    for (const type of ['pointerdown', 'mousedown', 'touchstart', 'click', 'keydown']) add(type, capture, true);

    function attempt(destination: string, target?: Element): boolean {
      if (!enabled) return false;
      const current = gesture && now() <= gesture.until ? gesture : undefined;
      const resolved = normalize(destination);
      const explicitDestination = Boolean(current?.explicitAction || current?.href && resolved === current.href && (!target || target === current.target || target.contains(current.target!)));
      // Read stacks only at the popup boundary, never on every script execution.
      const scripts = [...document.scripts].map(s => s.src).filter(Boolean).slice(0, 300);
      const source = scriptFromStack(new Error().stack ?? '', scripts);
      const blank = !destination || destination === 'about:blank';
      // Ad libraries pre-open an empty window before constructing the player,
      // then navigate/resize it after a click. No recent trusted interaction can
      // authorize that preallocation. Do not rely on spoofable activation flags.
      const unrequestedBlank = blank && !current;
      const prevent = preventPopup({ enabled, playerGesture: current?.player ?? false, explicitDestination, learnedCaller: Boolean(source && callers.has(source)), unrequestedBlank });
      if (!explicitDestination && (source || prevent)) {
        const key = `${source}:${Boolean(current?.player)}:${!destination || destination === 'about:blank'}`;
        if (!source || !observed.has(key)) {
          observed.add(key);
          emit({ source, evidence: { kind: 'popup', playerGesture: current?.player ?? false, blank, unrequestedBlank, unrelatedDestination: Boolean((current?.player || unrequestedBlank) && !explicitDestination) } });
        }
      }
      return prevent;
    }
    window.open = function (url?: string | URL, target?: string, features?: string) {
      // A blank window can later navigate/resize. Stop its creation, not its size.
      if (!reusesContext(target) && attempt(url === undefined ? '' : String(url))) return null;
      return Reflect.apply(nativeOpen, this, [url, target, features]);
    };
    // Popunder libraries borrow a clean about:blank realm's open() immediately
    // after inserting it, before that frame's document_start script can run.
    // Wrap it synchronously when the library obtains the window/document.
    const guardedRealms = new WeakSet<Window>();
    function guardRealm(realm: Window | null) {
      if (!realm || realm === window || guardedRealms.has(realm)) return;
      try {
        void realm.document; // Cross-origin windows are protected in their own frame.
        const open = realm.open;
        realm.open = function (url?: string | URL, target?: string, features?: string) {
          if (!reusesContext(target) && attempt(url === undefined ? '' : String(url))) return null;
          return Reflect.apply(open, this, [url, target, features]);
        };
        guardedRealms.add(realm);
      } catch { /* Same-origin policy: never proxy or replace the Window itself. */ }
    }
    for (const property of ['contentWindow', 'contentDocument'] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, property);
      if (!descriptor?.get || !descriptor.configurable) continue;
      const get = descriptor.get;
      Object.defineProperty(HTMLIFrameElement.prototype, property, { ...descriptor, get(this: HTMLIFrameElement) {
        const value = Reflect.apply(get, this, []);
        guardRealm(property === 'contentWindow' ? value : value?.defaultView);
        return value;
      } });
    }
    // Synthetic anchor clicks are a common window.open bypass. Do not consume
    // the user's actual play event: playback listeners must still receive it.
    const nativeClick = HTMLElement.prototype.click;
    HTMLElement.prototype.click = function () {
      if (this instanceof HTMLAnchorElement && this.target && !['_self', '_parent', '_top'].includes(this.target.toLowerCase()) && attempt(this.href, this)) return;
      return Reflect.apply(nativeClick, this, []);
    };
    add('click', event => {
      if (event.isTrusted || !enabled) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') as HTMLAnchorElement | null : null;
      if (anchor?.target && !['_self', '_parent', '_top'].includes(anchor.target.toLowerCase()) && attempt(anchor.href, anchor)) event.preventDefault();
    }, true);

    if (youtubeHost(location.hostname)) {
      // These hooks operate on separate, explicitly named ad slots. They never
      // block googlevideo, replace a stream URL, or seek through real content.
      const clean = <T>(value: T): T => { if (enabled) { try { prunePlayerAds(value); } catch { /* frozen/foreign object */ } } return value; };
      const remember = (value: unknown) => {
        if (value && typeof value === 'object') {
          if (initialResponses.size >= 4) initialResponses.clear();
          initialResponses.add(value); clean(value);
        }
        return value;
      };
      const key = 'ytInitialPlayerResponse';
      const descriptor = Object.getOwnPropertyDescriptor(window, key);
      if (!descriptor || descriptor.configurable && 'value' in descriptor) {
        let value = remember(descriptor?.value);
        Object.defineProperty(window, key, { configurable: true, enumerable: true, get: () => value, set: next => { value = remember(next); } });
      }
      JSON.parse = function (text: string, reviver?: (this: any, key: string, value: any) => any) {
        return clean(nativeParse(text, reviver));
      };
      const nativeJson = Response.prototype.json;
      Response.prototype.json = async function () { return clean(await Reflect.apply(nativeJson, this, [])); };
      const nativeText = Response.prototype.text;
      function playerEndpoint(value: string): boolean {
        try { const url = new URL(value, location.href); return youtubeHost(url.hostname) && /^\/youtubei\/v1\/player\/?$/.test(url.pathname); } catch { return false; }
      }
      function cleanText(value: string): string {
        if (!enabled || !/"(?:playerAds|adPlacements|adSlots)"/.test(value)) return value;
        try { const parsed = nativeParse(value); return prunePlayerAds(parsed) ? JSON.stringify(parsed) : value; } catch { return value; }
      }
      Response.prototype.text = async function () { const text = await Reflect.apply(nativeText, this, []); return playerEndpoint(this.url) ? cleanText(text) : text; };
      for (const property of ['response', 'responseText'] as const) {
        const descriptor = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, property);
        if (!descriptor?.get || !descriptor.configurable) continue;
        const get = descriptor.get;
        Object.defineProperty(XMLHttpRequest.prototype, property, { ...descriptor, get(this: XMLHttpRequest) {
          const value = Reflect.apply(get, this, []);
          if (!enabled || !playerEndpoint(this.responseURL)) return value;
          return typeof value === 'string' ? cleanText(value) : clean(value);
        } });
      }
    }
    dispatch(new CustomEvent(PLAYER_READY));
  },
});
