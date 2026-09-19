import { disableConfiguredAds, hasAdvertisingConfiguration } from '../lib/player';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'], allFrames: true, runAt: 'document_start', world: 'MAIN',
  main() {
    const STATE_EVENT = 'ai-adblocker-player-state';
    const configName = 'player__config';
    const page = window as typeof window & { player__config?: unknown; __aiAdblockerPlayerAdsDisabled?: boolean };
    let protectionEnabled = false;
    let currentConfig: unknown = page[configName];
    const startAttempts = new WeakSet<HTMLVideoElement>();

    function apply(config: unknown) {
      if (!protectionEnabled || !hasAdvertisingConfiguration(config)) return;
      disableConfiguredAds(config);
      page.__aiAdblockerPlayerAdsDisabled = true;
    }

    // Ani-Stream exposes this object before loading its player bundle. Keeping
    // the setter in the page's MAIN world removes the cause of a pre-roll before
    // the player can request it. The isolated content script only enables the
    // setter after checking the website exclusion state.
    try {
      Object.defineProperty(page, configName, {
        configurable: true,
        enumerable: true,
        get: () => currentConfig,
        set: (value: unknown) => { currentConfig = value; apply(value); },
      });
    } catch { /* A site may define a non-configurable property; leave it alone. */ }

    function startContentStream() {
      if (!page.__aiAdblockerPlayerAdsDisabled) return;
      for (const video of document.querySelectorAll('video')) {
        if ((video.autoplay || video.paused) && !startAttempts.has(video)) {
          startAttempts.add(video);
          // First try the site's normal playback mode. If browser autoplay policy
          // rejects it, muted playback is the only portable direct-start fallback.
          void video.play().catch(async () => {
            const wasMuted = video.muted;
            video.muted = true;
            try { await video.play(); } catch { video.muted = wasMuted; }
          });
        }
      }
    }

    window.addEventListener('message', (event: MessageEvent<{ type?: unknown; enabled?: unknown }>) => {
      if (event.source !== window || event.data?.type !== STATE_EVENT) return;
      protectionEnabled = event.data.enabled === true;
      if (protectionEnabled) {
        apply(currentConfig);
        startContentStream();
      }
    });

    document.addEventListener('DOMContentLoaded', startContentStream, { once: true });
    // Player bundles can create their video shortly after the document event.
    // Bounded retries cover that startup window without observing the whole DOM.
    for (const delay of [100, 500, 1500]) setTimeout(() => { apply(currentConfig); startContentStream(); }, delay);
  },
});
