import { TypeSafeProvider } from '../../lib/provider';
import { DEFAULT_MODEL, type SafeCandidate } from '../../lib/types';
import { shouldLearn } from '../../lib/policy';
import { mkdir, writeFile } from 'node:fs/promises';

if (!process.env.TYPESAFE_API_KEY) throw new Error('Set TYPESAFE_API_KEY in the local test process.');
const cases: (SafeCandidate & { expected: boolean })[] = [
  { id: 'adsense', site: 'onepiece.tube', url: 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js', type: 'script', expected: true },
  { id: 'powerad', site: 'onepiece.tube', url: 'https://powerad.ai/[redacted]/script.js', type: 'script', expected: true },
  { id: 'app', site: 'onepiece.tube', url: 'https://onepiece.tube/js/app.js', type: 'script', expected: false },
  { id: 'chat', site: 'onepiece.tube', url: 'https://st.chatango.com/js/gz/emb.js', type: 'script', expected: false },
  { id: 'video', site: 'onepiece.tube', url: 'https://video.example/episode-1178.mp4', type: 'media', tag: 'video', expected: false },
  { id: 'consent', site: 'onepiece.tube', url: 'https://fundingchoicesmessages.google.com/i/[redacted]', type: 'script', expected: false },
  { id: 'fixture', site: 'localhost', url: 'http://127.0.0.1/commercial-loader.js', type: 'script', marker: 'advertisement', label: 'Advertising-only banner loader', expected: true },
  { id: 'player-popup', site: 'publisher.example', url: 'https://player.example/shared-player.js', type: 'popup', evidence: { kind: 'popup', playerGesture: true, blank: true, unrelatedDestination: true }, expected: true },
  { id: 'shared-player', site: 'publisher.example', url: 'https://player.example/shared-player.js', type: 'script', marker: 'main-player playback-controls', evidence: { kind: 'popup', playerGesture: true, blank: true, unrelatedDestination: true }, expected: false },
  { id: 'overlay', site: 'publisher.example', url: 'https://player.example/', type: 'overlay', marker: 'sponsor-layer', label: 'Advertisement', evidence: { kind: 'overlay', overlaysPlayer: true, externalLink: true }, expected: true },
  { id: 'player-controls', site: 'publisher.example', url: 'https://player.example/', type: 'overlay', marker: 'vjs-control-bar', evidence: { kind: 'overlay', overlaysPlayer: true, externalLink: false }, expected: false },
  { id: 'popup-login', site: 'publisher.example', url: 'https://player.example/account.js', type: 'popup', label: 'Sign in with Google', evidence: { kind: 'popup', playerGesture: false, blank: true, unrelatedDestination: false }, expected: false },
  { id: 'popup-share', site: 'publisher.example', url: 'https://player.example/share.js', type: 'popup', label: 'Share video', evidence: { kind: 'popup', playerGesture: true, blank: false, unrelatedDestination: false }, expected: false },
  { id: 'unknown-popup', site: 'publisher.example', url: 'https://cdn.example/widget.js', type: 'popup', evidence: { kind: 'popup', playerGesture: false, blank: false, unrelatedDestination: false }, expected: false },
  { id: 'captions', site: 'publisher.example', url: 'https://player.example/', type: 'overlay', marker: 'vjs-text-track-display subtitles', evidence: { kind: 'overlay', overlaysPlayer: true, containsMedia: false, containsControls: true }, expected: false },
  { id: 'player-error', site: 'publisher.example', url: 'https://player.example/', type: 'overlay', marker: 'jw-error-message', evidence: { kind: 'overlay', overlaysPlayer: true, containsMedia: false, containsControls: true }, expected: false },
  { id: 'consent-overlay', site: 'publisher.example', url: 'https://player.example/', type: 'overlay', marker: 'consent-dialog privacy-preferences', evidence: { kind: 'overlay', overlaysPlayer: true, containsMedia: false, containsControls: true }, expected: false },
  { id: 'poster', site: 'publisher.example', url: 'https://player.example/', type: 'overlay', marker: 'jw-preview video-poster play-button', evidence: { kind: 'overlay', overlaysPlayer: true, containsMedia: false, containsControls: true }, expected: false },
  { id: 'next-video', site: 'publisher.example', url: 'https://player.example/', type: 'overlay', marker: 'autoplay-next-episode-countdown', evidence: { kind: 'overlay', overlaysPlayer: true, containsMedia: false, containsControls: true }, expected: false },
  { id: 'fixture-banner', site: 'localhost', url: 'http://127.0.0.1/banner.svg', type: 'image', tag: 'img', label: 'Advertisement', expected: true },
];
const decisions = await new TypeSafeProvider(process.env.TYPESAFE_API_KEY, DEFAULT_MODEL).evaluate(cases.map(({ expected, ...candidate }) => candidate));
const result = decisions.map(d => ({ ...d, blocked: shouldLearn(d, cases.find(c => c.id === d.id)!.type), expected: cases.find(c => c.id === d.id)!.expected }));
await mkdir('test-results', { recursive: true });
await writeFile('test-results/model-live.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
// False negatives are reported, not hidden by lowering the safety threshold.
// A real classification regression is any blocked legitimate content or no
// detected ads at all. This small smoke corpus is not an accuracy benchmark.
if (result.some(r => r.blocked && !r.expected) || !result.some(r => r.blocked && r.expected)) process.exitCode = 1;
