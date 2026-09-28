import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Resvg } from '@resvg/resvg-js';

const root = resolve(import.meta.dirname, '..');
const output = join(root, '.local/icons');
const iconset = join(output, 'icon.iconset');
await mkdir(iconset, { recursive: true });
const svg = await readFile(join(root, 'public/logo.svg'), 'utf8');
const images = new Map();
for (const size of [16, 32, 48, 64, 128, 256, 512, 1024]) {
  images.set(
    size,
    new Resvg(svg, {
      fitTo: { mode: 'width', value: size },
      font: { loadSystemFonts: false },
    })
      .render()
      .asPng(),
  );
}
await writeFile(join(output, 'icon.png'), images.get(512));

// Windows Vista+ supports PNG image entries in ICO, including alpha transparency.
const sizes = [16, 32, 48, 64, 128, 256];
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (const [index, size] of sizes.entries()) {
  const entry = 6 + index * 16;
  const png = images.get(size);
  header[entry] = header[entry + 1] = size === 256 ? 0 : size;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(png.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
}
await writeFile(
  join(output, 'icon.ico'),
  Buffer.concat([header, ...sizes.map((size) => images.get(size))]),
);

if (process.platform === 'darwin') {
  for (const size of [16, 32, 128, 256, 512]) {
    await writeFile(join(iconset, `icon_${size}x${size}.png`), images.get(size));
    await writeFile(join(iconset, `icon_${size}x${size}@2x.png`), images.get(size * 2));
  }
  execFileSync('iconutil', ['--convert', 'icns', '--output', join(output, 'icon.icns'), iconset]);
}
console.log('Generated application icons from public/logo.svg');
