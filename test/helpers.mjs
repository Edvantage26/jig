import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Creates a throwaway project directory, optionally with a .claude/harness.json.
export function createTemporaryProject(harnessConfig) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'jig-test-'));
  if (harnessConfig !== undefined) {
    mkdirSync(join(projectRoot, '.claude'), { recursive: true });
    const configText = typeof harnessConfig === 'string' ? harnessConfig : JSON.stringify(harnessConfig);
    writeFileSync(join(projectRoot, '.claude', 'harness.json'), configText);
  }
  return projectRoot;
}

export function bashPayload(projectRoot, commandLine) {
  return {
    session_id: 'test-session',
    hook_event_name: 'PreToolUse',
    cwd: projectRoot,
    tool_name: 'Bash',
    tool_input: { command: commandLine },
  };
}
