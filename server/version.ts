/**
 * Version check utility — reads local build info and compares against
 * the latest commit on the GitHub main branch.
 *
 * Current version: read from dist/build-info.json (production) or git (development).
 * Latest version:  fetched from GitHub Commits API (SHA comparison, not semver).
 * Results are cached for 1 hour to avoid excessive API calls.
 */
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GITHUB_OWNER = 'fo0';
const GITHUB_REPO = 'clawstash';
const GITHUB_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ---------------------------------------------------------------------------
// Build info (current version)
// ---------------------------------------------------------------------------

interface BuildInfo {
  branch: string;
  commitHash: string;
  buildDate: string;
}

function formatBuildVersion(isoDate: string): string {
  const d = new Date(isoDate);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `v${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function loadBuildInfo(): BuildInfo {
  // Production: read from dist/build-info.json (written by Vite build plugin)
  const buildInfoPath = path.join(__dirname, '..', 'dist', 'build-info.json');
  if (existsSync(buildInfoPath)) {
    try {
      return JSON.parse(readFileSync(buildInfoPath, 'utf-8'));
    } catch {
      // Fall through to git
    }
  }

  // Development: read directly from git
  let branch = '';
  let commitHash = '';
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    // git not available
  }
  try {
    commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    // git not available
  }

  // Normalize to 7-char short hash (git may return more for uniqueness)
  if (commitHash.length > 7) {
    commitHash = commitHash.substring(0, 7);
  }

  return { branch, commitHash, buildDate: new Date().toISOString() };
}

const buildInfo = loadBuildInfo();

// ---------------------------------------------------------------------------
// GitHub API — latest commit on main
// ---------------------------------------------------------------------------

interface LatestCache {
  commit_sha: string | null;
  commit_date: string | null;
  commit_message: string | null;
  checked_at: string;
}

let cache: LatestCache | null = null;
let cacheExpiry = 0;

async function fetchLatestCommit(): Promise<LatestCache> {
  const now = new Date().toISOString();
  const userAgent = `ClawStash/${formatBuildVersion(buildInfo.buildDate)}`;

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits/main`,
      {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': userAgent },
        signal: AbortSignal.timeout(5000),
      },
    );

    if (res.ok) {
      const data = await res.json() as {
        sha: string;
        commit: { message: string; committer: { date: string } | null };
      };
      return {
        commit_sha: data.sha.substring(0, 7),
        commit_date: data.commit.committer?.date ?? null,
        commit_message: data.commit.message.split('\n')[0],
        checked_at: now,
      };
    }

    return { commit_sha: null, commit_date: null, commit_message: null, checked_at: now };
  } catch {
    return { commit_sha: null, commit_date: null, commit_message: null, checked_at: now };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface VersionInfo {
  current: {
    version: string;
    commit_sha: string;
    build_date: string;
    branch: string;
  };
  latest: {
    commit_sha: string | null;
    commit_date: string | null;
    commit_message: string | null;
  } | null;
  update_available: boolean;
  github_url: string;
  checked_at: string;
}

export async function checkVersion(): Promise<VersionInfo> {
  const now = Date.now();

  if (!cache || now > cacheExpiry) {
    cache = await fetchLatestCommit();
    cacheExpiry = now + CACHE_TTL_MS;
  }

  const updateAvailable = cache.commit_sha !== null
    && buildInfo.commitHash !== ''
    && cache.commit_sha !== buildInfo.commitHash;

  return {
    current: {
      version: formatBuildVersion(buildInfo.buildDate),
      commit_sha: buildInfo.commitHash,
      build_date: buildInfo.buildDate,
      branch: buildInfo.branch,
    },
    latest: cache.commit_sha ? {
      commit_sha: cache.commit_sha,
      commit_date: cache.commit_date,
      commit_message: cache.commit_message,
    } : null,
    update_available: updateAvailable,
    github_url: GITHUB_URL,
    checked_at: cache.checked_at,
  };
}
