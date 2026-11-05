// Render the app icons and the header mark from the provided logo (brand/logo.jpg).
// The logo's artwork is re-centred and scaled onto a white square, so icons
// stay balanced even though the source image is slightly off-centre.
// Run after replacing the logo: npm run icons
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const SRC = 'brand/logo.jpg';
const SRC_SIZE = 225; // source is 225×225
// Artwork bounding box inside the source (measured with ffmpeg's bbox filter).
const ART = { cx: (57 + 186) / 2, cy: (33 + 199) / 2, h: 199 - 33 };

const dataUri = `data:image/jpeg;base64,${readFileSync(SRC).toString('base64')}`;

function render(size, fill) {
  const k = (fill * size) / ART.h;
  const x = size / 2 - ART.cx * k;
  const y = size / 2 - ART.cy * k;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" fill="#FFFFFF"/>
    <image href="${dataUri}" x="${x}" y="${y}" width="${SRC_SIZE * k}" height="${SRC_SIZE * k}"/>
  </svg>`;
  return new Resvg(svg).render().asPng();
}

const outputs = [
  ['public/icon-180.png', 180, 0.72], // iOS home screen
  ['public/icon-512.png', 512, 0.72], // manifest
  ['public/logo-mark.png', 96, 0.94], // in-app header (shown at 32px, multiply-blended)
];
for (const [file, size, fill] of outputs) {
  writeFileSync(file, render(size, fill));
  console.log(file);
}
