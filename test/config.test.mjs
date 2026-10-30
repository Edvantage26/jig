import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validateHarnessConfig, loadHarnessConfig, isModuleEnabled } from '../src/core/config.mjs';
import { KNOWN_MODULE_IDS } from '../src/core/registry.mjs';
import { DANGER_RULES } from '../src/guards/danger.mjs';
import { createTemporaryProject } from './helpers.mjs';

const readJson = (relativePath) => JSON.parse(readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8'));

test('every shipped template is a valid contract', () => {
  for (const templateName of readdirSync(new URL('../templates/', import.meta.url)).filter((fileName) => fileName.endsWith('.json'))) {
    assert.deepEqual(validateHarnessConfig(readJson(`templates/${templateName}`), KNOWN_MODULE_IDS), [], templateName);
  }
});

test('invalid contracts are reported with a readable reason', () => {
  assert.match(validateHarnessConfig({ profile: 'huge' }).join(), /profile/);
  assert.match(validateHarnessConfig({ verify: 'npm test' }).join(), /verify/);
  assert.match(validateHarnessConfig({ modules: { nope: true } }, KNOWN_MODULE_IDS).join(), /unknown module "nope"/);
  assert.match(validateHarnessConfig({ surprise: 1 }).join(), /unknown field "surprise"/);
  assert.match(validateHarnessConfig([]).join(), /JSON object/);
});

test('load reports missing, invalid JSON and merges defaults', () => {
  assert.equal(loadHarnessConfig(createTemporaryProject()).status, 'missing');
  assert.equal(loadHarnessConfig(createTemporaryProject('{ not json')).status, 'invalid');
  const loadedConfig = loadHarnessConfig(createTemporaryProject({ profile: 'service' }));
  assert.equal(loadedConfig.status, 'ok');
  assert.equal(loadedConfig.config.trunk, 'main');
  assert.deepEqual(loadedConfig.config.verify, []);
});

test('modules follow the profile unless the repo overrides them', () => {
  const productOnlyModule = { id: 'review', profiles: ['product'] };
  assert.equal(isModuleEnabled(productOnlyModule, { profile: 'minimal', modules: {} }), false);
  assert.equal(isModuleEnabled(productOnlyModule, { profile: 'minimal', modules: { review: true } }), true);
  assert.equal(isModuleEnabled(productOnlyModule, { profile: 'product', modules: { review: { enabled: false } } }), false);
});

test('schema lists every module and every danger rule', () => {
  const harnessSchema = readJson('schema/harness.schema.json');
  assert.deepEqual(Object.keys(harnessSchema.properties.modules.properties).sort(), [...KNOWN_MODULE_IDS].sort());
  const schemaRuleIds = harnessSchema.properties.modules.properties.danger.oneOf[1].properties.ignore_rules.items.enum;
  assert.deepEqual([...schemaRuleIds].sort(), DANGER_RULES.map((dangerRule) => dangerRule.id).sort());
});
