import { execFileSync } from 'node:child_process';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const commit = process.env.CF_PAGES_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], { encoding: 'utf8' }).trim();
  const hasLocalChanges = execFileSync('git', ['status', '--porcelain'], {
    encoding: 'utf8',
  }).trim().length > 0;
  const buildVersion = `${commit.slice(0, 8)}${hasLocalChanges ? '+local' : ''}`;

  return {
    plugins: [react(), tailwindcss()],
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
