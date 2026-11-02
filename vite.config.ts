import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

const GAME_ASSET_EXTENSIONS = /\.(?:avif|gif|jpe?g|mp3|ogg|png|svg|wav|webp)$/i;
const REMOTE_ASSET_PATTERN = /https?:\/\/[^"'\\\s)]+/g;
const EXTERNAL_IMAGE_HOSTS = new Set([
  'i.ibb.co',
  'i.imgur.com',
  'i.pinimg.com',
  'images.unsplash.com',
  'raw.githubusercontent.com',
  'static.wikia.nocookie.net',
  'w0.peakpx.com',
  'wallpapercat.com',
]);

function getGameAssetManifest() {
  const publicDir = path.resolve(__dirname, 'public');
  const assets: { url: string; size: number }[] = [];
  const fileHashes = new Map<string, string>();

  const visit = (directory: string, urlPrefix: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(filePath, `${urlPrefix}${entry.name}/`);
      } else if (entry.isFile() && GAME_ASSET_EXTENSIONS.test(entry.name)) {
        const stats = statSync(filePath);
        const contents = readFileSync(filePath);
        const url = `${urlPrefix}${entry.name}`;
        assets.push({
          url,
          size: stats.size,
        });
        fileHashes.set(url, createHash('sha256').update(contents).digest('hex'));
      }
    }
  };

  visit(path.join(publicDir, 'static', 'img'), '/static/img/');
  visit(path.join(publicDir, 'static', 'audio'), '/static/audio/');

  const dataDirectory = path.resolve(__dirname, 'src', 'data');
  for (const entry of readdirSync(dataDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name === 'users.json' || !/\.(?:json|ts)$/i.test(entry.name)) continue;
    const contents = readFileSync(path.join(dataDirectory, entry.name), 'utf8');
    for (const match of contents.matchAll(REMOTE_ASSET_PATTERN)) {
      const url = match[0].replace(/[,.]+$/, '');
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol === 'https:' && (
          GAME_ASSET_EXTENSIONS.test(parsedUrl.pathname) ||
          EXTERNAL_IMAGE_HOSTS.has(parsedUrl.hostname))) {
        assets.push({ url, size: 0 });
      }
    }
  }

  assets.sort((a, b) => a.url.localeCompare(b.url));
  const uniqueAssets = assets.filter((asset, index) =>
    index === 0 || asset.url !== assets[index - 1].url,
  );
  const hash = createHash('sha256');
  for (const asset of uniqueAssets) {
    hash.update(`${asset.url}\n`);
    const fileHash = fileHashes.get(asset.url);
    if (fileHash) hash.update(fileHash);
  }
  hash.update(
    readFileSync(path.resolve(__dirname, 'public', 'sw.js'), 'utf8')
      .replace('__WHOOSH_ASSET_VERSION__', ''),
  );

  return {
    version: hash.digest('hex').slice(0, 16),
    assets: uniqueAssets,
  };
}

function gameAssetManifestPlugin() {
  let version = '';
  let outputDirectory = '';
  let isBuild = false;

  return {
    name: 'whoosh-game-asset-manifest',
    configResolved(config: { command: string; build: { outDir: string } }) {
      isBuild = config.command === 'build';
      outputDirectory = config.build.outDir;
      if (isBuild) version = getGameAssetManifest().version;
    },
    closeBundle() {
      if (!isBuild || !version) return;
      const serviceWorkerPath = path.join(outputDirectory, 'sw.js');
      const serviceWorker = readFileSync(serviceWorkerPath, 'utf8');
      writeFileSync(
        serviceWorkerPath,
        serviceWorker.replaceAll('__WHOOSH_ASSET_VERSION__', version),
      );
    },
  };
}

export default defineConfig(() => {
  const commit = process.env.CF_PAGES_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], { encoding: 'utf8' }).trim();
  const hasLocalChanges = execFileSync('git', ['status', '--porcelain'], {
    encoding: 'utf8',
  }).trim().length > 0;
  const buildVersion = `${commit.slice(0, 8)}${hasLocalChanges ? '+local' : ''}`;

  return {
    plugins: [gameAssetManifestPlugin(), react(), tailwindcss()],
    define: {
      __WHOOSH_BUILD_VERSION__: JSON.stringify(buildVersion),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'motion/react', 'lucide-react'],
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: ['**/src/data/**'],
      },
    },
  };
});
