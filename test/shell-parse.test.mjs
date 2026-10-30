import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenizeShell, splitSimpleCommands, hasShortFlag } from '../src/core/shell-parse.mjs';

test('tokenizer keeps quoted text together and splits separators', () => {
  assert.deepEqual(tokenizeShell(`git commit -m "fix: a && b" && git push`), ['git', 'commit', '-m', 'fix: a && b', '&&', 'git', 'push']);
  assert.deepEqual(tokenizeShell(`echo 'it''s'`), ['echo', 'its']);
});

test('splits chained commands and strips env assignments and wrappers', () => {
  const simpleCommands = splitSimpleCommands('cd app; DEBUG=1 sudo -u deploy git status | cat');
  assert.deepEqual(simpleCommands.map((simpleCommand) => simpleCommand.text), ['cd app', 'git status', 'cat']);
});

test('unwraps bash -c scripts', () => {
  const simpleCommands = splitSimpleCommands(`bash -lc "git fetch && git reset --hard origin/main"`);
  assert.deepEqual(simpleCommands.map((simpleCommand) => simpleCommand.text), ['git fetch', 'git reset --hard origin/main']);
});

test('short flags are found inside bundles', () => {
  assert.equal(hasShortFlag(['-rf', 'dir'], 'r'), true);
  assert.equal(hasShortFlag(['-m', 'message with -r inside'], 'r'), false);
});
