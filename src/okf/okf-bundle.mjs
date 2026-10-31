// Shared helpers for the `okf` feature: where the bundle is, its spec version, and the rules the
// agent must follow when maintaining it. Text addressed to the agent lives here so both OKF
// modules say the same thing.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function resolveBundleDirectory(projectRoot, config) {
  return join(projectRoot, config.knowledge || '.okf');
}

export function readBundleIndex(bundleDirectory) {
  const indexPath = join(bundleDirectory, 'index.md');
  return existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : null;
}

// Reads `okf_version` from the index frontmatter; null when absent.
export function readBundleSpecVersion(indexText) {
  const frontmatterMatch = /^---\n([\s\S]*?)\n---/.exec(indexText || '');
  const versionMatch = frontmatterMatch && /^okf_version:\s*['"]?([0-9.]+)['"]?\s*$/m.exec(frontmatterMatch[1]);
  return versionMatch ? versionMatch[1] : null;
}

export function newestModificationMilliseconds(directoryPath) {
  let newestMilliseconds = 0;
  for (const entryName of readdirSync(directoryPath)) {
    const entryPath = join(directoryPath, entryName);
    const entryStats = statSync(entryPath);
    const entryMilliseconds = entryStats.isDirectory() ? newestModificationMilliseconds(entryPath) : entryStats.mtimeMs;
    newestMilliseconds = Math.max(newestMilliseconds, entryMilliseconds);
  }
  return newestMilliseconds;
}

export function buildMaintenanceRules(bundleRelativePath, specVersion) {
  const maintenanceRules = [
    `Update the affected concept in \`${bundleRelativePath}/\`: body, cross-links, and \`generated: { by: claude-code/<model>, at: <ISO 8601> }\` (a person writes \`human:<id>\`). A new asset gets a new concept.`,
    `Add a dated entry to \`${bundleRelativePath}/log.md\` only for lifecycle events (created, deprecated, superseded, regenerated, verified); routine edits get none.`,
    `Validate with /jig:validate ${bundleRelativePath} and fix every ERROR.`,
  ];
  if (specVersion && specVersion.startsWith('0.1')) {
    maintenanceRules.push('This bundle is still OKF v0.1: legacy-format warnings (timestamp, # Citations) are expected. Do NOT migrate it on your own; migration is a deliberate, per-repo step.');
  }
  return maintenanceRules;
}
