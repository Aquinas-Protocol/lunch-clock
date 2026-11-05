// One-command web deploy to GitHub Pages (adapted from workout-app).
// Builds with Vite, then publishes dist/ to the gh-pages branch from an
// isolated worktree. `git add -A -f` ignores .gitignore so nothing in dist is
// silently skipped. gh-pages is a disposable build branch, so it force-pushes.

import { execSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const wt = path.join(tmpdir(), 'lunch-clock-ghpages');
const BRANCH = 'gh-pages';

const sh = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', cwd: root, ...opts });
const shQuiet = (cmd, opts = {}) => {
  try {
    execSync(cmd, { stdio: 'ignore', cwd: root, ...opts });
  } catch {
    /* tolerated */
  }
};

console.log('▶ Building…');
sh('npx vite build');

console.log('▶ Preparing gh-pages worktree…');
shQuiet(`git fetch -q origin ${BRANCH}`);
rmSync(wt, { recursive: true, force: true });
shQuiet('git worktree prune');
try {
  sh(`git worktree add -q "${wt}" ${BRANCH}`);
  shQuiet(`git reset --hard origin/${BRANCH}`, { cwd: wt });
} catch {
  sh(`git worktree add -q --orphan -b ${BRANCH} "${wt}"`);
}

try {
  console.log('▶ Publishing dist…');
  shQuiet('git rm -rqf .', { cwd: wt });
  cpSync(dist, wt, { recursive: true });
  sh('git add -A -f', { cwd: wt });
  shQuiet('git commit -q -m "Deploy web build"', { cwd: wt });
  sh(`git push -q -f origin ${BRANCH}`, { cwd: wt });
  console.log('✓ Deployed to https://aquinas-protocol.github.io/lunch-clock/');
} finally {
  shQuiet(`git worktree remove --force "${wt}"`);
}
