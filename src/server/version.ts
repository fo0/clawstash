/**
 * Version check utility — reads local build info and compares against
 * the latest commit on the GitHub main branch.
 *
 * Current version: read from build-info.json (production) or git (development).
 * Latest version:  fetched from GitHub Commits API (SHA comparison, not semver).
 * Results are cached for 1 hour to avoid excessive API calls.
 */
import { readFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';
import { formatBuildVersion } from '../utils/format';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GITHUB_OWNER = 'fo0';
const GITHUB_REPO = 'clawstash';
const GITHUB_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
/** Abort the GitHub commits fetch if it does not complete in this window. */
const GITHUB_FETCH_TIMEOUT_MS = 5000;
/** Retry sooner than the full TTL when the previous fetch failed. */
const FAILED_FETCH_RETRY_MS = 60 * 1000;

// ---------------------------------------------------------------------------
// Build info (current version)
// ---------------------------------------------------------------------------

interface BuildInfo {
  branch: string;
  commitHash: string;
  buildDate: string;
}

// `formatBuildVersion()` (utils/format) returns `string | null` so the UI
// callsite can fall back to a default label on a bad build_date. Server
// callsites here coalesce to 'unknown' to keep the public `version: string`
// API contract stable; in practice `loadBuildInfo()` already falls back to
// `new Date().toISOString()`, so the null branch is unreachable.
const UNKNOWN_VERSION = 'unknown';

/**
 * Run a git command and return its trimmed stdout, or '' when git is
 * unavailable / the command fails.
 *
 * `execFileSync` with an argv array — NOT `execSync` with a command string,
 * which spawns `/bin/sh -c` and would interpret shell metacharacters. The
 * arguments here are compile-time constants, so this is defense-in-depth:
 * it removes the shell from the process tree entirely (no quoting rules to
 * get wrong on a future argument, and no `sh` dependency in slim images).
 */
function git(...args: string[]): string {
  try {
    return execFileSync('git', args, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

function loadBuildInfo(): BuildInfo {
  // Production: read from build-info.json (written by prebuild script)
  const buildInfoPath = path.join(process.cwd(), 'build-info.json');
  if (existsSync(buildInfoPath)) {
    try {
      return JSON.parse(readFileSync(buildInfoPath, 'utf-8'));
    } catch {
      // Fall through to git
    }
  }

  // Development: read directly from git
  const branch = process.env.BUILD_BRANCH || git('rev-parse', '--abbrev-ref', 'HEAD');
  let commitHash = process.env.BUILD_COMMIT_SHA || git('rev-parse', '--short', 'HEAD');

  // Normalize to 7-char short hash (git may return more for uniqueness)
  if (commitHash.length > 7) {
    commitHash = commitHash.substring(0, 7);
  }

  // Use git commit date so the version is stable across server restarts
  const buildDate = git('log', '-1', '--format=%cI') || new Date().toISOString();

  return { branch, commitHash, buildDate };
}

// Lazy-load on first use so the module-import path does not block on
// synchronous git execSync when build-info.json is missing (e.g. local dev
// without prebuild, or production where build-info.json should exist but the
// cold-start path should never block the event loop on a child process).
let cachedBuildInfo: BuildInfo | null = null;
function getBuildInfo(): BuildInfo {
  if (!cachedBuildInfo) {
    cachedBuildInfo = loadBuildInfo();
  }
  return cachedBuildInfo;
}

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
// Track an in-flight fetch so concurrent /api/version callers share a single
// GitHub round-trip. Without this, N parallel requests during a cache miss
// each kick off their own `fetch` — wasteful and likely to trip the
// GitHub unauthenticated-API rate limit (60/h/IP) under load. The promise is
// cleared on settle so the next miss after the TTL window can retry.
let inFlight: Promise<LatestCache> | null = null;

async function fetchLatestCommit(): Promise<LatestCache> {
  const now = new Date().toISOString();
  const userAgent = `ClawStash/${formatBuildVersion(getBuildInfo().buildDate) ?? UNKNOWN_VERSION}`;

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits/main`,
      {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': userAgent },
        signal: AbortSignal.timeout(GITHUB_FETCH_TIMEOUT_MS),
      },
    );

    if (res.ok) {
      const data = (await res.json()) as {
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

export interface CurrentBuild {
  version: string;
  commit_sha: string;
  build_date: string;
  branch: string;
}

/**
 * How to bring this instance up to date. Aimed at agents: `check_version` and
 * `/api/version` report *that* an update exists; this says *what to do* about
 * it, so an agent can hand the user a ready-to-run command instead of a bare
 * "please upgrade".
 */
export interface UpgradeInfo {
  /** The published image every deployment guide uses. */
  image: string;
  /** Copy-pasteable steps — Docker Compose first, plain Node checkout second. */
  instructions: string;
  /** GitHub compare view from the running commit to main; null until both SHAs are known and differ. */
  compare_url: string | null;
  changelog_url: string;
}

export interface VersionInfo {
  current: CurrentBuild;
  latest: {
    commit_sha: string | null;
    commit_date: string | null;
    commit_message: string | null;
  } | null;
  update_available: boolean;
  upgrade: UpgradeInfo;
  github_url: string;
  checked_at: string;
}

export const DOCKER_IMAGE = `ghcr.io/${GITHUB_OWNER}/${GITHUB_REPO}:latest`;

export const UPGRADE_INSTRUCTIONS = [
  'Docker Compose (the documented setup): in the directory holding docker-compose.yml run `docker compose pull && docker compose up -d`. The ./data volume with the SQLite database is kept, pending schema migrations run automatically on start, and the service is unavailable only while the container restarts.',
  'Plain Node.js checkout: `git pull && npm install && npm run build`, then restart `npm start`.',
  'Afterwards call check_version (or GET /api/version) again — update_available must be false — and re-read /api/agent-skill, because tool definitions may have changed.',
].join(' ');

/**
 * Build the upgrade block of a version response. Pure. The compare URL is
 * only emitted when an update is actually available and both commits are
 * known, so a failed GitHub check never yields a half-formed link.
 */
export function buildUpgradeInfo(
  currentSha: string,
  latestSha: string | null,
  updateAvailable: boolean,
): UpgradeInfo {
  const compareUrl =
    updateAvailable && currentSha !== '' && latestSha
      ? `${GITHUB_URL}/compare/${currentSha}...${latestSha}`
      : null;
  return {
    image: DOCKER_IMAGE,
    instructions: UPGRADE_INSTRUCTIONS,
    compare_url: compareUrl,
    changelog_url: `${GITHUB_URL}/blob/main/CHANGELOG.md`,
  };
}

/** The running build — no network access, no cache involved. */
export function getCurrentBuild(): CurrentBuild {
  const info = getBuildInfo();
  return {
    version: formatBuildVersion(info.buildDate) ?? UNKNOWN_VERSION,
    commit_sha: info.commitHash,
    build_date: info.buildDate,
    branch: info.branch,
  };
}

/**
 * `VersionInfo` with the build fingerprint withheld. Structurally identical so
 * clients can parse one shape and null-check `current`, while `checkVersion()`
 * keeps its non-nullable `current` contract for the MCP tool and the OpenAPI
 * schema.
 */
export interface PublicVersionInfo extends Omit<VersionInfo, 'current' | 'latest' | 'upgrade'> {
  current: null;
  latest: null;
  /** Withheld with the fingerprint: the compare URL inside it would name the running commit. */
  upgrade: null;
}

/**
 * Reduced payload for callers that are not authorised to read build details.
 *
 * Mirrors the `/api/health` posture: the endpoint stays reachable (so the
 * footer and external probes never see a 401) but the build fingerprint —
 * branch, commit SHA, build date — is withheld from anonymous callers when
 * auth is enabled. Returning this shape also means no outbound GitHub commits
 * request is made on an unauthenticated caller's behalf, which would otherwise
 * disclose the server's egress IP and burn the shared 60/h unauthenticated
 * GitHub rate limit.
 *
 * `github_url` stays public — it is the project's own repository URL, already
 * published in the README and the UI.
 */
export function getPublicVersionInfo(): PublicVersionInfo {
  return {
    current: null,
    latest: null,
    update_available: false,
    upgrade: null,
    github_url: GITHUB_URL,
    checked_at: new Date().toISOString(),
  };
}

export async function checkVersion(): Promise<VersionInfo> {
  const now = Date.now();

  if (!cache || now > cacheExpiry) {
    // Coalesce concurrent misses onto a single fetch. `fetchLatestCommit`
    // never throws (it returns a null-commit shape on error), so a finally
    // is sufficient to clear the slot for the next miss.
    if (!inFlight) {
      inFlight = fetchLatestCommit().finally(() => {
        inFlight = null;
      });
    }
    const fresh = await inFlight;
    cache = fresh;
    // Only cache successful fetches for the full TTL; retry failures sooner.
    cacheExpiry = fresh.commit_sha !== null ? now + CACHE_TTL_MS : now + FAILED_FETCH_RETRY_MS;
  }

  const updateAvailable =
    cache.commit_sha !== null &&
    getBuildInfo().commitHash !== '' &&
    cache.commit_sha !== getBuildInfo().commitHash;

  const current = getCurrentBuild();
  return {
    current,
    latest: cache.commit_sha
      ? {
          commit_sha: cache.commit_sha,
          commit_date: cache.commit_date,
          commit_message: cache.commit_message,
        }
      : null,
    update_available: updateAvailable,
    upgrade: buildUpgradeInfo(current.commit_sha, cache.commit_sha, updateAvailable),
    github_url: GITHUB_URL,
    checked_at: cache.checked_at,
  };
}
