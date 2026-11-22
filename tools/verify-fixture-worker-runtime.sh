#!/usr/bin/env bash
# Run a trusted measurement program against a candidate local Docker runtime.
set -euo pipefail

runtime=${1:-runc}
if [[ $# -gt 1 || ( "$runtime" != runc && "$runtime" != runsc ) ]]; then
  printf 'Usage: %s [runc|runsc]\n' "$0" >&2
  exit 2
fi

image='docker.io/library/node@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a'
if ! docker image inspect "$image" >/dev/null 2>&1; then
  printf 'Missing pinned local image. Pull it explicitly before probing: docker pull %s\n' "$image" >&2
  exit 2
fi

probe_dir=$(mktemp -d)
probe_name="slopboy-worker-probe-${probe_dir##*.}"
trap 'docker rm -f "$probe_name" >/dev/null 2>&1 || true; rmdir "$probe_dir"' EXIT
printf 'Runtime %s\nImage %s\n' "$runtime" "$image"
timeout --kill-after=3s 20s docker run --rm -i --name "$probe_name" --pull=never \
  --runtime "$runtime" --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user 65534:65534 --memory 128m --memory-swap 128m \
  --cpus 0.5 --pids-limit 32 --entrypoint node "$image" --input-type=module - <<'JS'
import {readFileSync, writeFileSync} from 'node:fs';
import {networkInterfaces} from 'node:os';

function read(path) {
  try { return readFileSync(path, 'utf8').trim(); }
  catch { return null; }
}
const status = read('/proc/self/status');
const field = name => status?.split('\n').find(line => line.startsWith(name + ':'))?.split(':')[1]?.trim();
const cgroup = name => read('/sys/fs/cgroup/' + name);
let rootWrite = 'writable';
try { writeFileSync('/tmp/slopboy-worker-probe', 'trusted probe'); }
catch (error) { rootWrite = error.code; }

const measured = {
  uid: process.getuid(),
  gid: process.getgid(),
  externalNetwork: Object.values(networkInterfaces()).flat().some(address => !address.internal),
  rootWrite,
  noNewPrivileges: field('NoNewPrivs') ?? null,
  effectiveCapabilities: field('CapEff') ?? null,
  memory: cgroup('memory.max'),
  swap: cgroup('memory.swap.max'),
  cpu: cgroup('cpu.max'),
  pids: cgroup('pids.max'),
};
const [quota, period] = (measured.cpu ?? '').split(/\s+/).map(Number);
const checks = {
  nonRoot: measured.uid === 65534 && measured.gid === 65534,
  noExternalNetwork: !measured.externalNetwork,
  readOnlyRoot: rootWrite === 'EROFS',
  noNewPrivileges: measured.noNewPrivileges === '1',
  noCapabilities: /^0+$/.test(measured.effectiveCapabilities ?? ''),
  memory: measured.memory === '134217728',
  noSwap: measured.swap === '0',
  cpu: quota > 0 && period > 0 && quota / period === 0.5,
  pids: measured.pids === '32',
};
const passed = Object.values(checks).every(Boolean);
console.log(JSON.stringify({passed, measured, checks}, null, 2));
process.exitCode = passed ? 0 : 1;
JS
