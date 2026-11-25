// Renders every screen once with mock state to catch runtime errors. Run: node tests/render.js
import { build } from 'vite';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const outDir = path.join(os.tmpdir(), 'counterfeit-render-test');
await build({ logLevel: 'error', ssr: { noExternal: true }, build: { ssr: 'tests/render-entry.jsx', outDir, emptyOutDir: true } });
await import(pathToFileURL(path.join(outDir, 'render-entry.js')).href);
