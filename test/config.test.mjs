import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validateHarnessConfig, loadHarnessConfig, isModuleEnabled } from '../src/core/config.mjs';
import { KNOWN_MODULE_IDS } from '../src/core/registry.mjs';
import { DANGER_RULES } from '../src/guards/danger.mjs';
import { FEATURES } from '../src/core/features.mjs';
import { createTemporaryProject } from './helpers.mjs';

const readJson = (relativePath) => JSON.parse(readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8'));

test('every shipped template is a valid contract', () => {
  for (const templateName of readdirSync(new URL('../templates/', import.meta.url)).filter((fileName) => fileName.endsWith('.json'))) {
    assert.deepEqual(validateHarnessConfig(readJson(`templates/${templateName}`), KNOWN_MODULE_IDS), [], templateName);
  }
});

test('invalid contracts are reported with a readable reason', () => {
  assert.match(validateHarnessConfig({ features: { teleport: true } }).join(), /unknown feature "teleport"/);
  assert.match(validateHarnessConfig({ features: { okf: 'yes' } }).join(), /features.okf/);
  assert.match(validateHarnessConfig({ profile: 'service' }).join(), /unknown field "profile"/);
  assert.match(validateHarnessConfig({ verify: 'npm test' }).join(), /verify/);
  assert.match(validateHarnessConfig({ modules: { nope: true } }, KNOWN_MODULE_IDS).join(), /unknown module "nope"/);
  assert.match(validateHarnessConfig({ surprise: 1 }).join(), /unknown field "surprise"/);
  assert.match(validateHarnessConfig([]).join(), /JSON object/);
});

test('load reports missing, invalid JSON and merges defaults', () => {
  assert.equal(loadHarnessConfig(createTemporaryProject()).status, 'missing');
  assert.equal(loadHarnessConfig(createTemporaryProject('{ not json')).status, 'invalid');
  const loadedConfig = loadHarnessConfig(createTemporaryProject({ features: { danger: false } }));
  assert.equal(loadedConfig.status, 'ok');
  assert.equal(loadedConfig.config.trunk, 'main');
  assert.deepEqual(loadedConfig.config.verify, []);
  assert.equal(loadedConfig.config.knowledge, '.okf');
});

test('modules follow their feature; a single module can still be switched off', () => {
  const okfModule = { id: 'okf-upkeep', feature: 'okf' };
  const coreModule = { id: 'brief', feature: 'core' };
  assert.equal(isModuleEnabled(okfModule, { features: {}, modules: {} }), true, 'okf is on by default');
  assert.equal(isModuleEnabled(okfModule, { features: { okf: false }, modules: {} }), false);
  assert.equal(isModuleEnabled(okfModule, { features: {}, modules: { 'okf-upkeep': false } }), false);
  assert.equal(isModuleEnabled(okfModule, { features: {}, modules: { 'okf-upkeep': { enabled: false } } }), false);
  assert.equal(isModuleEnabled(coreModule, { features: { core: false }, modules: {} }), true, 'core is always on');
  assert.equal(isModuleEnabled({ id: 'x', feature: 'unknown' }, { features: {}, modules: {} }), false);
});

test('schema lists every module, every user-facing feature and every danger rule', () => {
  const harnessSchema = readJson('schema/jig.schema.json');
  const selectableFeatureIds = FEATURES.filter((featureDefinition) => !featureDefinition.alwaysOn).map((featureDefinition) => featureDefinition.id);
  assert.deepEqual(Object.keys(harnessSchema.properties.features.properties).sort(), selectableFeatureIds.sort());
  assert.deepEqual(Object.keys(harnessSchema.properties.modules.properties).sort(), [...KNOWN_MODULE_IDS].sort());
  const schemaRuleIds = harnessSchema.properties.modules.properties.danger.oneOf[1].properties.ignore_rules.items.enum;
  assert.deepEqual([...schemaRuleIds].sort(), DANGER_RULES.map((dangerRule) => dangerRule.id).sort());
});
