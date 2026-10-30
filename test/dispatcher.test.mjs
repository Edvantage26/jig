import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runHookEvent } from '../src/core/dispatcher.mjs';
import { ALL_MODULES } from '../src/core/registry.mjs';
import { allowDecision, askDecision } from '../src/core/hook-io.mjs';
import { createTemporaryProject, bashPayload } from './helpers.mjs';

const quietOptions = { environment: {}, reportInternalError: () => {} };

test('without harness.json jig only leaves a one-line note at session start', () => {
  const projectRoot = createTemporaryProject();
  const sessionOutput = runHookEvent('SessionStart', { cwd: projectRoot }, quietOptions);
  assert.match(sessionOutput.hookSpecificOutput.additionalContext, /inactive/);
  assert.equal(runHookEvent('PreToolUse', bashPayload(projectRoot, 'git reset --hard'), quietOptions), null);
});

test('an invalid harness.json deactivates jig and says why', () => {
  const projectRoot = createTemporaryProject({ profile: 'huge' });
  const sessionOutput = runHookEvent('SessionStart', { cwd: projectRoot }, quietOptions);
  assert.match(sessionOutput.hookSpecificOutput.additionalContext, /invalid.*profile/);
  assert.equal(runHookEvent('PreToolUse', bashPayload(projectRoot, 'git reset --hard'), quietOptions), null);
});

test('a dangerous command produces a PreToolUse ask with the reason', () => {
  const projectRoot = createTemporaryProject({ profile: 'minimal' });
  const hookOutput = runHookEvent('PreToolUse', bashPayload(projectRoot, 'git reset --hard'), quietOptions);
  assert.equal(hookOutput.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(hookOutput.hookSpecificOutput.permissionDecision, 'ask');
  assert.match(hookOutput.hookSpecificOutput.permissionDecisionReason, /^jig\/danger:/);
});

test('a safe command produces no output', () => {
  const projectRoot = createTemporaryProject({ profile: 'minimal' });
  assert.equal(runHookEvent('PreToolUse', bashPayload(projectRoot, 'ls -la'), quietOptions), null);
});

test('a module switched off in harness.json does not run', () => {
  const projectRoot = createTemporaryProject({ modules: { danger: false } });
  assert.equal(runHookEvent('PreToolUse', bashPayload(projectRoot, 'git reset --hard'), quietOptions), null);
});

test('session brief describes profile, guards, verify and knowledge', () => {
  const projectRoot = createTemporaryProject({ profile: 'service', verify: ['npm test'], knowledge: '.okf' });
  const briefText = runHookEvent('SessionStart', { cwd: projectRoot }, quietOptions).hookSpecificOutput.additionalContext;
  assert.match(briefText, /profile: service/);
  assert.match(briefText, /- danger:/);
  assert.match(briefText, /`npm test`/);
  assert.match(briefText, /\.okf\//);
});

test('a failing module fails open and the others still decide', () => {
  const projectRoot = createTemporaryProject({ profile: 'minimal' });
  const reportedErrors = [];
  const brokenModule = { id: 'broken', event: 'PreToolUse', profiles: ['minimal'], run() { throw new Error('boom'); } };
  const askingModule = { id: 'asker', event: 'PreToolUse', profiles: ['minimal'], run: () => askDecision('asker', 'confirm please') };
  const hookOutput = runHookEvent('PreToolUse', bashPayload(projectRoot, 'ls'), {
    environment: {},
    availableModules: [brokenModule, askingModule],
    reportInternalError: (errorMessage) => reportedErrors.push(errorMessage),
  });
  assert.equal(hookOutput.hookSpecificOutput.permissionDecision, 'ask');
  assert.match(reportedErrors[0], /broken failed/);
});

test('deny wins over ask when modules disagree', () => {
  const projectRoot = createTemporaryProject({ profile: 'minimal' });
  const hookOutput = runHookEvent('PreToolUse', bashPayload(projectRoot, 'git reset --hard && rm -rf /'), quietOptions);
  assert.equal(hookOutput.hookSpecificOutput.permissionDecision, 'deny');
});

test('CLAUDE_PROJECT_DIR takes precedence over the input cwd', () => {
  const configuredProject = createTemporaryProject({ modules: { danger: false } });
  const otherDirectory = createTemporaryProject({ profile: 'minimal' });
  const hookOutput = runHookEvent('PreToolUse', bashPayload(otherDirectory, 'git reset --hard'), {
    environment: { CLAUDE_PROJECT_DIR: configuredProject },
    reportInternalError: () => {},
  });
  assert.equal(hookOutput, null);
});

test('registry modules all declare the required fields', () => {
  for (const moduleDefinition of ALL_MODULES) {
    assert.ok(moduleDefinition.id && moduleDefinition.event && moduleDefinition.description, moduleDefinition.id);
    assert.ok(Array.isArray(moduleDefinition.profiles) && moduleDefinition.profiles.length, moduleDefinition.id);
    assert.equal(typeof moduleDefinition.run, 'function');
  }
  assert.equal(allowDecision().kind, 'allow');
});
