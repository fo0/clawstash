#!/usr/bin/env node

/**
 * Generates build-info.json at the project root.
 * Runs automatically via the "prebuild" npm script before `next build`.
 *
 * In CI/Docker the BUILD_COMMIT_SHA and BUILD_BRANCH env vars take precedence
 * over local git information.
 */

import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';

/**
 * Run a git command via `execFileSync` with an argv array, so no shell is
 * spawned (mirrors `git()` in src/server/version.ts). Returns '' when git is
 * unavailable or the command fails.
 */
function git(...args) {
  try {
    return execFileSync('git', args, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

const branch = process.env.BUILD_BRANCH || git('rev-parse', '--abbrev-ref', 'HEAD');

let commitHash = process.env.BUILD_COMMIT_SHA || git('rev-parse', '--short', 'HEAD');
if (commitHash.length > 7) commitHash = commitHash.substring(0, 7);

const buildDate = new Date().toISOString();

const info = { branch, commitHash, buildDate };
writeFileSync('build-info.json', JSON.stringify(info, null, 2) + '\n');
console.log(`build-info.json: ${branch}@${commitHash} (${buildDate})`);
