#!/usr/bin/env node
// Снимает стабильный снимок того, что сервер показывает клиенту: JSON-RPC
// поверхности и OAuth-документов. Используется до и после переезда на SDK v2 —
// дифф двух прогонов и есть критерий приёмки.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [baseUrl, outDir] = process.argv.slice(2);
if (!baseUrl || !outDir) {
  console.error('usage: node scripts/protocol-dump.mjs <baseUrl> <outDir>');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const MCP = `${baseUrl}/mcp`;
const ACCEPT = 'application/json, text/event-stream';
// Network transports always require a bearer token: with OAuth off the fallback
// guard (src/auth/bearer-guard.ts) rejects a request without one, and it never
// checks validity, so a placeholder is enough for a protocol dump.
const TOKEN = process.env.DUMP_TOKEN || 'dummy';
const AUTH = { authorization: `Bearer ${TOKEN}` };

/** Ответ транспорта приходит либо JSON, либо SSE — вынимаем полезную нагрузку из обоих. */
async function readBody(res) {
  const text = await res.text();
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('text/event-stream')) {
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }
  const payloads = text
    .split('\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).trim())
    .filter(Boolean)
    .map((d) => {
      try {
        return JSON.parse(d);
      } catch {
        return { raw: d };
      }
    });
  return payloads.length === 1 ? payloads[0] : payloads;
}

/** Заголовки, которые должны совпасть; изменчивые (дата, длина, id сессии) выброшены. */
function stableHeaders(res) {
  const keep = ['content-type', 'www-authenticate', 'access-control-allow-origin', 'mcp-protocol-version'];
  const out = {};
  for (const k of keep) {
    const v = res.headers.get(k);
    if (v !== null) out[k] = v;
  }
  return out;
}

function save(name, data) {
  writeFileSync(join(outDir, `${name}.json`), JSON.stringify(data, null, 2) + '\n');
  console.log(`wrote ${name}.json`);
}

async function rpc(body, { sessionId, headers = {} } = {}) {
  const res = await fetch(MCP, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: ACCEPT,
      ...AUTH,
      ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, headers: stableHeaders(res), body: await readBody(res) };
}

const INIT = (version) => ({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: version,
    capabilities: {},
    clientInfo: { name: 'protocol-dump', version: '1.0.0' },
  },
});

async function dumpProtocol() {
  // 1. initialize на текущей версии — и id сессии для последующих вызовов.
  const initRes = await fetch(MCP, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: ACCEPT, ...AUTH },
    body: JSON.stringify(INIT('2025-11-25')),
  });
  const sessionId = initRes.headers.get('mcp-session-id') || undefined;
  save('initialize-2025-11-25', {
    status: initRes.status,
    headers: stableHeaders(initRes),
    body: await readBody(initRes),
  });

  // 2. initialize с новой спекой — фиксируем, чем отвечает сервер на 2026-07-28.
  save('initialize-2026-07-28', await rpc(INIT('2026-07-28')));

  // 3. Каталоги. tools/list — до и после активации скрытых инструментов.
  save('tools-list-before-discover', await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, { sessionId }));
  save(
    'discover-call',
    await rpc(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'qase_discover_tools', arguments: { query: 'milestone' } },
      },
      { sessionId },
    ),
  );
  save('tools-list-after-discover', await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/list' }, { sessionId }));
  save('prompts-list', await rpc({ jsonrpc: '2.0', id: 5, method: 'prompts/list' }, { sessionId }));

  // 4. Ошибки — форма отказа важна не меньше, чем форма успеха.
  save(
    'error-unknown-cursor',
    await rpc({ jsonrpc: '2.0', id: 6, method: 'tools/list', params: { cursor: 'nope' } }, { sessionId }),
  );
  save(
    'error-unknown-tool',
    await rpc(
      { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'qase_nonexistent', arguments: {} } },
      { sessionId },
    ),
  );
  save('error-malformed-json', await rpc('{"jsonrpc":"2.0",', { sessionId }));
  save('error-server-discover', await rpc({ jsonrpc: '2.0', id: 8, method: 'server/discover' }, { sessionId }));
}

async function dumpOAuth() {
  const docs = {
    'oauth-authorization-server': '/.well-known/oauth-authorization-server',
    'oauth-protected-resource': '/.well-known/oauth-protected-resource',
    'oauth-protected-resource-mcp': '/.well-known/oauth-protected-resource/mcp',
  };
  for (const [name, path] of Object.entries(docs)) {
    const res = await fetch(`${baseUrl}${path}`);
    save(name, { status: res.status, headers: stableHeaders(res), body: await readBody(res) });
  }

  // 401-челлендж: заголовок WWW-Authenticate — то, по чему клиент находит AS.
  // Здесь токен НЕ шлётся намеренно: проверяется именно отказ.
  const unauth = await fetch(MCP, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: ACCEPT },
    body: JSON.stringify(INIT('2025-11-25')),
  });
  save('unauthorized-challenge', {
    status: unauth.status,
    headers: stableHeaders(unauth),
    body: await readBody(unauth),
  });

  // DCR: санитайзер обязан переписать client_secret_post в none.
  const reg = await fetch(`${baseUrl}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'protocol-dump',
      redirect_uris: ['https://example.com/callback'],
      token_endpoint_auth_method: 'client_secret_post',
      grant_types: ['authorization_code'],
      response_types: ['code'],
    }),
  });
  save('dcr-register', { status: reg.status, headers: stableHeaders(reg), body: await readBody(reg) });
}

const mode = process.env.DUMP_MODE || 'protocol';
if (mode === 'protocol') await dumpProtocol();
else await dumpOAuth();
