import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, utimesSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runHookEvent } from '../src/core/dispatcher.mjs';
import { createTemporaryProject } from './helpers.mjs';

const V01_INDEX = "---\nokf_version: '0.1'\n---\n\n# Demo bundle\n\n* [Overview](overview.md)\n";
const V02_INDEX = '---\nokf_version: "0.2"\n---\n\n# Demo bundle\n\n* [Overview](overview.md)\n';

function runGit(projectRoot, gitArguments) {
  execFileSync('git', ['-C', projectRoot, ...gitArguments], { stdio: 'ignore' });
}

function setModifiedSeconds(filePath, epochSeconds) {
  utimesSync(filePath, epochSeconds, epochSeconds);
}

// A committed repo with a bundle whose files are dated `bundleEpochSeconds`.
function createRepoWithBundle({ indexText = V02_INDEX, jigConfig = {}, bundleEpochSeconds = 1_000_000 } = {}) {
  const projectRoot = createTemporaryProject(jigConfig);
  mkdirSync(join(projectRoot, '.okf'));
  writeFileSync(join(projectRoot, '.okf', 'index.md'), indexText);
  writeFileSync(join(projectRoot, '.okf', 'overview.md'), '---\ntype: Overview\n---\nHello.\n');
  mkdirSync(join(projectRoot, 'src'));
  writeFileSync(join(projectRoot, 'src', 'app.py'), 'print(1)\n');
  runGit(projectRoot, ['init', '-q']);
  runGit(projectRoot, ['add', '.']);
  runGit(projectRoot, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init']);
  for (const bundleFile of readdirSync(join(projectRoot, '.okf'))) setModifiedSeconds(join(projectRoot, '.okf', bundleFile), bundleEpochSeconds);
  setModifiedSeconds(join(projectRoot, '.okf'), bundleEpochSeconds);
  return projectRoot;
}

function hookOptions() {
  return {
    environment: { CLAUDE_PLUGIN_DATA: mkdtempSync(join(tmpdir(), 'jig-data-')) },
    homeDirectory: mkdtempSync(join(tmpdir(), 'jig-home-')),
    reportInternalError: (errorMessage) => { throw new Error(errorMessage); },
  };
}

function startSession(projectRoot, options, sessionId = 'session-1') {
  return runHookEvent('SessionStart', { session_id: sessionId, cwd: projectRoot }, options);
}

function stopSession(projectRoot, options, extraInput = {}, sessionId = 'session-1') {
  return runHookEvent('Stop', { session_id: sessionId, cwd: projectRoot, ...extraInput }, options);
}

test('okf-index loads the bundle index with v0.2 maintenance rules', () => {
  const projectRoot = createRepoWithBundle();
  const contextText = startSession(projectRoot, hookOptions()).hookSpecificOutput.additionalContext;
  assert.match(contextText, /OKF bundle at `\.okf\/` \(spec 0\.2\)/);
  assert.match(contextText, /# Demo bundle/);
  assert.match(contextText, /generated: \{ by: claude-code\/<model>, at: <now> \}/);
  assert.match(contextText, /date -u/);
  assert.match(contextText, /\/jig:validate \.okf/);
  assert.match(contextText, /only for lifecycle events/);
  assert.doesNotMatch(contextText, /Do NOT migrate/);
});

test('a v0.1 bundle is told not to migrate on its own', () => {
  const projectRoot = createRepoWithBundle({ indexText: V01_INDEX });
  const contextText = startSession(projectRoot, hookOptions()).hookSpecificOutput.additionalContext;
  assert.match(contextText, /spec 0\.1/);
  assert.match(contextText, /Do NOT migrate the bundle on your own/);
  assert.match(contextText, /REPLACE its `timestamp:` line with `generated`/);
});

test('okf enabled without a bundle suggests creating one', () => {
  const projectRoot = createTemporaryProject({});
  const contextText = startSession(projectRoot, hookOptions()).hookSpecificOutput.additionalContext;
  assert.match(contextText, /no bundle at `\.okf\/index\.md`/);
  assert.match(contextText, /\/jig:okf/);
});

test('features.okf false turns both OKF modules off', () => {
  const projectRoot = createRepoWithBundle({ jigConfig: { features: { okf: false } } });
  const options = hookOptions();
  const contextText = startSession(projectRoot, options).hookSpecificOutput.additionalContext;
  assert.doesNotMatch(contextText, /OKF bundle/);
  writeFileSync(join(projectRoot, 'src', 'app.py'), 'print(2)\n');
  assert.equal(stopSession(projectRoot, options), null);
});

test('a custom knowledge path is honoured', () => {
  const projectRoot = createRepoWithBundle({ jigConfig: { knowledge: 'docs/kb' } });
  const contextText = startSession(projectRoot, hookOptions()).hookSpecificOutput.additionalContext;
  assert.match(contextText, /no bundle at `docs\/kb\/index\.md`/);
});

test('okf-upkeep: nothing changed, nothing asked', () => {
  const projectRoot = createRepoWithBundle();
  const options = hookOptions();
  startSession(projectRoot, options);
  assert.equal(stopSession(projectRoot, options), null);
});

test('okf-upkeep: a code change after the last bundle update blocks once', () => {
  const projectRoot = createRepoWithBundle();
  const options = hookOptions();
  startSession(projectRoot, options);
  writeFileSync(join(projectRoot, 'src', 'app.py'), 'print(2)\n');
  const firstStop = stopSession(projectRoot, options);
  assert.equal(firstStop.decision, 'block');
  assert.match(firstStop.reason, /^jig\/okf-upkeep: OKF: this session left knowledge newer/);
  assert.match(firstStop.reason, /- src\/app\.py/);
  assert.match(firstStop.reason, /you will not be asked again/);
  assert.equal(stopSession(projectRoot, options), null, 'same pending set is not asked twice');
  writeFileSync(join(projectRoot, 'src', 'new_module.py'), 'x = 1\n');
  assert.equal(stopSession(projectRoot, options).decision, 'block', 'a new change asks again');
});

test('okf-upkeep: updating the bundle after the change clears it', () => {
  const projectRoot = createRepoWithBundle();
  const options = hookOptions();
  startSession(projectRoot, options);
  writeFileSync(join(projectRoot, 'src', 'app.py'), 'print(2)\n');
  setModifiedSeconds(join(projectRoot, 'src', 'app.py'), 2_000_000);
  writeFileSync(join(projectRoot, '.okf', 'overview.md'), '---\ntype: Overview\n---\nHello, updated.\n');
  setModifiedSeconds(join(projectRoot, '.okf', 'overview.md'), 3_000_000);
  assert.equal(stopSession(projectRoot, options), null);
});

test('okf-upkeep: harness configuration files never ask', () => {
  const projectRoot = createRepoWithBundle();
  const options = hookOptions();
  startSession(projectRoot, options);
  writeFileSync(join(projectRoot, '.claude', 'settings.json'), '{}\n');
  assert.equal(stopSession(projectRoot, options), null);
});

test('okf-upkeep: stop_hook_active never blocks again', () => {
  const projectRoot = createRepoWithBundle();
  const options = hookOptions();
  startSession(projectRoot, options);
  writeFileSync(join(projectRoot, 'src', 'app.py'), 'print(2)\n');
  assert.equal(stopSession(projectRoot, options, { stop_hook_active: true }), null);
});

test('okf-upkeep: a project memory saved in the session asks to move it to the bundle', () => {
  const projectRoot = createRepoWithBundle();
  const options = hookOptions();
  startSession(projectRoot, options);
  const memoryDirectory = join(options.homeDirectory, '.claude', 'projects', projectRoot.replace(/[/.]/g, '-'), 'memory');
  mkdirSync(memoryDirectory, { recursive: true });
  writeFileSync(join(memoryDirectory, 'project_finding.md'), '---\nname: finding\n---\nA fact.\n');
  writeFileSync(join(memoryDirectory, 'MEMORY.md'), '- index\n');
  const stopOutput = stopSession(projectRoot, options);
  assert.equal(stopOutput.decision, 'block');
  assert.match(stopOutput.reason, /- project_finding\.md/);
  assert.doesNotMatch(stopOutput.reason, /- MEMORY\.md/);
});

test('okf-upkeep: a v0.1 bundle reminder keeps the no-migration rule', () => {
  const projectRoot = createRepoWithBundle({ indexText: V01_INDEX });
  const options = hookOptions();
  startSession(projectRoot, options);
  writeFileSync(join(projectRoot, 'src', 'app.py'), 'print(2)\n');
  assert.match(stopSession(projectRoot, options).reason, /Do NOT migrate the bundle on your own/);
});

test('okf-upkeep: a session that never ran SessionStart uses the current HEAD', () => {
  const projectRoot = createRepoWithBundle();
  const options = hookOptions();
  writeFileSync(join(projectRoot, 'src', 'app.py'), 'print(2)\n');
  assert.equal(stopSession(projectRoot, options).decision, 'block');
});

test('okf-upkeep: outside a git repo it fails open', () => {
  const projectRoot = createTemporaryProject({});
  mkdirSync(join(projectRoot, '.okf'));
  writeFileSync(join(projectRoot, '.okf', 'index.md'), V02_INDEX);
  const reportedErrors = [];
  const stopOutput = runHookEvent('Stop', { session_id: 's', cwd: projectRoot }, {
    ...hookOptions(),
    reportInternalError: (errorMessage) => reportedErrors.push(errorMessage),
  });
  assert.equal(stopOutput, null);
  assert.ok(existsSync(join(projectRoot, '.okf', 'index.md')));
});

const BROKEN_CONCEPT = '---\ntitle: No type here\n---\nA concept without `type` is an OKF error.\n';

test('validation: a bundle edited in the session with an ERROR blocks with the errors', () => {
  const projectRoot = createRepoWithBundle();
  const options = hookOptions();
  startSession(projectRoot, options);
  writeFileSync(join(projectRoot, '.okf', 'broken.md'), BROKEN_CONCEPT);
  const stopOutput = stopSession(projectRoot, options);
  assert.equal(stopOutput.decision, 'block');
  assert.match(stopOutput.reason, /validator reports 1 ERROR/);
  assert.match(stopOutput.reason, /broken\.md/);
  assert.equal(stopSession(projectRoot, options), null, 'the same errors are not reported twice');
});

test('validation: runs even when the agent was already stopped once (stop_hook_active)', () => {
  const projectRoot = createRepoWithBundle();
  const options = hookOptions();
  startSession(projectRoot, options);
  writeFileSync(join(projectRoot, '.okf', 'broken.md'), BROKEN_CONCEPT);
  assert.equal(stopSession(projectRoot, options, { stop_hook_active: true }).decision, 'block');
});

test('validation: v0.1 legacy warnings never block', () => {
  const projectRoot = createRepoWithBundle({ indexText: V01_INDEX });
  const options = hookOptions();
  startSession(projectRoot, options);
  writeFileSync(join(projectRoot, '.okf', 'overview.md'), "---\ntype: Overview\ntimestamp: '2026-01-01T00:00:00Z'\n---\nUpdated.\n");
  assert.equal(stopSession(projectRoot, options), null);
});

test('validation: an untouched bundle is not validated', () => {
  const projectRoot = createRepoWithBundle();
  writeFileSync(join(projectRoot, '.okf', 'broken.md'), BROKEN_CONCEPT);
  setModifiedSeconds(join(projectRoot, '.okf', 'broken.md'), 1_000_000);
  const options = hookOptions();
  startSession(projectRoot, options);
  assert.equal(stopSession(projectRoot, options), null);
});

test('validation: the upkeep reminder comes first, validation on the next stop', () => {
  const projectRoot = createRepoWithBundle();
  const options = hookOptions();
  startSession(projectRoot, options);
  writeFileSync(join(projectRoot, 'src', 'app.py'), 'print(2)\n');
  assert.match(stopSession(projectRoot, options).reason, /left knowledge newer/);
  writeFileSync(join(projectRoot, '.okf', 'broken.md'), BROKEN_CONCEPT);
  assert.match(stopSession(projectRoot, options, { stop_hook_active: true }).reason, /validator reports 1 ERROR/);
});

test('validation: at most three validation blocks per session', () => {
  const projectRoot = createRepoWithBundle();
  const options = hookOptions();
  startSession(projectRoot, options);
  for (let attemptNumber = 1; attemptNumber <= 3; attemptNumber += 1) {
    writeFileSync(join(projectRoot, '.okf', `broken-${attemptNumber}.md`), BROKEN_CONCEPT);
    assert.equal(stopSession(projectRoot, options, { stop_hook_active: true }).decision, 'block', `attempt ${attemptNumber}`);
  }
  writeFileSync(join(projectRoot, '.okf', 'broken-4.md'), BROKEN_CONCEPT);
  assert.equal(stopSession(projectRoot, options, { stop_hook_active: true }), null);
});

test('validation: without python3 it fails open', () => {
  const projectRoot = createRepoWithBundle();
  const options = hookOptions();
  options.environment.JIG_PYTHON = 'python3-that-does-not-exist';
  startSession(projectRoot, options);
  writeFileSync(join(projectRoot, '.okf', 'broken.md'), BROKEN_CONCEPT);
  assert.equal(stopSession(projectRoot, options), null);
});

test('okf-upkeep: a deleted file is asked about once, not on every stop', () => {
  const projectRoot = createRepoWithBundle();
  const options = hookOptions();
  startSession(projectRoot, options);
  execFileSync('rm', [join(projectRoot, 'src', 'app.py')]);
  const firstStop = stopSession(projectRoot, options);
  assert.equal(firstStop.decision, 'block');
  assert.match(firstStop.reason, /- src\/app\.py \(deleted\)/);
  assert.equal(stopSession(projectRoot, options), null);
  assert.equal(stopSession(projectRoot, options), null);
});

test('okf-upkeep: a deleted file does not ride along later reminders', () => {
  const projectRoot = createRepoWithBundle();
  const options = hookOptions();
  startSession(projectRoot, options);
  execFileSync('rm', [join(projectRoot, 'src', 'app.py')]);
  assert.match(stopSession(projectRoot, options).reason, /src\/app\.py \(deleted\)/);
  const memoryDirectory = join(options.homeDirectory, '.claude', 'projects', projectRoot.replace(/[/.]/g, '-'), 'memory');
  mkdirSync(memoryDirectory, { recursive: true });
  writeFileSync(join(memoryDirectory, 'project_finding.md'), '---\nname: finding\n---\nA fact.\n');
  const laterReminder = stopSession(projectRoot, options).reason;
  assert.match(laterReminder, /project_finding\.md/);
  assert.doesNotMatch(laterReminder, /app\.py/);
});
