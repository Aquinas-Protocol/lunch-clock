// Rasterize public/icon.svg into the PNGs iOS and the manifest need.
// Run after editing the SVG: npm run icons
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const svg = readFileSync('public/icon.svg');
for (const size of [180, 512]) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(`public/icon-${size}.png`, png);
  console.log(`public/icon-${size}.png`);
}
