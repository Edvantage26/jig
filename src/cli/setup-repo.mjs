// Writes the per-repo harness: .claude/harness.json (features and contract) and
// .claude/settings.json (enables jig for whoever opens the repo). Both files are merged with what
// already exists, so running it again only changes what the person chose.
// Overrides that only make sense on this machine (switching off the person's own standalone OKF
// plugin) go to .claude/settings.local.json, which is personal and kept out of git.

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

// Makes sure the repo itself ignores .claude/settings.local.json before jig writes into it.
// A rule from the person's global git excludes does not count: a teammate's clone would not have it.
export function ensureLocalSettingsIgnored(repoRoot) {
  const ignoreMatch = runGit(repoRoot, ['check-ignore', '-v', '.claude/settings.local.json']);
  const ignoreSourcePath = ignoreMatch.split(':')[0];
  const isIgnoredByRepoRule = Boolean(ignoreSourcePath) && !ignoreSourcePath.startsWith('/') && !ignoreSourcePath.startsWith('.git/');
  if (isIgnoredByRepoRule) return false;
  const gitignorePath = join(repoRoot, '.gitignore');
  const gitignoreText = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : '';
  const separator = gitignoreText && !gitignoreText.endsWith('\n') ? '\n' : '';
  appendFileSync(gitignorePath, `${separator}.claude/settings.local.json\n`);
  return true;
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
  writeJsonFile(settingsPath, projectSettings);

  const disabledPlugins = chosenFeatures.okf ? findOtherOkfPlugins(readJsonFile(userSettingsPath)) : [];
  const localSettingsPath = join(claudeDirectory, 'settings.local.json');
  let gitignoreUpdated = false;
  if (disabledPlugins.length) {
    gitignoreUpdated = ensureLocalSettingsIgnored(repoRoot);
    const localSettings = readJsonFile(localSettingsPath) || {};
    localSettings.enabledPlugins = { ...localSettings.enabledPlugins };
    for (const otherPluginId of disabledPlugins) localSettings.enabledPlugins[otherPluginId] = false;
    writeJsonFile(localSettingsPath, localSettings);
  }

  return {
    harnessPath,
    settingsPath,
    localSettingsPath: disabledPlugins.length ? localSettingsPath : null,
    gitignoreUpdated,
    features: chosenFeatures,
    trunk: harnessConfig.trunk,
    knowledge: harnessConfig.knowledge,
    hasKnowledgeBundle: existsSync(join(repoRoot, harnessConfig.knowledge, 'index.md')),
    disabledPlugins,
  };
}
