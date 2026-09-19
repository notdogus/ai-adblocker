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
  { id: 'fixture-banner', site: 'localhost', url: 'http://127.0.0.1/banner.svg', type: 'image', tag: 'img', label: 'Advertisement', expected: true },
];
const decisions = await new TypeSafeProvider(process.env.TYPESAFE_API_KEY, DEFAULT_MODEL).evaluate(cases.map(({ expected, ...candidate }) => candidate));
const result = decisions.map(d => ({ ...d, blocked: shouldLearn(d), expected: cases.find(c => c.id === d.id)!.expected }));
await mkdir('test-results', { recursive: true });
await writeFile('test-results/model-live.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
// False negatives are reported, not hidden by lowering the safety threshold.
// A real classification regression is any blocked legitimate content or no
// detected ads at all. This small smoke corpus is not an accuracy benchmark.
if (result.some(r => r.blocked && !r.expected) || !result.some(r => r.blocked && r.expected)) process.exitCode = 1;
