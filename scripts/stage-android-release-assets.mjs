import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'public', 'app-version.json');
const releaseAssetsRoot = path.join(root, 'android', 'app', 'build', 'worker-assets');
const clientAssetsRoot = path.join(root, 'dist', 'client');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

if (
  typeof manifest.version !== 'string' ||
  !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(manifest.version) ||
  !Number.isSafeInteger(manifest.apkSizeBytes) ||
  manifest.apkSizeBytes <= 0 ||
  !Array.isArray(manifest.parts) ||
  manifest.parts.length === 0
) {
  throw new Error('The public Android app version manifest is missing release download assets.');
}

const totalBytes = manifest.parts.reduce((sum, part) => sum + part.size, 0);
if (totalBytes !== manifest.apkSizeBytes) {
  throw new Error('The Android APK part sizes do not match the published APK size.');
}

for (const part of manifest.parts) {
  const expectedPrefix = `/downloads/app/${manifest.version}/part-`;
  if (
    typeof part.path !== 'string' ||
    !part.path.startsWith(expectedPrefix) ||
    !Number.isSafeInteger(part.size) ||
    part.size <= 0
  ) {
    throw new Error('The Android app manifest contains an invalid release part.');
  }

  const relativePath = part.path.slice(1);
  const sourcePath = path.resolve(releaseAssetsRoot, relativePath);
  const destinationPath = path.resolve(clientAssetsRoot, relativePath);
  if (!sourcePath.startsWith(`${releaseAssetsRoot}${path.sep}`) ||
      !destinationPath.startsWith(`${clientAssetsRoot}${path.sep}`)) {
    throw new Error('The Android app manifest references a release asset outside its download directory.');
  }
  const sourceStat = await stat(sourcePath);
  if (sourceStat.size !== part.size) {
    throw new Error(`Android APK part size mismatch: ${part.path}`);
  }
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await copyFile(sourcePath, destinationPath);
}

console.log(`Staged Android ${manifest.version} for production download.`);
