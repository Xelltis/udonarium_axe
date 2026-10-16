#!/usr/bin/env node
// Copies the contract fixtures for server-hosted rooms over from the backend repository.
// Usage: node scripts/sync-server-contract.mjs <ref> [backend repository]
//   ref is a commit or branch of udonarium_axe_backend (e.g. feat/server-transport).
//   The repository defaults to ../udonarium_axe_backend next door.
// The types (protocol.ts) are not copied. The client keeps its own types in
// src/app/core/network/server/server-protocol.ts, and a spec reading the same fixtures finds where they
// disagree. Only PROTOCOL_VERSION is read from protocol.ts and kept in source.json, for a spec to compare
// with the client's version.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as prettier from 'prettier';

const [ref, repository = resolve('..', 'udonarium_axe_backend')] = process.argv.slice(2);
if (!ref) {
  console.error('使い方: node scripts/sync-server-contract.mjs <ref> [バックエンドのリポジトリ]');
  process.exit(1);
}

const CONTRACT_DIR = 'apps/cloudflare/contracts';
const OUTPUT_DIR = 'src/app/core/network/server/contract';
const FIXTURES = ['lww', 'messages', 'errors', 'visibility', 'events', 'http', 'limits'];

const git = (...args) => execFileSync('git', ['-C', repository, ...args], { encoding: 'utf-8' });
const commit = git('rev-parse', `${ref}^{commit}`).trim();

const write = async (path, json) => {
  const source = JSON.stringify(json, null, 2);
  const options = (await prettier.resolveConfig(path)) ?? {};
  writeFileSync(path, await prettier.format(source, { ...options, filepath: path }));
};

for (const name of FIXTURES) {
  const json = JSON.parse(git('show', `${commit}:${CONTRACT_DIR}/fixtures/${name}.json`));
  await write(`${OUTPUT_DIR}/${name}.json`, json);
}

const protocol = git('show', `${commit}:${CONTRACT_DIR}/protocol.ts`);
const version = /export const PROTOCOL_VERSION = (\d+);/.exec(protocol);
if (!version) {
  console.error('[sync-server-contract] protocol.ts に PROTOCOL_VERSION が見つかりません');
  process.exit(1);
}
await write(`${OUTPUT_DIR}/source.json`, { commit, protocolVersion: Number(version[1]) });

console.log(`[sync-server-contract] ${commit.slice(0, 9)} の契約を ${OUTPUT_DIR} に写しました（版 ${version[1]}）`);
