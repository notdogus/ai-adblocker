import { describe, expect, it } from 'vitest';
import { disableConfiguredAds, hasAdvertisingConfiguration } from '../../lib/player';

describe('player ad configuration', () => {
  it('disables explicit pre-roll configuration without touching stream sources', () => {
    const config: any = {
      ads: { enabled: true, displayFrame: true, fallback: 'waterfall', waterfall: ['vast'], fad: { enabled: 1 } },
      playlist: [{ sources: [{ src: 'https://stream.example/episode.m3u8' }] }],
    };
    expect(hasAdvertisingConfiguration(config)).toBe(true);
    expect(disableConfiguredAds(config)).toBe(true);
    expect(config.ads).toMatchObject({ enabled: false, displayFrame: false, fallback: '', waterfall: [], fad: { enabled: 0 } });
    expect(config.playlist[0].sources[0].src).toBe('https://stream.example/episode.m3u8');
  });

  it('leaves players without an explicit ad object unchanged', () => {
    const config = { playlist: [{ sources: [{ src: 'https://stream.example/episode.mp4' }] }] };
    expect(hasAdvertisingConfiguration(config)).toBe(false);
    expect(disableConfiguredAds(config)).toBe(false);
    expect(config).toEqual({ playlist: [{ sources: [{ src: 'https://stream.example/episode.mp4' }] }] });
  });
});
