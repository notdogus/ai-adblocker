import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Filter, FilterConverter } from '@adguard/dnr-converter';
import { parseCosmetic, type CosmeticRule } from '../lib/cosmetics';
import { compactRules } from '../lib/compact-rules';
import { RE2 } from '@adguard/re2-wasm';

// The library entry point defaults to Chrome's callback-based regex validator.
// Supply the same RE2/1979-byte validation used by AdGuard's Node CLI instead
// of incorrectly dropping every regex when building outside a browser.
(globalThis as any).chrome = { runtime: {}, declarativeNetRequest: {
  isRegexSupported({ regex }: { regex: string }, done: (value: unknown) => void) {
    try { new RE2(regex, 'u', 1979); done({ isSupported: true }); }
    catch { done({ isSupported: false, reason: 'Unsupported RE2 pattern or memory limit' }); }
  },
} };

const sources = JSON.parse(await readFile('filters/sources.json', 'utf8')) as { name: string; sha256: string }[];
const cosmetic: CosmeticRule[] = [];
const unsupported: { source: string; line: string; reason: string }[] = [];
const network: string[] = [];
for (const source of sources) {
  const content = await readFile(`filters/${source.name}.txt`, 'utf8');
  if (createHash('sha256').update(content).digest('hex') !== source.sha256) throw new Error(`Checksum mismatch: ${source.name}`);
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('!') || line.startsWith('[')) continue;
    if (/#[@?$%]?#/.test(line)) {
      const parsed = parseCosmetic(line);
      if (parsed) cosmetic.push(parsed);
      else unsupported.push({ source: source.name, line, reason: 'Unsupported cosmetic syntax / scriptlet' });
    } else network.push(line);
  }
}
// Convert together so exceptions and $badfilter rules can act across both lists.
const converter = new FilterConverter();
const result = await converter.convert([new Filter(1, [...new Set(network)].join('\n'))], {
  combine: true, withSourceMap: true,
});
const conversion = result[0];
if (!conversion) throw new Error('No ruleset generated');
const converted = await conversion.ruleset.getDeclarativeRules();
const allowedActions = converted.filter(rule => ['block', 'allow', 'allowAllRequests'].includes(rule.action.type));
const safe = compactRules(allowedActions);
const ranks = [...new Set(safe.map(r => r.priority ?? 1))].sort((a, b) => a - b);
const rules = safe.map((r, index) => ({ ...r, id: index + 1, priority: ranks.indexOf(r.priority ?? 1) + 1 }));
if (rules.length > 30000 || rules.filter(r => r.condition.regexFilter).length > 1000) throw new Error('Static rules exceed the portable guaranteed quota; do not silently truncate.');
await mkdir('public/rules', { recursive: true });
await writeFile('public/rules/ads.json', JSON.stringify(rules));
await writeFile('public/rules/cosmetic.json', JSON.stringify(cosmetic));
await writeFile('public/LICENSE.txt', await readFile('LICENSE'));
let notices = await readFile('THIRD_PARTY_NOTICES.md', 'utf8');
for (const name of ['react', 'react-dom', 'scheduler', 'idb']) {
  const pkg = JSON.parse(await readFile(`node_modules/${name}/package.json`, 'utf8'));
  notices += `\n\n--- ${name} ${pkg.version} ---\n${await readFile(`node_modules/${name}/LICENSE`, 'utf8')}`;
}
notices += `\n\n--- WXT and @wxt-dev/browser ---\n${await readFile('docs/WXT-LICENSE.txt', 'utf8')}`;
await writeFile('public/THIRD_PARTY_NOTICES.txt', notices);
const report = {
  sources, networkInput: network.length, networkRules: rules.length, cosmeticRules: cosmetic.length,
  originalNetworkRules: converted.length, omittedActions: converted.length - allowedActions.length, unsupportedCosmetic: unsupported,
  conversionErrors: conversion.errors.map(String), conversionLimitations: conversion.limitations.map(String),
};
await writeFile('filters/build-report.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ networkRules: rules.length, cosmeticRules: cosmetic.length, unsupported: unsupported.length, conversionErrors: conversion.errors.length, conversionLimitations: conversion.limitations.length }));
