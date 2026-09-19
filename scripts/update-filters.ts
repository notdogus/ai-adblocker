import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const sources = [
  { name: 'easylist', url: 'https://easylist.to/easylist/easylist.txt' },
  { name: 'easylist-germany', url: 'https://easylist.to/easylistgermany/easylistgermany.txt' },
];
await mkdir('filters', { recursive: true });
const metadata = [];
for (const source of sources) {
  const response = await fetch(source.url);
  if (!response.ok) throw new Error(`Filter download failed: ${response.status}`);
  const content = await response.text();
  if (!content.startsWith('[Adblock')) throw new Error('Unexpected filter format');
  await writeFile(`filters/${source.name}.txt`, content);
  metadata.push({ ...source, sha256: createHash('sha256').update(content).digest('hex'), downloadedAt: new Date().toISOString() });
}
await writeFile('filters/sources.json', JSON.stringify(metadata, null, 2) + '\n');
console.log('Updated pinned filter snapshots. Review changes and run npm run build.');
