/// <reference types="vite/client" />

interface BuildInfo {
  version: string;
  branch: string;
  buildDate: string;
}

declare const __BUILD_INFO__: BuildInfo;
