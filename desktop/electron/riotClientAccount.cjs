const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { join } = require('node:path');
const https = require('node:https');

const discover = [
  '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
  '$listeners = & (Join-Path $env:SystemRoot "System32\\netstat.exe") -ano -p TCP',
  `$rows = Get-CimInstance Win32_Process -Filter "Name = 'RiotClientServices.exe' OR Name = 'Riot Client.exe'" -ErrorAction Stop`,
  '$riotPids = ($rows.ProcessId -join "|")',
  `foreach ($row in $rows) {
    $port = [regex]::Match($row.CommandLine, '(?:^|\\s|")--app-port=(\\d{1,5})(?=\\s|"|$)').Groups[1].Value
    $token = [regex]::Match($row.CommandLine, '(?:^|\\s|")--remoting-auth-token=([^\\s"]+)(?=\\s|"|$)').Groups[1].Value
    if (!$port -or !$token -or [int]$port -lt 1 -or [int]$port -gt 65535) { continue }
    $owned = '^\\s*TCP\\s+127\\.0\\.0\\.1:' + $port + '\\s+0\\.0\\.0\\.0:0\\s+\\S+\\s+' + '(' + $riotPids + ')' + '\\s*$'
    if ($listeners -match $owned) { [pscustomobject]@{ port = [int]$port; token = $token } | ConvertTo-Json -Compress }
  }`,
].join('\n');

function readRiotId(session) {
  const id = session?.riotID;
  const parts = typeof id === 'string' ? id.split('#') : [id?.gameName, id?.tagLine];
  if (parts.length !== 2 || !parts.every(value => typeof value === 'string')) return null;
  const [gameName, tagLine] = parts.map(value => value.trim());
  if (!gameName || !tagLine || gameName.length > 100 || tagLine.length > 30 || /[#\x00-\x1f\x7f]/.test(gameName + tagLine)) return null;
  return { gameName, tagLine };
}

function readSession({ port, token }) {
  return new Promise(resolve => {
    // Only the port verified against the Riot process's loopback listener reaches this socket.
    const request = https.get({
      hostname: '127.0.0.1', port, path: '/player-session-lifecycle/v1/session',
      auth: 'riot:' + token, rejectUnauthorized: false, agent: false,
      signal: AbortSignal.timeout(2500),
    }, response => {
      response.on('error', () => resolve(null));
      if (response.statusCode !== 200) {
        response.resume();
        resolve(null);
        return;
      }
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 128 * 1024) { resolve(null); request.destroy(); }
        else chunks.push(chunk);
      });
      response.on('end', () => {
        try { resolve(readRiotId(JSON.parse(Buffer.concat(chunks).toString('utf8')))); }
        catch { resolve(null); }
      });
    });
    request.on('error', () => resolve(null));
  });
}

async function detectRiotAccount() {
  if (process.platform !== 'win32' || process.env.TFT_REPLAY_DISABLE_RIOT_ACCOUNT === '1') return null;
  try {
    const powershell = join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const { stdout } = await promisify(execFile)(powershell, ['-NoProfile', '-NonInteractive', '-Command', discover], {
      encoding: 'utf8', windowsHide: true, timeout: 5000, maxBuffer: 32768,
    });
    const endpoints = stdout.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    const accounts = await Promise.all(endpoints.map(readSession));
    const found = accounts.filter(Boolean);
    const account = found[0];
    return account && found.every(id => id.gameName === account.gameName && id.tagLine === account.tagLine) ? account : null;
  } catch {
    return null;
  }
}

module.exports = { detectRiotAccount, readRiotId };
