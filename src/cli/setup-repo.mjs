// Writes the per-repo harness: .claude/harness.json (features and contract) and
// .claude/settings.json (enables jig for whoever opens the repo). Both files are merged with what
// already exists, so running it again only changes what the person chose.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { FEATURES, KNOWN_FEATURE_IDS, isFeatureEnabled } from '../core/features.mjs';
import { validateHarnessConfig, SUPPORTED_CONFIG_VERSION } from '../core/config.mjs';
import { KNOWN_MODULE_IDS } from '../core/registry.mjs';

export const SCHEMA_URL = 'https://raw.githubusercontent.com/Edvantage26/jig/main/schema/harness.schema.json';
export const JIG_PLUGIN_ID = 'jig@jig';
export const JIG_MARKETPLACE = { source: { source: 'github', repo: 'Edvantage26/jig' } };

function readJsonFile(filePath) {
  return existsSync(filePath) ? JSON.parse(readFileSync(filePath, 'utf8')) : null;
}

function writeJsonFile(filePath, jsonValue) {
  writeFileSync(filePath, `${JSON.stringify(jsonValue, null, 2)}\n`);
}

function runGit(repoRoot, gitArguments) {
  try {
    return execFileSync('git', ['-C', repoRoot, ...gitArguments], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

export function findRepoRoot(startDirectory) {
  return runGit(startDirectory, ['rev-parse', '--show-toplevel']) || startDirectory;
}

// origin/HEAD when the clone knows it, else main or master if present, else the current branch.
export function detectTrunkBranch(repoRoot) {
  const originHead = runGit(repoRoot, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  if (originHead) return originHead.replace(/^origin\//, '');
  for (const candidateBranch of ['main', 'master']) {
    if (runGit(repoRoot, ['rev-parse', '--verify', '--quiet', `refs/heads/${candidateBranch}`])) return candidateBranch;
  }
  return runGit(repoRoot, ['branch', '--show-current']) || 'main';
}

// Another enabled plugin that also ships OKF skills (e.g. a standalone `okf@...`) would duplicate
// /okf:* and /jig:* in this repo, so jig switches it off here when the okf feature is on.
export function findOtherOkfPlugins(userSettings) {
  return Object.entries(userSettings?.enabledPlugins || {})
    .filter(([pluginId, isEnabled]) => isEnabled && /^okf@/.test(pluginId))
    .map(([pluginId]) => pluginId);
}

export function describeRepo(repoRoot) {
  const harnessConfig = readJsonFile(join(repoRoot, '.claude', 'harness.json'));
  const knowledgePath = harnessConfig?.knowledge || '.okf';
  return {
    repoRoot,
    hasHarness: harnessConfig !== null,
    trunk: harnessConfig?.trunk || detectTrunkBranch(repoRoot),
    knowledge: knowledgePath,
    hasKnowledgeBundle: existsSync(join(repoRoot, knowledgePath, 'index.md')),
    features: FEATURES.filter((featureDefinition) => !featureDefinition.alwaysOn).map((featureDefinition) => ({
      id: featureDefinition.id,
      title: featureDefinition.title,
      description: featureDefinition.description,
      enabledByDefault: featureDefinition.enabledByDefault,
      enabled: harnessConfig ? isFeatureEnabled(featureDefinition.id, { features: harnessConfig.features || {} }) : featureDefinition.enabledByDefault,
    })),
  };
}

export function setupRepo(repoRoot, { enabledFeatureIds, verifyCommands, knowledgePath, userSettingsPath = join(homedir(), '.claude', 'settings.json') }) {
  const unknownFeatureIds = enabledFeatureIds.filter((featureId) => !KNOWN_FEATURE_IDS.includes(featureId));
  if (unknownFeatureIds.length) throw new Error(`unknown features: ${unknownFeatureIds.join(', ')}`);
  const claudeDirectory = join(repoRoot, '.claude');
  mkdirSync(claudeDirectory, { recursive: true });

  const harnessPath = join(claudeDirectory, 'harness.json');
  const existingHarness = readJsonFile(harnessPath) || {};
  const selectableFeatureIds = FEATURES.filter((featureDefinition) => !featureDefinition.alwaysOn).map((featureDefinition) => featureDefinition.id);
  const chosenFeatures = Object.fromEntries(selectableFeatureIds.map((featureId) => [featureId, enabledFeatureIds.includes(featureId)]));
  const harnessConfig = {
    $schema: SCHEMA_URL,
    version: SUPPORTED_CONFIG_VERSION,
    ...existingHarness,
    features: chosenFeatures,
    trunk: existingHarness.trunk || detectTrunkBranch(repoRoot),
    verify: verifyCommands ?? existingHarness.verify ?? [],
    knowledge: knowledgePath || existingHarness.knowledge || '.okf',
  };
  const validationErrors = validateHarnessConfig(harnessConfig, KNOWN_MODULE_IDS);
  if (validationErrors.length) throw new Error(`resulting harness.json is invalid: ${validationErrors.join('; ')}`);
  writeJsonFile(harnessPath, harnessConfig);

  const settingsPath = join(claudeDirectory, 'settings.json');
  const projectSettings = readJsonFile(settingsPath) || {};
  projectSettings.extraKnownMarketplaces = { ...projectSettings.extraKnownMarketplaces, jig: JIG_MARKETPLACE };
  projectSettings.enabledPlugins = { ...projectSettings.enabledPlugins, [JIG_PLUGIN_ID]: true };
  const disabledPlugins = [];
  if (chosenFeatures.okf) {
    for (const otherPluginId of findOtherOkfPlugins(readJsonFile(userSettingsPath))) {
      projectSettings.enabledPlugins[otherPluginId] = false;
      disabledPlugins.push(otherPluginId);
    }
  }
  writeJsonFile(settingsPath, projectSettings);

  return {
    harnessPath,
    settingsPath,
    features: chosenFeatures,
    trunk: harnessConfig.trunk,
    knowledge: harnessConfig.knowledge,
    hasKnowledgeBundle: existsSync(join(repoRoot, harnessConfig.knowledge, 'index.md')),
    disabledPlugins,
  };
}
