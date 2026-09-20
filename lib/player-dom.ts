import { validOverlaySelector } from './player-policy';

export const PLAYER_ROOT = '.video-js,.jwplayer,.plyr,#movie_player,[data-player],#player,#video-player,.video-player';
const CONTROLS = 'video,audio,source,track,button,input,select,textarea,[role="button"],[role="slider"],[role="alert"],.vjs-control,.vjs-control-bar,.jw-controls,.plyr__controls,.ytp-chrome-bottom,.ytp-chrome-top,.vjs-text-track-display,.jw-captions,.ytp-caption-window-container,.vjs-poster,.jw-preview,.jw-display,.plyr__poster,.vjs-error-display,.jw-error-msg';
export function mediaSurfaces(): Element[] {
  return [...document.querySelectorAll('video,iframe')].filter(el => {
    const rect = el.getBoundingClientRect();
    return rect.width >= 240 && rect.height >= 120 && (el.tagName === 'VIDEO' || Boolean(el.closest(PLAYER_ROOT)) || /embed|\/e\/|player|video/i.test(el.getAttribute('src') ?? ''));
  }).slice(0, 12);
}
export function overlaps(a: DOMRect, b: DOMRect): boolean {
  const area = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return area > 0 && area / Math.min(a.width * a.height, b.width * b.height) > .2;
}
export function isSeparateOverlay(element: Element, surfaces = mediaSurfaces()): element is HTMLElement {
  if (!(element instanceof HTMLElement) || element.matches(`html,body,${CONTROLS}`) || element.closest(CONTROLS) || element.querySelector('video,audio,iframe,source,track,input,select,textarea,.vjs-control-bar,.jw-controls,.plyr__controls,.ytp-chrome-bottom')) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width < 12 || rect.height < 12 || !surfaces.some(s => s !== element && !element.contains(s) && overlaps(rect, s.getBoundingClientRect()))) return false;
  const style = getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && (['absolute', 'fixed'].includes(style.position) || element.matches('a[href]'));
}
export function overlaySelector(element: Element, allowParent = true): string | undefined {
  const tag = element.tagName.toLowerCase();
  for (const attr of ['data-ad', 'data-ad-slot', 'data-cl-overlay']) if (element.hasAttribute(attr)) return `${tag}[${attr}]`;
  if (element.id && validOverlaySelector(`${tag}#${element.id}`)) return `${tag}#${element.id}`;
  const classes = [...element.classList].filter(c => /^[a-zA-Z_][\w-]{0,55}$/.test(c) && !/\d{5}/.test(c)).slice(0, 3);
  const selector = `${tag}${classes.map(c => `.${c}`).join('')}`;
  if (validOverlaySelector(selector)) return selector;
  const parent = element.parentElement;
  if (!allowParent || !parent) return;
  const anchor = parent === document.body ? 'body' : overlaySelector(parent, false);
  const index = [...parent.children].filter(e => e.tagName === element.tagName).indexOf(element) + 1;
  const path = `${anchor} > ${tag}:nth-of-type(${index})`;
  return anchor && validOverlaySelector(path) ? path : undefined;
}
export function overlayCandidates(surfaces: Element[]): Element[] {
  const candidates = new Set<Element>();
  for (const surface of surfaces) {
    const root = surface.closest(PLAYER_ROOT) ?? surface.parentElement;
    for (const el of [...(root?.querySelectorAll('[id],[class],a[href]') ?? [])].slice(0, 160)) candidates.add(el);
    const r = surface.getBoundingClientRect();
    for (const [x,y] of [[.5,.5],[.2,.2],[.8,.2],[.2,.8],[.8,.8]] as const) {
      for (const el of document.elementsFromPoint(r.left + r.width * x, r.top + r.height * y).slice(0, 8)) candidates.add(el);
    }
  }
  return [...candidates].slice(0, 240).filter(el => isSeparateOverlay(el, surfaces));
}
export function adLabel(element: Element): string {
  return [element.getAttribute('aria-label'), element.getAttribute('title'), element.getAttribute('alt')]
    .filter((v): v is string => Boolean(v && /\b(advertisement|sponsored|werbung|anzeige|advertising)\b/i.test(v))).join(' ').slice(0, 180);
}
