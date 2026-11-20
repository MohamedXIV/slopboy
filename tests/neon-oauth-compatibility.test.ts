import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { createMcpAuth } from '@neon/oauth/mcp';
import { createMetadataHandlers, withMcpAuth } from '@neon/oauth/mcp/next';
import { createDevMcpHandlers, readDevOAuthConfig } from '../apps/web/lib/mcp/dev-oauth.ts';

test('Neon OAuth SDK protects a read-only MCP fixture using discovery and EdDSA', async t => {
  const keys = generateKeyPairSync('ed25519');
  const wrongKeys = generateKeyPairSync('ed25519');
  const kid = 'local-fixture';
  const resource = 'https://slopboy.example/api/mcp/dev';
  const metadataUrl = 'https://slopboy.example/.well-known/oauth-protected-resource/api/mcp/dev';
  const issuerPath = '/slopboy-dev/auth';
  const requestedPaths: string[] = [];

  const issuerServer = createServer((request, response) => {
    const path = request.url ?? '';
    requestedPaths.push(path);
    response.setHeader('Content-Type', 'application/json');
    if (path === `${issuerPath}/.well-known/oauth-authorization-server`) {
      response.end(JSON.stringify({ issuer, jwks_uri: `${issuer}/.well-known/jwks.json` }));
      return;
    }
    if (path === `${issuerPath}/.well-known/jwks.json`) {
      const key = keys.publicKey.export({ format: 'jwk' });
      response.end(JSON.stringify({ keys: [{ ...key, kid, alg: 'EdDSA', use: 'sig' }] }));
      return;
    }
    response.writeHead(503).end('{}');
  });
  issuerServer.listen(0, '127.0.0.1');
  t.after(() => new Promise<void>((resolve, reject) => {
    issuerServer.close(error => error ? reject(error) : resolve());
  }));
  await once(issuerServer, 'listening');
  const address = issuerServer.address();
  assert.ok(address && typeof address === 'object');
  const issuer = `http://127.0.0.1:${address.port}${issuerPath}`;

  function token(
    overrides: Record<string, unknown> = {},
    privateKey = keys.privateKey,
  ): string {
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: issuer,
      aud: resource,
      sub: 'dev-user',
      client_id: 'fixture-client',
      scope: 'openid offline_access',
      iat: now,
      exp: now + 300,
      ...overrides,
    };
    const data = [
      { alg: 'EdDSA', kid, typ: 'at+jwt' },
      claims,
    ].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
    return `${data}.${sign(null, Buffer.from(data), privateKey).toString('base64url')}`;
  }

  const auth = createMcpAuth({
    baseUrl: issuer,
    resource,
    scopesSupported: ['openid', 'offline_access'],
  });
  const metadata = createMetadataHandlers(auth);
  const protectedCall = withMcpAuth(auth, (_request, identity) => {
    return Response.json({ subject: identity.sub, clientId: identity.clientId });
  }, { requiredScopes: ['openid'] });
  const guardedWriteScope = withMcpAuth(auth, () => {
    assert.fail('a Neon-shaped token must not grant the Slopboy write scope');
  }, { requiredScopes: ['mcp:write'] });

  function call(accessToken?: string) {
    return new Request(resource, {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
  }

  for (const url of [metadataUrl, 'https://slopboy.example/.well-known/oauth-protected-resource']) {
    const response = metadata.GET(new Request(url));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.resource, resource);
    assert.deepEqual(body.authorization_servers, [issuer]);
    assert.deepEqual(body.scopes_supported, ['openid', 'offline_access']);
  }

  const missing = await protectedCall(call(), undefined);
  assert.equal(missing.status, 401);
  assert.ok(missing.headers.get('www-authenticate')?.includes(`resource_metadata="${metadataUrl}"`));
  assert.deepEqual(requestedPaths, []);

  const accessToken = token();
  const accepted = await protectedCall(call(accessToken), undefined);
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { subject: 'dev-user', clientId: 'fixture-client' });
  assert.deepEqual(requestedPaths, [
    `${issuerPath}/.well-known/oauth-authorization-server`,
    `${issuerPath}/.well-known/jwks.json`,
  ]);

  for (const deniedToken of [
    token({ aud: 'https://another.example/api/mcp' }),
    token({ iss: `${issuer}/another-branch` }),
    token({ exp: Math.floor(Date.now() / 1000) - 60 }),
    token({ sub: '' }),
    token({}, wrongKeys.privateKey),
  ]) {
    const denied = await protectedCall(call(deniedToken), undefined);
    assert.equal(denied.status, 401);
    assert.match(denied.headers.get('www-authenticate') ?? '', /invalid_token/);
  }

  const missingScope = await guardedWriteScope(call(accessToken), undefined);
  assert.equal(missingScope.status, 403);
  assert.match(missingScope.headers.get('www-authenticate') ?? '', /insufficient_scope/);

  const dev = createDevMcpHandlers(auth);
  function rpc(request: Record<string, unknown>, accessToken?: string) {
    return dev.handleRequest(new Request(resource, {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      body: JSON.stringify({ jsonrpc: '2.0', ...request }),
    }));
  }

  assert.equal((await rpc({ id: 1, method: 'tools/list' })).status, 401);
  assert.equal((await rpc({ id: 1, method: 'tools/list' }, token({ exp: undefined }))).status, 401);
  const wrongAudience = await rpc({ id: 1, method: 'tools/list' }, token({ aud: `${resource}/other` }));
  assert.equal(wrongAudience.status, 401);

  const setup = await rpc({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, accessToken);
  assert.equal((await setup.json()).result.protocolVersion, '2025-06-18');
  assert.equal((await rpc({ method: 'notifications/initialized' }, accessToken)).status, 202);

  const list = await rpc({ id: 2, method: 'tools/list' }, accessToken);
  const names = (await list.json()).result.tools.map((tool: { name: string }) => tool.name);
  assert.ok(names.includes('get_connected_account'));
  assert.ok(names.includes('list_supported_engines'));
  assert.ok(!names.includes('create_game_draft'));

  const account = await rpc({ id: 3, method: 'tools/call', params: { name: 'get_connected_account' } }, accessToken);
  assert.equal(account.headers.get('cache-control'), 'no-store');
  const content = (await account.json()).result.content;
  assert.deepEqual(JSON.parse(content[0].text), { accountId: 'dev-user' });
  const spoofed = await rpc({
    id: 4,
    method: 'tools/call',
    params: { name: 'get_connected_account', arguments: { userId: 'other-user' } },
  }, accessToken);
  assert.equal((await spoofed.json()).error.code, -32602);

  const write = await rpc({ id: 5, method: 'tools/call', params: { name: 'create_game_draft' } }, accessToken);
  assert.ok(!(await write.json()).result);

  const unavailable = createMcpAuth({ baseUrl: `${issuer}/unavailable`, resource });
  const unavailableCall = withMcpAuth(unavailable, () => {
    assert.fail('an unavailable issuer must not authorize a request');
  });
  assert.equal((await unavailableCall(call(accessToken), undefined)).status, 503);
});


test('the development endpoint requires a preview deployment and explicit HTTPS configuration', () => {
  const env = {
    VERCEL_ENV: 'preview',
    MCP_DEV_OAUTH_ENABLED: '1',
    MCP_DEV_OAUTH_ISSUER: 'https://issuer.example/app/auth',
    MCP_DEV_OAUTH_RESOURCE: 'https://slopboy.example/api/mcp/dev',
  };
  assert.deepEqual(readDevOAuthConfig(env), {
    baseUrl: env.MCP_DEV_OAUTH_ISSUER,
    resource: env.MCP_DEV_OAUTH_RESOURCE,
    scopesSupported: ['openid', 'offline_access'],
  });
  for (const changes of [
    { VERCEL_ENV: 'production' },
    { VERCEL_ENV: undefined },
    { MCP_DEV_OAUTH_ENABLED: undefined },
    { MCP_DEV_OAUTH_ISSUER: 'http://issuer.example/app/auth' },
    { MCP_DEV_OAUTH_RESOURCE: 'https://slopboy.example/api/mcp' },
  ]) assert.equal(readDevOAuthConfig({ ...env, ...changes }), undefined);
});
