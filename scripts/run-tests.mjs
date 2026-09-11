import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Expand filenames ourselves so Windows and the minimum supported Node version
// use the same test list without relying on shell wildcard expansion.
const directory = new URL('../tests/', import.meta.url);
const tests = (await readdir(directory)).filter(name => name.endsWith('.test.mjs')).sort();
if (!tests.length) throw new Error('No test files found');
const result = spawnSync(process.execPath, ['--test', ...tests.map(name => fileURLToPath(new URL(name, directory)))], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
