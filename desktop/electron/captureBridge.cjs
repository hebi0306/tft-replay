const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { join } = require('node:path');
const { existsSync } = require('node:fs');

const METHODS = new Set(['config', 'sources', 'preview', 'start', 'stop', 'status', 'list', 'match', 'image']);

function createCaptureBridge({ root, resources, dataPath, packaged }) {
  let child, nextId = 0;
  const pending = new Map();
  function launch() {
    const executable = join(resources, 'capture-service', 'capture-service.exe');
    const python = join(root, '.capture-venv', 'Scripts', 'python.exe');
    if (!(existsSync(packaged ? executable : python))) throw new Error('capture_setup_required');
    child = spawn(packaged ? executable : python, packaged ? [dataPath] : ['-u', join(root, 'capture', 'capture_service.py'), dataPath], {
      windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONIOENCODING: 'utf-8', OMP_NUM_THREADS: '1' },
    });
    const running = child;
    const fail = () => {
      if (child !== running) return;
      child = null;
      for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('capture_service_stopped')); }
      pending.clear();
    };
    running.on('error', fail); running.on('exit', fail);
    running.stdin.on('error', fail);
    running.stderr.on('data', data => console.error('[capture]', data.toString().trim()));
    createInterface({ input: running.stdout }).on('line', line => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      const entry = pending.get(message.id);
      if (!entry) return;
      clearTimeout(entry.timer); pending.delete(message.id);
      message.error ? entry.reject(new Error(message.error)) : entry.resolve(message.result);
    });
  }
  async function request(method, args = {}) {
    if (!METHODS.has(method)) throw new Error('invalid_command');
    if (!child) launch();
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('capture_timeout')); }, 60000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ id, method, args }) + '\n');
    });
  }
  async function close() {
    if (!child) return;
    const running = child;
    try { await request('stop'); } finally { running.stdin.end(); setTimeout(() => running.kill(), 2000).unref(); }
  }
  return { request, close };
}
module.exports = { createCaptureBridge };
