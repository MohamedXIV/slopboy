import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getProtectedResourceMetadata,
  verifyAccessToken,
  createTestAccessToken,
  handleMcpHttpRequest,
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_INFO,
  type TokenVerificationOptions,
} from '../packages/mcp/src/index.ts';

const TEST_SECRET = 'super-secret-test-key-32-chars-long!';
const EXPECTED_ISSUER = 'https://auth.slopboy.com';
const EXPECTED_AUDIENCE = 'https://slopboy.com/api/mcp';

const DEFAULT_AUTH_CONFIG: TokenVerificationOptions = {
  expectedIssuer: EXPECTED_ISSUER,
  expectedAudience: EXPECTED_AUDIENCE,
  secretKey: TEST_SECRET,
  requiredScope: 'mcp:write',
};

test('RFC 9704 Protected Resource Metadata returns expected discovery JSON', () => {
  const metadata = getProtectedResourceMetadata({
    resourceUrl: 'https://slopboy.com/api/mcp',
    authServerUrl: 'https://auth.slopboy.com',
  });

  assert.equal(metadata.resource, 'https://slopboy.com/api/mcp');
  assert.deepEqual(metadata.authorization_servers, ['https://auth.slopboy.com']);
  assert.ok(metadata.scopes_supported.includes('mcp:read'));
  assert.ok(metadata.scopes_supported.includes('mcp:write'));
  assert.deepEqual(metadata.bearer_methods_supported, ['header']);
});

test('verifyAccessToken validates a well-formed signed JWT with matching claims', () => {
  const token = createTestAccessToken(
    {
      sub: 'usr_01931a2b-3c4d-7e8f-9012-3456789abcde',
      iss: EXPECTED_ISSUER,
      aud: EXPECTED_AUDIENCE,
      scope: 'mcp:read mcp:write',
      client_id: 'chatgpt-plugin',
    },
    TEST_SECRET
  );

  const result = verifyAccessToken(`Bearer ${token}`, DEFAULT_AUTH_CONFIG);
  assert.equal(result.ok, true);
  assert.ok(result.subject);
  assert.equal(result.subject.userId, 'usr_01931a2b-3c4d-7e8f-9012-3456789abcde');
  assert.equal(result.subject.clientId, 'chatgpt-plugin');
  assert.ok(result.subject.scopes.includes('mcp:write'));
  assert.ok(result.subject.scopes.includes('mcp:read'));
});

test('verifyAccessToken rejects missing or malformed Authorization header', () => {
  const missing = verifyAccessToken(null, DEFAULT_AUTH_CONFIG);
  assert.equal(missing.ok, false);
  assert.equal(missing.error?.status, 401);
  assert.equal(missing.error?.error, 'invalid_request');
  assert.ok(missing.error?.wwwAuthenticate.includes('invalid_request'));

  const badScheme = verifyAccessToken('Basic dXNlcjpwYXNz', DEFAULT_AUTH_CONFIG);
  assert.equal(badScheme.ok, false);
  assert.equal(badScheme.error?.status, 400);
  assert.equal(badScheme.error?.error, 'invalid_request');

  const malformed = verifyAccessToken('Bearer not.a.valid.jwt.token', DEFAULT_AUTH_CONFIG);
  assert.equal(malformed.ok, false);
  assert.equal(malformed.error?.status, 401);
  assert.equal(malformed.error?.error, 'invalid_token');
});

test('verifyAccessToken rejects tampered signature', () => {
  const token = createTestAccessToken(
    {
      sub: 'usr_123',
      iss: EXPECTED_ISSUER,
      aud: EXPECTED_AUDIENCE,
      scope: 'mcp:write',
    },
    TEST_SECRET
  );

  const result = verifyAccessToken(`Bearer ${token}`, {
    ...DEFAULT_AUTH_CONFIG,
    secretKey: 'wrong-secret-key-different-hash!',
  });

  assert.equal(result.ok, false);
  assert.equal(result.error?.status, 401);
  assert.equal(result.error?.error, 'invalid_token');
  assert.ok(result.error?.errorDescription.includes('Invalid token signature'));
});

test('verifyAccessToken rejects expired token (RFC 6750)', () => {
  const expiredToken = createTestAccessToken(
    {
      sub: 'usr_123',
      iss: EXPECTED_ISSUER,
      aud: EXPECTED_AUDIENCE,
      scope: 'mcp:write',
      expiresInSeconds: -60, // Expired 60s ago
    },
    TEST_SECRET
  );

  const result = verifyAccessToken(`Bearer ${expiredToken}`, DEFAULT_AUTH_CONFIG);
  assert.equal(result.ok, false);
  assert.equal(result.error?.status, 401);
  assert.equal(result.error?.error, 'invalid_token');
  assert.ok(result.error?.errorDescription.includes('expired'));
});

