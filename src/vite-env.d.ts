/// <reference types="vite/client" />

interface BuildInfo {
  branch: string;
  commitHash: string;
  buildDate: string;
}

declare const __BUILD_INFO__: BuildInfo;
