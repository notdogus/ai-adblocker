import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
// Run explicitly when changing the source icon; ordinary builds use committed PNGs.
const browser = await chromium.launch({ headless: true });
try {
 const page = await browser.newPage();
 const source = await readFile('assets/icon.svg','utf8');
 await mkdir('public/icon', { recursive: true });
 for (const size of [16,32,48,96,128]) {
  await page.setViewportSize({width:size,height:size});
  await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:transparent}svg{display:block;width:100%;height:100%}</style>${source}`);
  await page.screenshot({path:`public/icon/${size}.png`,omitBackground:true});
 }
}finally{await browser.close();}
