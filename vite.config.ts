import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import path from 'path';

function getBuildInfo() {
  let branch = process.env.BUILD_BRANCH || '';
  let commitHash = process.env.BUILD_COMMIT_SHA || '';

  // Fallback to git when env vars are not set (local development)
  if (!branch) {
    try {
      branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    } catch {
      // Not a git repo or git not available
    }
  }
  if (!commitHash) {
    try {
      commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
    } catch {
      // Not a git repo or git not available
    }
  }

  // Normalize to short hash (env var may provide full SHA)
  if (commitHash.length > 7) {
    commitHash = commitHash.substring(0, 7);
  }

  return {
    branch,
    commitHash,
    buildDate: new Date().toISOString(),
  };
}

/** Writes build-info.json into dist/ so the server can read it at runtime. */
function buildInfoPlugin(info: ReturnType<typeof getBuildInfo>): Plugin {
  return {
    name: 'write-build-info',
    writeBundle(options) {
      const outDir = options.dir || 'dist';
      writeFileSync(
        path.join(outDir, 'build-info.json'),
        JSON.stringify(info, null, 2) + '\n',
      );
    },
  };
}

const buildInfo = getBuildInfo();

export default defineConfig({
  plugins: [react(), buildInfoPlugin(buildInfo)],
  define: {
    __BUILD_INFO__: JSON.stringify(buildInfo),
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/mcp': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
