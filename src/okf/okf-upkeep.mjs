// okf-upkeep (Stop, feature `okf`): stops the agent from finishing while
//   1. this session left knowledge newer than the last bundle update (repo files changed after the
//      bundle was last touched, or project memories written in the session), asked once per set of
//      pending changes; or
//   2. the bundle was touched in this session and the OKF validator reports ERRORS. The hook runs
//      the validator itself, because asking the agent to validate proved unreliable in field tests.
//      Warnings never block; a missing python3 fails open.

import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allowDecision, blockDecision } from '../core/hook-io.mjs';
import {
  resolveStateDirectory, sessionStatePath, readStateText, writeStateText, stateModifiedMilliseconds, shortHash,
} from '../core/session-state.mjs';
import {
  resolveBundleDirectory, readBundleIndex, readBundleSpecVersion, newestModificationMilliseconds, buildMaintenanceRules,
} from './okf-bundle.mjs';
import { readGitHead } from './okf-index.mjs';

const MODULE_ID = 'okf-upkeep';
const BUNDLED_VALIDATOR_SCRIPT = fileURLToPath(new URL('../../packs/okf/skills/validate/scripts/okf_validate.py', import.meta.url));
const VALIDATOR_TIMEOUT_MILLISECONDS = 10000;
const MAX_VALIDATION_BLOCKS_PER_SESSION = 3;
const MAX_LISTED_ERRORS = 15;
const MAX_LISTED_FILES = 20;
// Harness configuration is not project knowledge: editing it never asks for a concept update.
const IGNORED_PATHS = new Set(['.claude/settings.json', '.claude/settings.local.json', '.claude/jig.json']);

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

const MEMORY_WRITING_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

// Memory files this session wrote, read from its own transcript (Write/Edit tool calls). Returns
// null when the transcript is not available, so the caller can fall back to the frontmatter.
// Transcripts grow to tens of MB, so the scan is incremental: `scanState` keeps the byte offset
// already read and the paths found, and each call only reads what was appended since.
export function listMemoryFilesWrittenBySession(transcriptPath, memoryDirectories, scanState = { offset: 0, paths: [] }) {
  if (!transcriptPath || !existsSync(transcriptPath)) return null;
  const writtenMemoryPaths = new Set(scanState.paths);
  const transcriptSize = statSync(transcriptPath).size;
  const startOffset = scanState.offset <= transcriptSize ? scanState.offset : 0;
  const transcriptDescriptor = openSync(transcriptPath, 'r');
  let appendedText;
  try {
    const appendedBytes = Buffer.alloc(transcriptSize - startOffset);
    readSync(transcriptDescriptor, appendedBytes, 0, appendedBytes.length, startOffset);
    appendedText = appendedBytes.toString('utf8');
  } finally {
    closeSync(transcriptDescriptor);
  }
  // Only complete lines are read; a line still being written is picked up next time.
  const lastNewlineIndex = appendedText.lastIndexOf('\n');
  const completeText = lastNewlineIndex >= 0 ? appendedText.slice(0, lastNewlineIndex + 1) : '';
  for (const memoryDirectory of memoryDirectories) {
    let matchIndex = completeText.indexOf(memoryDirectory);
    while (matchIndex >= 0) {
      const lineStart = completeText.lastIndexOf('\n', matchIndex) + 1;
      const lineEnd = completeText.indexOf('\n', matchIndex);
      try {
        const transcriptEvent = JSON.parse(completeText.slice(lineStart, lineEnd));
        for (const contentBlock of transcriptEvent?.message?.content || []) {
          const writtenPath = contentBlock?.input?.file_path;
          if (contentBlock?.type === 'tool_use' && MEMORY_WRITING_TOOLS.has(contentBlock.name) && typeof writtenPath === 'string') writtenMemoryPaths.add(writtenPath);
        }
      } catch {
        // Not a JSON event line: ignore.
      }
      matchIndex = completeText.indexOf(memoryDirectory, lineEnd);
    }
  }
  scanState.offset = startOffset + Buffer.byteLength(completeText, 'utf8');
  scanState.paths = [...writtenMemoryPaths];
  return writtenMemoryPaths;
}

