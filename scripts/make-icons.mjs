// Renders the PWA PNG icons from public/icon.svg with the Playwright browser.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const svg = readFileSync('public/icon.svg', 'utf8');
const b = await chromium.launch();
for (const [name, size, inner] of [['icon-192.png', 192, 192], ['icon-512.png', 512, 512], ['icon-maskable.png', 512, 380]]) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<body style="margin:0;background:#050607;display:grid;place-items:center;height:100vh"><div style="width:${inner}px;height:${inner}px">${svg}</div></body>`);
  await p.screenshot({ path: `public/${name}` });
  await p.close();
}
await b.close();
