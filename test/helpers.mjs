import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Creates a throwaway project directory, optionally with a .claude/jig.json.
export function createTemporaryProject(jigConfig) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'jig-test-'));
  if (jigConfig !== undefined) {
    mkdirSync(join(projectRoot, '.claude'), { recursive: true });
    const configText = typeof jigConfig === 'string' ? jigConfig : JSON.stringify(jigConfig);
    writeFileSync(join(projectRoot, '.claude', 'jig.json'), configText);
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
