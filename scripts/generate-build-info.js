#!/usr/bin/env node

/**
 * Generates build-info.json at the project root.
 * Runs automatically via the "prebuild" npm script before `next build`.
 *
 * In CI/Docker the BUILD_COMMIT_SHA and BUILD_BRANCH env vars take precedence
 * over local git information.
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

function git(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

const branch = process.env.BUILD_BRANCH || git('git rev-parse --abbrev-ref HEAD');

let commitHash = process.env.BUILD_COMMIT_SHA || git('git rev-parse --short HEAD');
if (commitHash.length > 7) commitHash = commitHash.substring(0, 7);

const buildDate = new Date().toISOString();

const info = { branch, commitHash, buildDate };
writeFileSync('build-info.json', JSON.stringify(info, null, 2) + '\n');
console.log(`build-info.json: ${branch}@${commitHash} (${buildDate})`);
