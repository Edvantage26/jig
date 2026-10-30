// Loads and validates the per-repo contract, `.claude/harness.json`.
// The JSON schema in schema/harness.schema.json describes the same rules for editors; this
// validator is hand-written so jig keeps zero dependencies. test/config.test.mjs checks that
// both agree on the shipped templates.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const CONFIG_RELATIVE_PATH = join('.claude', 'harness.json');
export const SUPPORTED_CONFIG_VERSION = 1;
export const PROFILES = ['minimal', 'service', 'product'];

const KNOWN_TOP_LEVEL_FIELDS = new Set(['$schema', 'version', 'profile', 'trunk', 'verify', 'knowledge', 'modules']);

const DEFAULT_CONFIG = {
  version: SUPPORTED_CONFIG_VERSION,
  profile: 'minimal',
  trunk: 'main',
  verify: [],
  knowledge: null,
  modules: {},
};

// Claude Code exports CLAUDE_PROJECT_DIR to hooks; the hook input carries `cwd` as a fallback.
export function resolveProjectRoot(hookInput = {}, environment = process.env) {
  return resolve(environment.CLAUDE_PROJECT_DIR || hookInput.cwd || process.cwd());
}

export function validateHarnessConfig(rawConfig, knownModuleIds = []) {
  const validationErrors = [];
  if (rawConfig === null || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
    return ['the file must contain a JSON object'];
  }
  for (const fieldName of Object.keys(rawConfig)) {
    if (!KNOWN_TOP_LEVEL_FIELDS.has(fieldName)) validationErrors.push(`unknown field "${fieldName}"`);
  }
  if (rawConfig.version !== undefined && rawConfig.version !== SUPPORTED_CONFIG_VERSION) {
    validationErrors.push(`"version" must be ${SUPPORTED_CONFIG_VERSION}`);
  }
  if (rawConfig.profile !== undefined && !PROFILES.includes(rawConfig.profile)) {
    validationErrors.push(`"profile" must be one of: ${PROFILES.join(', ')}`);
  }
  if (rawConfig.trunk !== undefined && (typeof rawConfig.trunk !== 'string' || !rawConfig.trunk.trim())) {
    validationErrors.push('"trunk" must be a non-empty string');
  }
  if (rawConfig.verify !== undefined) {
    const isListOfCommands = Array.isArray(rawConfig.verify)
      && rawConfig.verify.every((verifyCommand) => typeof verifyCommand === 'string' && verifyCommand.trim());
    if (!isListOfCommands) validationErrors.push('"verify" must be a list of non-empty command strings');
  }
  if (rawConfig.knowledge !== undefined && rawConfig.knowledge !== null && typeof rawConfig.knowledge !== 'string') {
    validationErrors.push('"knowledge" must be a path string or null');
  }
  if (rawConfig.modules !== undefined) {
    if (rawConfig.modules === null || typeof rawConfig.modules !== 'object' || Array.isArray(rawConfig.modules)) {
      validationErrors.push('"modules" must be an object keyed by module id');
    } else {
      for (const [moduleId, moduleSetting] of Object.entries(rawConfig.modules)) {
        if (knownModuleIds.length && !knownModuleIds.includes(moduleId)) {
          validationErrors.push(`unknown module "${moduleId}" (known: ${knownModuleIds.join(', ')})`);
        }
        const isBoolean = typeof moduleSetting === 'boolean';
        const isOptionsObject = moduleSetting !== null && typeof moduleSetting === 'object' && !Array.isArray(moduleSetting);
        if (!isBoolean && !isOptionsObject) {
          validationErrors.push(`"modules.${moduleId}" must be true, false or an options object`);
        } else if (isOptionsObject && moduleSetting.enabled !== undefined && typeof moduleSetting.enabled !== 'boolean') {
          validationErrors.push(`"modules.${moduleId}.enabled" must be true or false`);
        }
      }
    }
  }
  return validationErrors;
}

// status: 'missing' (jig stays inactive), 'invalid' (errors listed), 'ok' (config merged with defaults).
export function loadHarnessConfig(projectRoot, knownModuleIds = []) {
  const configPath = join(projectRoot, CONFIG_RELATIVE_PATH);
  if (!existsSync(configPath)) return { status: 'missing', configPath };
  let rawConfig;
  try {
    rawConfig = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (parseError) {
    return { status: 'invalid', configPath, errors: [`not valid JSON: ${parseError.message}`] };
  }
  const validationErrors = validateHarnessConfig(rawConfig, knownModuleIds);
  if (validationErrors.length) return { status: 'invalid', configPath, errors: validationErrors };
  return { status: 'ok', configPath, config: { ...DEFAULT_CONFIG, ...rawConfig, modules: { ...rawConfig.modules } } };
}

// A module runs when the profile includes it, unless the repo turns it off, or when the repo
// turns it on explicitly in a profile that does not include it.
export function isModuleEnabled(moduleDefinition, config) {
  const moduleSetting = config.modules?.[moduleDefinition.id];
  if (moduleSetting === false) return false;
  if (moduleSetting === true) return true;
  if (moduleSetting && typeof moduleSetting.enabled === 'boolean') return moduleSetting.enabled;
  return moduleDefinition.profiles.includes(config.profile);
}

export function getModuleOptions(moduleId, config) {
  const moduleSetting = config.modules?.[moduleId];
  if (!moduleSetting || typeof moduleSetting !== 'object') return {};
  const { enabled: ignoredEnabledFlag, ...moduleOptions } = moduleSetting;
  return moduleOptions;
}
