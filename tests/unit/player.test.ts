import { describe, it, expect } from 'vitest';
import { preventPopup, prunePlayerAds, scriptFromStack, validOverlaySelector, youtubeHost } from '../../lib/player-policy';
import { sanitizeCandidate } from '../../lib/privacy';
import { initialState, fingerprint } from '../../lib/types';
import { blocked, shouldLearn } from '../../lib/policy';
import { compileRules } from '../../lib/rules';

describe('player popup boundary', () => {
  it('blocks unexpected windows during play, including a previously unknown caller', () => {
    expect(preventPopup({ enabled: true, playerGesture: true, explicitDestination: false, learnedCaller: false })).toBe(true);
    expect(preventPopup({ enabled: true, playerGesture: false, explicitDestination: false, learnedCaller: true })).toBe(true);
    expect(preventPopup({ enabled: true, playerGesture: false, explicitDestination: false, learnedCaller: false, unrequestedBlank: true })).toBe(true);
  });
  it('preserves explicit navigation, unrelated functionality and site bypass', () => {
    expect(preventPopup({ enabled: true, playerGesture: true, explicitDestination: true, learnedCaller: true })).toBe(false);
    expect(preventPopup({ enabled: true, playerGesture: false, explicitDestination: false, learnedCaller: false })).toBe(false);
    expect(preventPopup({ enabled: false, playerGesture: true, explicitDestination: false, learnedCaller: true })).toBe(false);
  });
  it('attributes only an observed script, supporting both browser stack formats', () => {
    const sources = ['https://cdn.example/bundle.js?q=1', 'https://site.example/player.js'];
    expect(scriptFromStack('Error\n at open (chrome-extension://id/hook.js:1:2)\n at click (https://cdn.example/bundle.js?q=1:3:4)\n at https://site.example/player.js:2:3', sources)).toBe(sources[0]);
    expect(scriptFromStack('open@moz-extension://id/hook.js:1:2\nclick@https://cdn.example/bundle.js?q=1:3:4', sources)).toBe(sources[0]);
    expect(scriptFromStack('Error\n at https://unobserved.example/source.js:1:2', sources)).toBeUndefined();
  });
});
describe('bounded player response adapter', () => {
  it('removes separate ad slots without altering content, captions or arbitrary nested keys', () => {
    const data = { videoDetails: { videoId: 'abc' }, streamingData: { adaptiveFormats: [{ url: 'https://media.example/main?token=private' }] }, captions: { playerAds: ['not an ad slot'] }, playerAds: [{}], adPlacements: [{}], adSlots: [{}] };
    const streams = data.streamingData;
    expect(prunePlayerAds(data)).toBe(true);
    expect(data).not.toHaveProperty('adSlots');
    expect(data.streamingData).toBe(streams);
    expect(data.captions.playerAds).toEqual(['not an ad slot']);
    expect(prunePlayerAds(data)).toBe(false);
  });
  it('leaves unrecognized data and malformed slot values alone', () => {
    const data = { adSlots: [1], account: { playerAds: [2] } };
    expect(prunePlayerAds(data)).toBe(false);
    expect(data.adSlots).toEqual([1]);
    expect(prunePlayerAds({ videoDetails: {}, playabilityStatus: {}, adSlots: 'content' })).toBe(false);
    expect(prunePlayerAds(null)).toBe(false);
    expect(prunePlayerAds({ playerResponse: { videoDetails: {}, playabilityStatus: {}, adSlots: [1] } })).toBe(true);
    const cycle: any = {}; cycle.playerResponse = cycle;
    expect(prunePlayerAds(cycle)).toBe(false);
  });
  it('cannot activate on a hostname lookalike', () => {
    expect(youtubeHost('www.youtube.com')).toBe(true);
    expect(youtubeHost('www.youtube-nocookie.com')).toBe(true);
    expect(youtubeHost('youtube.com.evil.example')).toBe(false);
    expect(youtubeHost('notyoutube.com')).toBe(false);
  });
});
describe('behavior rule scope and privacy', () => {
  it('reserves the strict resource threshold for network blocks and vetoes essential behavior', () => {
    const decision = { id: 'x', model: 'test', ad: .9, essential: .05 };
    expect(shouldLearn(decision, 'script')).toBe(false);
    expect(shouldLearn(decision, 'popup')).toBe(true);
    expect(shouldLearn(decision, 'overlay')).toBe(true);
    expect(shouldLearn({ ...decision, ad: .849 }, 'overlay')).toBe(false);
    expect(shouldLearn({ ...decision, essential: .11 }, 'popup')).toBe(false);
  });
  it('does not compile popup or overlay rules into destructive network blocks', () => {
    const state = initialState();
    const base = { site: 'publisher.example', url: 'https://host.example/', ad: .99, essential: .01, model: 'test', classifierVersion: 'test', origin: 'behavior' as const, createdAt: '' };
    state.rules.push({ ...base, id: 1, type: 'popup' }, { ...base, id: 2, type: 'overlay', selector: 'div.sponsor-layer' });
    expect(compileRules(state, false)).toEqual([]);
    const candidate = { ...base, id: '1', type: 'overlay' as const, selector: 'div.sponsor-layer' };
    expect(blocked(candidate, state)).toBe(true);
    expect(blocked({ ...candidate, selector: 'div.controls' }, state)).toBe(false);
    expect(blocked({ ...candidate, url: 'https://other.example/' }, state)).toBe(false);
    expect(blocked({ ...candidate, site: 'other.example' }, state)).toBe(false);
    expect(fingerprint(candidate)).not.toBe(fingerprint({ ...candidate, selector: 'div.controls' }));
    state.allows.push(candidate);
    expect(blocked(candidate, state)).toBe(false);
  });
  it('restricts learned selectors to a single element signature', () => {
    expect(validOverlaySelector('div#sponsor-layer')).toBe(true);
    expect(validOverlaySelector('a.sponsor.overlay')).toBe(true);
    expect(validOverlaySelector('div[data-cl-overlay]')).toBe(true);
    expect(validOverlaySelector('div#player > div:nth-of-type(3)')).toBe(true);
    for (const selector of ['*', 'body', 'div:has(video)', 'div.ad,video', '#player', 'div[x=y]', 'div.ad video']) expect(validOverlaySelector(selector)).toBe(false);
  });
  it('sends only allowlisted behavior flags, never raw stacks or ad targets', () => {
    const candidate: any = { id: '1', site: 'example.com', url: 'https://example.com/player.js?session=secret', type: 'popup', origin: 'behavior', selector: 'div#user-private', stack: 'private', evidence: { kind: 'popup', playerGesture: true, blank: true, cookies: 'private', destination: 'private', stack: 'private' } };
    const result = sanitizeCandidate(candidate);
    expect(result.evidence).toEqual({ kind: 'popup', playerGesture: true, blank: true });
    expect(JSON.stringify(result)).not.toMatch(/private|secret|stack|selector|cookies|destination/);
  });
});
