import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';

function getBuildInfo() {
  let branch = '';
  let commitHash = '';
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    // Not a git repo or git not available
  }
  try {
    commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    // Not a git repo or git not available
  }
  return {
    branch,
    commitHash,
    buildDate: new Date().toISOString(),
  };
}

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_INFO__: JSON.stringify(getBuildInfo()),
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
