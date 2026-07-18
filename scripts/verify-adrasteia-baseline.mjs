import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const baseline = JSON.parse(await readFile(new URL('../docs/integration/adrasteia-baseline.json', import.meta.url), 'utf8'));
const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
const locked = lock.packages?.['node_modules/project-runtime-contracts'];
if (!locked) throw new Error('Adrasteia package is absent from package-lock.json.');
if (locked.resolved !== baseline.artifact.url) throw new Error(`Adrasteia lock URL is not the immutable release URL: ${locked.resolved}`);

const installed = JSON.parse(await readFile(new URL('../node_modules/project-runtime-contracts/package.json', import.meta.url), 'utf8'));
if (installed.name !== baseline.package.name || installed.version !== baseline.package.version) throw new Error('Installed package name or version differs from the pinned Adrasteia baseline.');
const contracts = await import('project-runtime-contracts');
for (const name of ['PrincipalIdentitySchema', 'AgentExecutionContextSchema', 'ResourceScopeSchema', 'CorrelationContextSchema', 'RuntimeIdentitySchema', 'RuntimeHealthSchema', 'RuntimeReadinessSchema', 'RuntimeRegistrationSchema', 'CompatibilityManifestSchema', 'negotiateDetailed']) {
  if (!(name in contracts)) throw new Error(`Pinned Adrasteia package is missing required export ${name}.`);
}

const [artifact, sidecar] = await Promise.all([fetchBytes(baseline.artifact.url), fetchBytes(baseline.artifact.sidecarUrl)]);
assertSha256(artifact, baseline.artifact.sha256, 'artifact');
assertSha256(sidecar, baseline.artifact.sidecarSha256, 'sidecar');
const sidecarPayload = JSON.parse(Buffer.from(sidecar).toString('utf8'));
for (const [key, expected] of Object.entries({
  packageName: baseline.package.name,
  packageVersion: baseline.package.version,
  protocolVersion: baseline.package.protocolVersion,
  minimumSupportedProtocolVersion: baseline.package.minimumSupportedProtocolVersion,
  sourceCommit: baseline.commit,
  proposedTag: baseline.tag,
  artifactSha256: baseline.artifact.sha256,
  contentPreflightIncluded: false,
})) {
  if (sidecarPayload[key] !== expected) throw new Error(`Adrasteia sidecar ${key} does not match the pinned baseline.`);
}
if (sidecarPayload.supportedProtocolRange?.minimum !== baseline.package.supportedProtocolRange.minimum || sidecarPayload.supportedProtocolRange?.maximum !== baseline.package.supportedProtocolRange.maximum) throw new Error('Adrasteia sidecar protocol range does not match the pinned baseline.');
assertPeeledTag(baseline.repository, baseline.tag, baseline.commit);
console.log(`Verified ${baseline.package.name}@${baseline.package.version} from ${baseline.tag} (${baseline.commit}) with SHA-256 ${baseline.artifact.sha256}.`);

async function fetchBytes(url) {
  const response = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'mnemosyne-adrasteia-verifier' } });
  if (!response.ok) throw new Error(`Unable to fetch pinned release asset: ${response.status} ${response.statusText}`);
  return new Uint8Array(await response.arrayBuffer());
}
function assertSha256(bytes, expected, name) {
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected) throw new Error(`Pinned ${name} SHA-256 mismatch: expected ${expected}, received ${actual}.`);
}
function assertPeeledTag(repository, tag, expectedCommit) {
  const output = execFileSync('git', ['ls-remote', '--tags', repository], { encoding: 'utf8' });
  const actual = output.split(/\r?\n/).find((line) => line.endsWith(`refs/tags/${tag}^{}`))?.split(/\s+/)[0];
  if (actual !== expectedCommit) throw new Error(`Pinned tag ${tag} resolved to ${actual ?? 'nothing'}, expected ${expectedCommit}.`);
}
