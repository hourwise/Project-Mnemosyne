import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const baseline = JSON.parse(await readFile(new URL('../docs/integration/adrasteia-baseline.json', import.meta.url), 'utf8'));
const peer = baseline.anankeComparator;
const output = execFileSync('git', ['ls-remote', '--tags', peer.repository], { encoding: 'utf8' });
const actual = output.split(/\r?\n/).find((line) => line.endsWith(`refs/tags/${peer.tag}^{}`))?.split(/\s+/)[0];
if (actual !== peer.commit) throw new Error(`Ananke comparator tag ${peer.tag} resolved to ${actual ?? 'nothing'}, expected ${peer.commit}.`);
console.log(`Verified read-only Ananke comparator ${peer.tag} (${peer.commit}).`);
