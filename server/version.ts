/**
 * Version check utility — compares local version against latest GitHub release.
 *
 * Uses the GitHub API to fetch the latest release tag. Results are cached
 * for a configurable duration to avoid excessive API calls.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

// ---------------------------------------------------------------------------
// Local version (from package.json)
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));

export const CURRENT_VERSION: string = pkg.version;

const GITHUB_OWNER = 'fo0';
const GITHUB_REPO = 'clawstash';
const GITHUB_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface VersionCache {
  latest_version: string | null;
  release_url: string | null;
  checked_at: string;
}

let cache: VersionCache | null = null;
let cacheExpiry = 0;

// ---------------------------------------------------------------------------
// Semver comparison (major.minor.patch)
// ---------------------------------------------------------------------------

function parseVersion(v: string): number[] {
  return v.replace(/^v/, '').split('.').map(Number);
}

/** Returns true when remote is strictly newer than local. */
function isNewer(remote: string, local: string): boolean {
  const r = parseVersion(remote);
  const l = parseVersion(local);
  for (let i = 0; i < 3; i++) {
    const rv = r[i] ?? 0;
    const lv = l[i] ?? 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}

// ---------------------------------------------------------------------------
// GitHub API fetch
// ---------------------------------------------------------------------------

async function fetchLatestRelease(): Promise<VersionCache> {
  const now = new Date().toISOString();

  try {
    // Try releases first
    const releaseRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': `ClawStash/${CURRENT_VERSION}` },
        signal: AbortSignal.timeout(5000),
      },
    );

    if (releaseRes.ok) {
      const data = await releaseRes.json() as { tag_name: string; html_url: string };
      return {
        latest_version: data.tag_name.replace(/^v/, ''),
        release_url: data.html_url,
        checked_at: now,
      };
    }

    // Fallback: check tags if no releases exist
    if (releaseRes.status === 404) {
      const tagsRes = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/tags?per_page=1`,
        {
          headers: { Accept: 'application/vnd.github+json', 'User-Agent': `ClawStash/${CURRENT_VERSION}` },
          signal: AbortSignal.timeout(5000),
        },
      );

      if (tagsRes.ok) {
        const tags = await tagsRes.json() as Array<{ name: string }>;
        if (tags.length > 0) {
          const tagName = tags[0].name;
          return {
            latest_version: tagName.replace(/^v/, ''),
            release_url: `${GITHUB_URL}/releases/tag/${tagName}`,
            checked_at: now,
          };
        }
      }
    }

    // No release/tag info available
    return { latest_version: null, release_url: null, checked_at: now };
  } catch {
    // Network error, timeout, etc. — return null for latest
    return { latest_version: null, release_url: null, checked_at: now };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface VersionInfo {
  current_version: string;
  latest_version: string | null;
  update_available: boolean;
  release_url: string | null;
  github_url: string;
  checked_at: string;
}

export async function checkVersion(): Promise<VersionInfo> {
  const now = Date.now();

  if (!cache || now > cacheExpiry) {
    cache = await fetchLatestRelease();
    cacheExpiry = now + CACHE_TTL_MS;
  }

  return {
    current_version: CURRENT_VERSION,
    latest_version: cache.latest_version,
    update_available: cache.latest_version ? isNewer(cache.latest_version, CURRENT_VERSION) : false,
    release_url: cache.release_url,
    github_url: GITHUB_URL,
    checked_at: cache.checked_at,
  };
}
