// brief: tells the agent, once per session, which harness this repo runs, so it knows the rules
// before it acts instead of discovering them when a guard stops it.

import { contextDecision } from '../core/hook-io.mjs';

const MODULE_ID = 'brief';

export function buildHarnessBrief(config, enabledModules) {
  const guardModules = enabledModules.filter((moduleDefinition) => moduleDefinition.id !== MODULE_ID);
  const briefLines = [
    `jig harness is active in this repo (profile: ${config.profile}, protected branch: ${config.trunk}).`,
  ];
  if (guardModules.length) {
    briefLines.push('Enforced by hooks:');
    for (const moduleDefinition of guardModules) briefLines.push(`- ${moduleDefinition.id}: ${moduleDefinition.description}`);
  }
  if (config.verify.length) {
    briefLines.push(`Before saying a change is done, run: ${config.verify.map((verifyCommand) => `\`${verifyCommand}\``).join(', ')}.`);
  }
  if (config.knowledge) {
    briefLines.push(`Project knowledge lives in \`${config.knowledge}/\`: read its index.md before working, and update it when you change something it documents.`);
  }
  briefLines.push('When a jig hook asks or refuses, follow its reason; do not work around it.');
  return briefLines.join('\n');
}

export default {
  id: MODULE_ID,
  event: 'SessionStart',
  profiles: ['minimal', 'service', 'product'],
  description: 'Summarizes the active harness for the agent at session start.',
  run({ config, enabledModules }) {
    return contextDecision(MODULE_ID, buildHarnessBrief(config, enabledModules));
  },
};
