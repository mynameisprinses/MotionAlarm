import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

// A disposable REST fixture for browser tests, never an application backend.
const accounts = new Map();
const tokens = new Map();
const refreshTokens = new Map();
const alerts = new Map();
const receipts = new Set();

function session(account) {
  const access_token = randomUUID();
  const refresh_token = randomUUID();
  tokens.set(access_token, account);
  refreshTokens.set(refresh_token, account);
  return {
    access_token,
    refresh_token,
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: account.id, email: account.email },
  };
}

const server = createServer(async (request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'apikey, authorization, content-type, prefer');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  response.setHeader('Content-Type', 'application/json');
  const send = (status, value) => {
    response.writeHead(status);
    response.end(value === undefined ? undefined : JSON.stringify(value));
  };
  if (request.method === 'OPTIONS') return send(204);
  const url = new URL(request.url, 'http://127.0.0.1:54321');
  if (url.pathname === '/health') return send(200, { fixture: 'supabase-rest' });
  if (request.headers.apikey !== 'sb_publishable_test_only') return send(401, { message: 'Invalid API key' });
  let body;
  try {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return send(400, { code: 'validation_failed', msg: 'Invalid JSON' });
  }

  if (url.pathname === '/auth/v1/signup' && request.method === 'POST') {
    const email = body.email?.trim().toLowerCase();
    if (!email || !body.password || body.password.length < 6)
      return send(400, { code: 'weak_password', msg: 'Use at least 6 characters.' });
    if (accounts.has(email)) return send(422, { code: 'user_already_exists', msg: 'User already registered' });
    const account = { id: randomUUID(), email, password: body.password };
    accounts.set(email, account);
    return send(200, session(account));
  }
  if (url.pathname === '/auth/v1/token' && request.method === 'POST') {
    const account =
      url.searchParams.get('grant_type') === 'refresh_token'
        ? refreshTokens.get(body.refresh_token)
        : accounts.get(body.email?.trim().toLowerCase());
    if (!account || (url.searchParams.get('grant_type') === 'password' && account.password !== body.password)) {
      return send(400, { code: 'invalid_credentials', msg: 'Invalid login credentials' });
    }
    return send(200, session(account));
  }
  const token = request.headers.authorization?.replace(/^Bearer /, '');
  const account = tokens.get(token);
  if (!account) return send(401, { code: 'bad_jwt', message: 'Log in to access your alerts.' });
  if (url.pathname === '/auth/v1/logout') {
    tokens.delete(token);
    for (const [refresh, owner] of refreshTokens) if (owner.id === account.id) refreshTokens.delete(refresh);
    return send(204);
  }
  if (url.pathname === '/auth/v1/user') return send(200, { id: account.id, email: account.email });
  if (url.pathname === '/rest/v1/rpc/record_movement_alert' && request.method === 'POST') {
    if (
      !/^[A-Za-z0-9_-]{1,128}$/.test(body.p_id) ||
      !Number.isFinite(Date.parse(body.p_created_at)) ||
      (body.p_strength !== null &&
        (typeof body.p_strength !== 'number' || body.p_strength < 0 || body.p_strength > 10000))
    ) {
      return send(400, { code: '23514', message: 'Invalid movement alert' });
    }
    const key = account.id + ':' + body.p_id;
    if (!receipts.has(key)) {
      alerts.set(key, {
        id: body.p_id,
        user_id: account.id,
        created_at: body.p_created_at,
        source: 'Movement',
        status: 'New',
        strength: body.p_strength,
      });
      receipts.add(key);
    }
    return send(204);
  }
  if (url.pathname === '/rest/v1/alerts') {
    const selectedId = url.searchParams.get('id')?.replace(/^eq\./, '');
    const selectedUser = url.searchParams.get('user_id')?.replace(/^eq\./, '');
    const rows = [...alerts.values()].filter(
      (row) =>
        row.user_id === account.id &&
        (!selectedId || row.id === selectedId) &&
        (!selectedUser || row.user_id === selectedUser),
    );
    if (request.method === 'GET') {
      rows.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
      const offset = Number(url.searchParams.get('offset') || 0);
      return send(200, rows.slice(offset, offset + Number(url.searchParams.get('limit') || 1000)));
    }
    if (request.method === 'PATCH') {
      if (Object.keys(body).length !== 1 || !['New', 'Reviewed'].includes(body.status))
        return send(400, { code: '23514', message: 'Only alert status can change.' });
      for (const row of rows) row.status = body.status;
      return send(204);
    }
    if (request.method === 'DELETE') {
      for (const row of rows) alerts.delete(account.id + ':' + row.id);
      return send(204);
    }
  }
  return send(404, { message: 'Unknown REST endpoint' });
});
server.listen(54321, '127.0.0.1', () => console.log('Supabase REST browser fixture: http://127.0.0.1:54321'));
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
