import { describe, it, expect } from 'vitest';
import { buildUpgradeInfo, getCurrentBuild, getPublicVersionInfo, DOCKER_IMAGE } from '../version';

/**
 * `upgrade` turns "an update exists" into "here is what to do": an agent
 * reads `instructions` and `compare_url` and hands them to the user. The
 * compare link must never be half-formed, and the public (unauthenticated)
 * shape must not carry it, because it would name the running commit.
 */
describe('buildUpgradeInfo', () => {
  it('links the compare view only when an update is available and both SHAs are known', () => {
    const info = buildUpgradeInfo('abc1234', 'def5678', true);
    expect(info.compare_url).toBe('https://github.com/fo0/clawstash/compare/abc1234...def5678');
    expect(info.changelog_url).toBe('https://github.com/fo0/clawstash/blob/main/CHANGELOG.md');
    expect(info.image).toBe(DOCKER_IMAGE);
  });

  it('omits the compare link when up to date, when GitHub was unreachable, or when the build SHA is unknown', () => {
    expect(buildUpgradeInfo('abc1234', 'abc1234', false).compare_url).toBeNull();
    expect(buildUpgradeInfo('abc1234', null, false).compare_url).toBeNull();
    expect(buildUpgradeInfo('', 'def5678', true).compare_url).toBeNull();
  });

  it('gives copy-pasteable steps for Docker Compose and a plain checkout, then a re-check', () => {
    const { instructions } = buildUpgradeInfo('abc1234', 'def5678', true);
    expect(instructions).toContain('docker compose pull && docker compose up -d');
    expect(instructions).toContain('git pull && npm install && npm run build');
    expect(instructions).toContain('check_version');
  });
});

describe('getCurrentBuild', () => {
  it('returns the build fingerprint without touching the network', () => {
    const build = getCurrentBuild();
    expect(typeof build.version).toBe('string');
    expect(typeof build.commit_sha).toBe('string');
    expect(Number.isNaN(new Date(build.build_date).getTime())).toBe(false);
  });
});

describe('getPublicVersionInfo', () => {
  it('withholds the upgrade block together with the fingerprint', () => {
    const info = getPublicVersionInfo();
    expect(info.upgrade).toBeNull();
    expect(JSON.stringify(info)).not.toContain('compare');
  });
});