function readMemoryOriginSession(memoryFilePath) {
  const frontmatterMatch = /^---\n([\s\S]*?)\n---/.exec(readFileSync(memoryFilePath, 'utf8'));
  const originMatch = frontmatterMatch && /^\s*originSessionId:\s*['"]?([\w-]+)['"]?\s*$/m.exec(frontmatterMatch[1]);
  return originMatch ? originMatch[1] : null;
}

// Only memories this session wrote count: other sessions open on the same repo write to the same
// memory folder, and their knowledge is theirs to move to the bundle. The transcript says which
// files this session wrote; without it, the frontmatter's originSessionId decides.
function listRecentMemories(memoryDirectories, sessionStartMilliseconds, bundleUpdatedMilliseconds, sessionId, transcriptPath, scanStatePath) {
  const recentMemories = [];
  let scanState = { offset: 0, paths: [] };
  try {
    scanState = { ...scanState, ...JSON.parse(readStateText(scanStatePath) || '{}') };
  } catch {
    // Corrupt state: rescan from the start.
  }
  const sessionWrittenMemoryPaths = listMemoryFilesWrittenBySession(transcriptPath, memoryDirectories, scanState);
  if (sessionWrittenMemoryPaths) writeStateText(scanStatePath, JSON.stringify(scanState));
  for (const memoryDirectory of memoryDirectories) {
    if (!existsSync(memoryDirectory)) continue;
    for (const memoryFileName of readdirSync(memoryDirectory)) {
      if (!memoryFileName.endsWith('.md') || memoryFileName === 'MEMORY.md') continue;
      const memoryFilePath = join(memoryDirectory, memoryFileName);
      const isWrittenBySession = sessionWrittenMemoryPaths
        ? sessionWrittenMemoryPaths.has(memoryFilePath)
        : readMemoryOriginSession(memoryFilePath) === sessionId;
      if (!isWrittenBySession) continue;
      const memoryMilliseconds = statSync(memoryFilePath).mtimeMs;
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
    reminderLines.push(...pendingFiles.slice(0, MAX_LISTED_FILES).map((pendingFile) => `  - ${pendingFile.path}${pendingFile.isDeleted ? ' (deleted)' : ''}`));
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

// Runs the bundled OKF validator. Returns { ran: true, errors } or { ran: false, reason }.
// JIG_PYTHON / JIG_OKF_VALIDATOR override the interpreter and the script (used by tests).
export function runBundleValidator(bundleDirectory, environment = process.env) {
  const pythonCommand = environment.JIG_PYTHON || 'python3';
  const validatorScript = environment.JIG_OKF_VALIDATOR || BUNDLED_VALIDATOR_SCRIPT;
  let validatorOutput;
  try {
    validatorOutput = execFileSync(pythonCommand, [validatorScript, bundleDirectory, '--json'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: VALIDATOR_TIMEOUT_MILLISECONDS,
    });
  } catch (validatorFailure) {
    // The validator exits non-zero when the bundle has errors; its JSON is still on stdout.
    validatorOutput = validatorFailure.stdout;
    if (!validatorOutput) return { ran: false, reason: validatorFailure.code === 'ENOENT' ? `${pythonCommand} not found` : String(validatorFailure.message).split('\n')[0] };
  }
  try {
    const validationReport = JSON.parse(validatorOutput);
    return { ran: true, errors: Array.isArray(validationReport.errors) ? validationReport.errors : [] };
  } catch {
    return { ran: false, reason: 'validator output is not JSON' };
  }
}

export function buildValidationReminder(bundleRelativePath, validationErrors) {
  return [
    `OKF: the bundle at ${bundleRelativePath}/ was changed in this session and the validator reports ${validationErrors.length} ERROR(s) (warnings are not shown and do not block):`,
    ...validationErrors.slice(0, MAX_LISTED_ERRORS).map((validationError) => `  - ${validationError}`),
    ...(validationErrors.length > MAX_LISTED_ERRORS ? [`  - ... and ${validationErrors.length - MAX_LISTED_ERRORS} more (run /jig:validate ${bundleRelativePath})`] : []),
    'Fix every error, then finish.',
  ].join('\n');
}

function checkBundleValidity({ hookInput, projectRoot, stateDirectory, bundleDirectory, bundleRelativePath, environment }) {
  const validation = runBundleValidator(bundleDirectory, environment);
  if (!validation.ran) {
    process.stderr.write(`jig: okf-upkeep could not validate ${bundleRelativePath}: ${validation.reason}\n`);
    return allowDecision();
  }
  if (!validation.errors.length) return allowDecision();
  // Never loop: the same errors are reported once, and at most a few times per session overall.
  const validatedPath = sessionStatePath(stateDirectory, hookInput.session_id, projectRoot, 'validated');
  const [previousFingerprint, previousCountText] = (readStateText(validatedPath) || '').split(':');
  const previousCount = Number(previousCountText) || 0;
  const errorsFingerprint = shortHash(validation.errors.join('\n'));
  if (errorsFingerprint === previousFingerprint || previousCount >= MAX_VALIDATION_BLOCKS_PER_SESSION) return allowDecision();
  writeStateText(validatedPath, `${errorsFingerprint}:${previousCount + 1}`);
  return blockDecision(MODULE_ID, buildValidationReminder(bundleRelativePath, validation.errors));
}

export default {
  id: MODULE_ID,
  event: 'Stop',
  feature: 'okf',
  description: 'Asks to update the OKF bundle when the session changed files or saved memories after its last update, and validates the bundle when the session changed it.',
  run({ hookInput, config, projectRoot, environment, homeDirectory }) {
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
    const validityContext = { hookInput, projectRoot, stateDirectory, bundleDirectory, bundleRelativePath, environment };
    const bundleChangedInSession = bundleUpdatedMilliseconds >= sessionStartMilliseconds;

    // Already stopped once by a hook: no new upkeep reminder (loop guard), but the bundle the agent
    // just edited is still validated.
    if (hookInput.stop_hook_active) return bundleChangedInSession ? checkBundleValidity(validityContext) : allowDecision();

    const pendingFiles = listSessionChangedFiles(projectRoot, baseHead, bundleRelativePath)
      .map((changedPath) => {
        const absolutePath = join(projectRoot, changedPath);
        // A deleted file has no mtime: it is pending, with a fixed signature so it is asked only once.
        if (!existsSync(absolutePath)) return { path: changedPath, isDeleted: true, signature: `${changedPath}:deleted` };
        const modifiedMilliseconds = statSync(absolutePath).mtimeMs;
        return { path: changedPath, isDeleted: false, modifiedMilliseconds, signature: `${changedPath}:${Math.floor(modifiedMilliseconds)}` };
      })
      .filter((pendingFile) => pendingFile.isDeleted || pendingFile.modifiedMilliseconds > bundleUpdatedMilliseconds);
    // A deletion has no date to compare with the bundle, so it would stay pending forever and ride
    // along every later reminder: it is mentioned once per session and then dropped.
    const deletionsRemindedPath = sessionStatePath(stateDirectory, hookInput.session_id, projectRoot, 'deletions');
    const deletionsAlreadyReminded = new Set((readStateText(deletionsRemindedPath) || '').split('\n').filter(Boolean));
    const pendingFilesToRemind = pendingFiles.filter((pendingFile) => !(pendingFile.isDeleted && deletionsAlreadyReminded.has(pendingFile.path)));
    const pendingMemories = listRecentMemories(
      memoryDirectoriesFor([hookInput.cwd, projectRoot], homeDirectory),
      sessionStartMilliseconds,
      bundleUpdatedMilliseconds,
      hookInput.session_id,
      hookInput.transcript_path,
      sessionStatePath(stateDirectory, hookInput.session_id, projectRoot, 'memory-scan'),
    );
    if (!pendingFilesToRemind.length && !pendingMemories.length) return bundleChangedInSession ? checkBundleValidity(validityContext) : allowDecision();

    const pendingSignature = [...pendingFilesToRemind.map((pendingFile) => pendingFile.signature),
      ...pendingMemories.map((pendingMemory) => `${pendingMemory.name}:${Math.floor(pendingMemory.modifiedMilliseconds)}`)].sort().join('\n');
    const remindedPath = sessionStatePath(stateDirectory, hookInput.session_id, projectRoot, 'reminded');
    const pendingFingerprint = shortHash(pendingSignature);
    if (readStateText(remindedPath) === pendingFingerprint) return bundleChangedInSession ? checkBundleValidity(validityContext) : allowDecision();
    writeStateText(remindedPath, pendingFingerprint);
    const newlyRemindedDeletions = pendingFilesToRemind.filter((pendingFile) => pendingFile.isDeleted).map((pendingFile) => pendingFile.path);
    if (newlyRemindedDeletions.length) writeStateText(deletionsRemindedPath, [...deletionsAlreadyReminded, ...newlyRemindedDeletions].join('\n'));

    const specVersion = readBundleSpecVersion(indexText);
    return blockDecision(MODULE_ID, buildUpkeepReminder(bundleRelativePath, specVersion, pendingFilesToRemind, pendingMemories));
  },
};
