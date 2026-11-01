import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gradlePath = path.join(root, 'android', 'app', 'build.gradle');
const apkPath = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const releaseAssetsRoot = path.join(root, 'android', 'app', 'build', 'worker-assets');
const manifestPath = path.join(root, 'public', 'app-version.json');
const partSizeLimit = 20 * 1024 * 1024;
const gradle = await readFile(gradlePath, 'utf8');
const version = gradle.match(/versionName\s+"([^"]+)"/)?.[1];
if (!version || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version)) {
  throw new Error('Could not read a valid Android versionName from android/app/build.gradle.');
}

const releaseDirectory = path.join(releaseAssetsRoot, 'downloads', 'app', version);
await mkdir(releaseDirectory, { recursive: true });

let partIndex = 0;
let totalBytes = 0;
let pending = Buffer.alloc(0);
const parts = [];
async function writePart(content) {
  const fileName = `part-${String(partIndex).padStart(3, '0')}`;
  const outputPath = path.join(releaseDirectory, fileName);
  await writeFile(outputPath, content);
  parts.push({
    path: `/downloads/app/${version}/${fileName}`,
    size: content.length,
  });
  partIndex++;
}

for await (const sourceChunk of createReadStream(apkPath)) {
  totalBytes += sourceChunk.length;
  pending = pending.length
    ? Buffer.concat([pending, sourceChunk])
    : sourceChunk;
  while (pending.length >= partSizeLimit) {
    await writePart(pending.subarray(0, partSizeLimit));
    pending = pending.subarray(partSizeLimit);
  }
}
if (pending.length > 0) await writePart(pending);
if (parts.length === 0) throw new Error(`The Android APK is empty or missing: ${apkPath}`);

const manifest = {
  version,
  publishedAt: new Date().toISOString(),
  releaseNotes: 'Melhorias de desempenho, estabilidade e experiência no jogo.',
  downloadUrl: '/api/app/download',
  apkSizeBytes: totalBytes,
  parts,
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`Prepared Android ${version}: ${parts.length} download parts (${totalBytes} bytes).`);
