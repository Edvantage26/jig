// okf-upkeep (Stop, feature `okf`): stops the agent from finishing while this session left
// knowledge newer than the last bundle update: repo files changed after the bundle was last
// touched, or project memories written in the session. Asks once per set of pending changes.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { allowDecision, blockDecision } from '../core/hook-io.mjs';
import {
  resolveStateDirectory, sessionStatePath, readStateText, writeStateText, stateModifiedMilliseconds, shortHash,
} from '../core/session-state.mjs';
import {
  resolveBundleDirectory, readBundleIndex, readBundleSpecVersion, newestModificationMilliseconds, buildMaintenanceRules,
} from './okf-bundle.mjs';
import { readGitHead } from './okf-index.mjs';

const MODULE_ID = 'okf-upkeep';
const MAX_LISTED_FILES = 20;
// Harness configuration is not project knowledge: editing it never asks for a concept update.
const IGNORED_PATHS = new Set(['.claude/settings.json', '.claude/settings.local.json', '.claude/harness.json']);

function runGit(projectRoot, gitArguments) {
  return execFileSync('git', ['-C', projectRoot, ...gitArguments], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

export function listSessionChangedFiles(projectRoot, baseHead, bundleRelativePath) {
  const trackedChanges = runGit(projectRoot, ['diff', '--name-only', baseHead]).split('\n');
  const untrackedFiles = runGit(projectRoot, ['ls-files', '--others', '--exclude-standard']).split('\n');
  const bundlePrefix = `${bundleRelativePath.replace(/\/+$/, '')}/`;
  return [...new Set([...trackedChanges, ...untrackedFiles])]
    .filter((changedPath) => changedPath && !changedPath.startsWith(bundlePrefix) && !IGNORED_PATHS.has(changedPath));
}

// Claude Code stores auto-memory under ~/.claude/projects/<path with / and . as ->/memory.
export function memoryDirectoriesFor(directoryPaths, homeDirectory = homedir()) {
  return [...new Set(directoryPaths.filter(Boolean))]
    .map((directoryPath) => join(homeDirectory, '.claude', 'projects', directoryPath.replace(/[/.]/g, '-'), 'memory'));
}

function listRecentMemories(memoryDirectories, sessionStartMilliseconds, bundleUpdatedMilliseconds) {
  const recentMemories = [];
  for (const memoryDirectory of memoryDirectories) {
    if (!existsSync(memoryDirectory)) continue;
    for (const memoryFileName of readdirSync(memoryDirectory)) {
      if (!memoryFileName.endsWith('.md') || memoryFileName === 'MEMORY.md') continue;
      const memoryMilliseconds = statSync(join(memoryDirectory, memoryFileName)).mtimeMs;
      if (memoryMilliseconds >= sessionStartMilliseconds && memoryMilliseconds > bundleUpdatedMilliseconds) {
        recentMemories.push({ name: memoryFileName, modifiedMilliseconds: memoryMilliseconds });
      }
    }
  }
  return recentMemories;
}

export function buildUpkeepReminder(bundleRelativePath, specVersion, pendingFiles, pendingMemories) {
  const reminderLines = [`OKF: this session left knowledge newer than the last update of ${bundleRelativePath}/.`];
  if (pendingFiles.length) {
    reminderLines.push('', 'Repo files changed after the last bundle update:');
    reminderLines.push(...pendingFiles.slice(0, MAX_LISTED_FILES).map((pendingFile) => `  - ${pendingFile.path}`));
    if (pendingFiles.length > MAX_LISTED_FILES) reminderLines.push(`  - ... and ${pendingFiles.length - MAX_LISTED_FILES} more`);
  }
  if (pendingMemories.length) {
    reminderLines.push('', 'Memories saved in this session and not reflected in the bundle:');
    reminderLines.push(...pendingMemories.map((pendingMemory) => `  - ${pendingMemory.name}`));
    reminderLines.push('If they hold project knowledge (business facts, how an asset works, analysis findings, decisions), move it to the matching concept; working preferences stay in memory.');
  }
  reminderLines.push('', ...buildMaintenanceRules(bundleRelativePath, specVersion));
  reminderLines.push('If nothing documented is affected, say so in one line and finish; you will not be asked again for this same set of changes.');
  return reminderLines.join('\n');
}

export default {
  id: MODULE_ID,
  event: 'Stop',
  feature: 'okf',
  description: 'Asks to update the OKF bundle when the session changed files or saved memories after its last update.',
  run({ hookInput, config, projectRoot, environment, homeDirectory }) {
    if (hookInput.stop_hook_active) return allowDecision();
    const bundleRelativePath = config.knowledge || '.okf';
    const bundleDirectory = resolveBundleDirectory(projectRoot, config);
    const indexText = readBundleIndex(bundleDirectory);
    if (indexText === null) return allowDecision();

    const stateDirectory = resolveStateDirectory(environment);
    const baseHeadPath = sessionStatePath(stateDirectory, hookInput.session_id, projectRoot, 'base');
    let baseHead = readStateText(baseHeadPath);
    if (!baseHead) {
      // Session started outside this repo: from now on, the current HEAD is the baseline.
      baseHead = readGitHead(projectRoot);
      if (!baseHead) return allowDecision();
      writeStateText(baseHeadPath, baseHead);
    }
    const sessionStartMilliseconds = stateModifiedMilliseconds(baseHeadPath);
    const bundleUpdatedMilliseconds = newestModificationMilliseconds(bundleDirectory);

    const pendingFiles = listSessionChangedFiles(projectRoot, baseHead, bundleRelativePath)
      .map((changedPath) => {
        const absolutePath = join(projectRoot, changedPath);
        // A deleted file has no mtime: it counts as changed now.
        const modifiedMilliseconds = existsSync(absolutePath) ? statSync(absolutePath).mtimeMs : Date.now();
        return { path: changedPath, modifiedMilliseconds };
      })
      .filter((pendingFile) => pendingFile.modifiedMilliseconds > bundleUpdatedMilliseconds);
    const pendingMemories = listRecentMemories(
      memoryDirectoriesFor([hookInput.cwd, projectRoot], homeDirectory),
      sessionStartMilliseconds,
      bundleUpdatedMilliseconds,
    );
    if (!pendingFiles.length && !pendingMemories.length) return allowDecision();

    const pendingSignature = [...pendingFiles.map((pendingFile) => `${pendingFile.path}:${Math.floor(pendingFile.modifiedMilliseconds)}`),
      ...pendingMemories.map((pendingMemory) => `${pendingMemory.name}:${Math.floor(pendingMemory.modifiedMilliseconds)}`)].sort().join('\n');
    const remindedPath = sessionStatePath(stateDirectory, hookInput.session_id, projectRoot, 'reminded');
    const pendingFingerprint = shortHash(pendingSignature);
    if (readStateText(remindedPath) === pendingFingerprint) return allowDecision();
    writeStateText(remindedPath, pendingFingerprint);

    const specVersion = readBundleSpecVersion(indexText);
    return blockDecision(MODULE_ID, buildUpkeepReminder(bundleRelativePath, specVersion, pendingFiles, pendingMemories));
  },
};
