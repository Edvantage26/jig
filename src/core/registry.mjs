// Every jig module, in one list. A module is:
//   { id, event, profiles, description, toolNames?, run(moduleContext) -> decision }
// `toolNames` (PreToolUse/PostToolUse only) limits the module to those tools; omit it to see all.
// Adding a module means adding it here; hooks/hooks.json does not change.

import briefContext from '../context/brief.mjs';
import dangerGuard from '../guards/danger.mjs';

export const ALL_MODULES = [briefContext, dangerGuard];

export const KNOWN_MODULE_IDS = ALL_MODULES.map((moduleDefinition) => moduleDefinition.id);

export function modulesForEvent(eventName, toolName, candidateModules = ALL_MODULES) {
  return candidateModules.filter((moduleDefinition) => moduleDefinition.event === eventName
    && (!moduleDefinition.toolNames || moduleDefinition.toolNames.includes(toolName)));
}
