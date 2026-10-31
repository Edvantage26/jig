// brief: tells the agent, once per session, which harness this repo runs, so it knows the rules
// before it acts instead of discovering them when a guard stops it.

import { contextDecision } from '../core/hook-io.mjs';
import { FEATURES, isFeatureEnabled } from '../core/features.mjs';

const MODULE_ID = 'brief';

export function buildHarnessBrief(config, enabledModules) {
  const activeFeatures = FEATURES.filter((featureDefinition) => !featureDefinition.alwaysOn && isFeatureEnabled(featureDefinition.id, config));
  const briefLines = [
    `jig harness is active in this repo (protected branch: ${config.trunk}).`,
  ];
  if (activeFeatures.length) {
    briefLines.push('Features enabled in .claude/jig.json:');
    for (const featureDefinition of activeFeatures) briefLines.push(`- ${featureDefinition.id}: ${featureDefinition.description}`);
  }
  const hookModules = enabledModules.filter((moduleDefinition) => moduleDefinition.id !== MODULE_ID);
  if (hookModules.length) briefLines.push(`Hooks enforcing them: ${hookModules.map((moduleDefinition) => moduleDefinition.id).join(', ')}.`);
  if (config.verify.length) {
    briefLines.push(`Before saying a change is done, run: ${config.verify.map((verifyCommand) => `\`${verifyCommand}\``).join(', ')}.`);
  }
  briefLines.push('When a jig hook asks or refuses, follow its reason; do not work around it.');
  return briefLines.join('\n');
}

export default {
  id: MODULE_ID,
  event: 'SessionStart',
  feature: 'core',
  description: 'Summarizes the active harness for the agent at session start.',
  run({ config, enabledModules }) {
    return contextDecision(MODULE_ID, buildHarnessBrief(config, enabledModules));
  },
};