test('verifyAccessToken rejects issuer mismatch', () => {
  const badIssuerToken = createTestAccessToken(
    {
      sub: 'usr_123',
      iss: 'https://rogue-auth.example.com',
      aud: EXPECTED_AUDIENCE,
      scope: 'mcp:write',
    },
    TEST_SECRET
  );

  const result = verifyAccessToken(`Bearer ${badIssuerToken}`, DEFAULT_AUTH_CONFIG);
  assert.equal(result.ok, false);
  assert.equal(result.error?.status, 401);
  assert.ok(result.error?.errorDescription.includes('issuer mismatch'));
});

test('verifyAccessToken rejects audience mismatch (RFC 9068)', () => {
  const wrongAudienceToken = createTestAccessToken(
    {
      sub: 'usr_123',
      iss: EXPECTED_ISSUER,
      aud: 'https://other-service.example.com/api',
      scope: 'mcp:write',
    },
    TEST_SECRET
  );

  const result = verifyAccessToken(`Bearer ${wrongAudienceToken}`, DEFAULT_AUTH_CONFIG);
  assert.equal(result.ok, false);
  assert.equal(result.error?.status, 403);
  assert.equal(result.error?.error, 'invalid_token');
  assert.ok(result.error?.errorDescription.includes('audience mismatch'));
  assert.ok(result.error?.wwwAuthenticate.includes('resource="https://slopboy.com/api/mcp"'));
});

test('verifyAccessToken rejects insufficient scope with RFC 6750 403', () => {
  const readOnlyToken = createTestAccessToken(
    {
      sub: 'usr_123',
      iss: EXPECTED_ISSUER,
      aud: EXPECTED_AUDIENCE,
      scope: 'mcp:read', // Missing mcp:write
    },
    TEST_SECRET
  );

  const result = verifyAccessToken(`Bearer ${readOnlyToken}`, {
    ...DEFAULT_AUTH_CONFIG,
    requiredScope: 'mcp:write',
  });

  assert.equal(result.ok, false);
  assert.equal(result.error?.status, 403);
  assert.equal(result.error?.error, 'insufficient_scope');
  assert.ok(result.error?.wwwAuthenticate.includes('scope="mcp:write"'));
});

test('handleMcpHttpRequest responds to OPTIONS with CORS headers', async () => {
  const res = await handleMcpHttpRequest(
    {
      method: 'OPTIONS',
      headers: {},
      body: '',
    },
    { authConfig: DEFAULT_AUTH_CONFIG }
  );

  assert.equal(res.status, 204);
  assert.equal(res.headers['Access-Control-Allow-Origin'], '*');
  assert.ok(res.headers['Access-Control-Allow-Methods'].includes('POST'));
});

test('handleMcpHttpRequest responds to GET with server information and discovery', async () => {
  const res = await handleMcpHttpRequest(
    {
      method: 'GET',
      headers: {},
      body: '',
    },
    { authConfig: DEFAULT_AUTH_CONFIG }
  );

  assert.equal(res.status, 200);
  const json = JSON.parse(res.body);
  assert.equal(json.status, 'ok');
  assert.equal(json.protocolVersion, MCP_PROTOCOL_VERSION);
  assert.equal(json.server.name, MCP_SERVER_INFO.name);
});

test('handleMcpHttpRequest processes initialize and ping JSON-RPC methods', async () => {
  const initRes = await handleMcpHttpRequest(
    {
      method: 'POST',
      headers: {},
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { clientInfo: { name: 'claude-desktop', version: '1.0' } },
      }),
    },
    { authConfig: DEFAULT_AUTH_CONFIG }
  );

  assert.equal(initRes.status, 200);
  const initJson = JSON.parse(initRes.body);
  assert.equal(initJson.result.protocolVersion, MCP_PROTOCOL_VERSION);
  assert.equal(initJson.result.serverInfo.name, 'slopboy-remote-mcp');

  const pingRes = await handleMcpHttpRequest(
    {
      method: 'POST',
      headers: {},
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' }),
    },
    { authConfig: DEFAULT_AUTH_CONFIG }
  );

  assert.equal(pingRes.status, 200);
  const pingJson = JSON.parse(pingRes.body);
  assert.deepEqual(pingJson.result, {});
});

test('handleMcpHttpRequest lists tools without authentication', async () => {
  const res = await handleMcpHttpRequest(
    {
      method: 'POST',
      headers: {},
      body: JSON.stringify({ jsonrpc: '2.0', id: 10, method: 'tools/list' }),
    },
    { authConfig: DEFAULT_AUTH_CONFIG }
  );

  assert.equal(res.status, 200);
  const json = JSON.parse(res.body);
  assert.ok(Array.isArray(json.result.tools));
  assert.equal(json.result.tools.length, 6);

  const toolNames = json.result.tools.map((t: any) => t.name);
  assert.ok(toolNames.includes('list_supported_engines'));
  assert.ok(toolNames.includes('get_engine_capabilities'));
  assert.ok(toolNames.includes('recommend_engine'));
  assert.ok(toolNames.includes('get_game_template'));
  assert.ok(toolNames.includes('validate_game_source'));
  assert.ok(toolNames.includes('create_game_draft'));
});

test('handleMcpHttpRequest executes public discovery tools without authentication', async () => {
  // list_supported_engines
  const listRes = await handleMcpHttpRequest(
    {
      method: 'POST',
      headers: {},
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: { name: 'list_supported_engines', arguments: {} },
      }),
    },
    { authConfig: DEFAULT_AUTH_CONFIG }
  );

  assert.equal(listRes.status, 200);
  const listJson = JSON.parse(listRes.body);
  const engines = JSON.parse(listJson.result.content[0].text);
  assert.equal(engines.length, 4);

  // recommend_engine
  const recRes = await handleMcpHttpRequest(
    {
      method: 'POST',
      headers: {},
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 12,
        method: 'tools/call',
        params: { name: 'recommend_engine', arguments: { prompt: 'space arcade shooter' } },
      }),
    },
    { authConfig: DEFAULT_AUTH_CONFIG }
  );

  assert.equal(recRes.status, 200);
  const recJson = JSON.parse(recRes.body);
  const recommendation = JSON.parse(recJson.result.content[0].text);
  assert.equal(recommendation.recommendedEngine, 'kaplay');
});

test('create_game_draft rejects unauthenticated or unauthorized callers', async () => {
  // 1. Missing Authorization header
  const unauthRes = await handleMcpHttpRequest(
    {
      method: 'POST',
      headers: {},
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 20,
        method: 'tools/call',
        params: {
          name: 'create_game_draft',
          arguments: {
            engineId: 'kaplay',
            title: 'My Game',
            sourceCode: 'export default function setup() {}',
          },
        },
      }),
    },
    { authConfig: DEFAULT_AUTH_CONFIG }
  );

  assert.equal(unauthRes.status, 401);
  assert.ok(unauthRes.headers['WWW-Authenticate']?.includes('invalid_request'));

  // 2. Token with insufficient scope (read-only)
  const readToken = createTestAccessToken(
    {
      sub: 'usr_attacker',
      iss: EXPECTED_ISSUER,
      aud: EXPECTED_AUDIENCE,
      scope: 'mcp:read',
    },
    TEST_SECRET
  );

  const scopeRes = await handleMcpHttpRequest(
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${readToken}` },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 21,
        method: 'tools/call',
        params: {
          name: 'create_game_draft',
          arguments: {
            engineId: 'kaplay',
            title: 'My Game',
            sourceCode: 'export default function setup() {}',
          },
        },
      }),
    },
    { authConfig: DEFAULT_AUTH_CONFIG }
  );

  assert.equal(scopeRes.status, 403);
  assert.ok(scopeRes.headers['WWW-Authenticate']?.includes('insufficient_scope'));
});

test('create_game_draft succeeds with valid OAuth token and enforces server-derived ownerId', async () => {
  const validToken = createTestAccessToken(
    {
      sub: 'usr_legitimate_creator_uuid_123',
      iss: EXPECTED_ISSUER,
      aud: EXPECTED_AUDIENCE,
      scope: 'mcp:write',
      client_id: 'claude-remote-connector',
    },
    TEST_SECRET
  );

  const validCode = `
import kaplay from 'kaplay';
export default function setupGame(kInit, canvas) {}
`;

  let savedDraft: any = null;
  const res = await handleMcpHttpRequest(
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${validToken}` },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 30,
        method: 'tools/call',
        params: {
          name: 'create_game_draft',
          arguments: {
            engineId: 'kaplay',
            title: 'Laser Asteroid',
            sourceCode: validCode,
            // Attacker attempts to spoof ownerId/userId:
            userId: 'usr_impersonated_victim',
            ownerId: 'usr_impersonated_victim',
          },
        },
      }),
    },
    {
      authConfig: DEFAULT_AUTH_CONFIG,
      onSaveDraft: async draft => {
        savedDraft = draft;
      },
    }
  );

  assert.equal(res.status, 200);
  const json = JSON.parse(res.body);
  const payload = JSON.parse(json.result.content[0].text);

  assert.equal(payload.ok, true);
  assert.equal(payload.title, 'Laser Asteroid');
  assert.equal(payload.status, 'private_draft');
  assert.ok(payload.gameId);
  assert.ok(payload.revisionId);

  // CRITICAL DEFENSE: ownerId MUST be derived from token sub, NOT user-supplied spoofed parameter!
  assert.equal(payload.ownerId, 'usr_legitimate_creator_uuid_123');
  assert.notEqual(payload.ownerId, 'usr_impersonated_victim');

  assert.ok(savedDraft);
  assert.equal(savedDraft.ownerId, 'usr_legitimate_creator_uuid_123');
  assert.equal(savedDraft.title, 'Laser Asteroid');
});
