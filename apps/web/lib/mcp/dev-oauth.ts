import { createMcpAuth, type McpAuth } from '@neon/oauth/mcp';
import { createMetadataHandlers, withMcpAuth } from '@neon/oauth/mcp/next';
import { handleMcpHttpRequest } from '@slopboy/mcp';

const scope = 'openid';
const protocolVersion = '2025-06-18';
const accountTool = {
  name: 'get_connected_account',
  description: 'Returns the authorized Slopboy test account ID. Read only.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true },
};

function httpsUrl(value: string | undefined): URL | undefined {
  if (!value || !URL.canParse(value)) return;
  const url = new URL(value);
  if (url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash) return url;
}

export function readDevOAuthConfig(env: NodeJS.ProcessEnv) {
  if (env.VERCEL_ENV !== 'preview' || env.MCP_DEV_OAUTH_ENABLED !== '1') return;
  const issuer = httpsUrl(env.MCP_DEV_OAUTH_ISSUER);
  const resource = httpsUrl(env.MCP_DEV_OAUTH_RESOURCE);
  if (!issuer || !resource || resource.pathname !== '/api/mcp/dev') return;

  return {
    baseUrl: issuer.href.replace(/\/$/, ''),
    resource: resource.href,
    scopesSupported: [scope, 'offline_access'],
  };
}

export function createDevMcpHandlers(auth: McpAuth) {
  const metadata = createMetadataHandlers(auth);
  const protectedRequest = withMcpAuth(auth, async (request, identity) => {
    if (identity.expiresAt === undefined || !Number.isFinite(identity.expiresAt)) {
      return Response.json({ error: 'invalid_token' }, {
        status: 401,
        headers: { 'WWW-Authenticate': `Bearer error="invalid_token", resource_metadata="${auth.resourceMetadataUrl}"` },
      });
    }

    if (request.method === 'GET') {
      return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    }
    const body = await request.text();
    let message: {
      jsonrpc?: unknown;
      id?: string | number | null;
      method?: string;
      params?: { name?: string; arguments?: unknown };
    } | null;
    try {
      message = JSON.parse(body);
    } catch {
      message = null;
    }

    if (message?.jsonrpc === '2.0' && message.id === undefined && message.method === 'notifications/initialized') {
      return new Response(null, { status: 202 });
    }

    if (message?.jsonrpc === '2.0' && message.method === 'tools/call' && message.params?.name === accountTool.name) {
      const args = message.params.arguments;
      const id = message.id;
      if (typeof id !== 'string' && typeof id !== 'number') {
        return Response.json({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32600, message: 'A request ID is required' },
        }, { status: 400 });
      }
      if (args !== undefined && (typeof args !== 'object' || args === null || Array.isArray(args) || Object.keys(args).length > 0)) {
        return Response.json({
          jsonrpc: '2.0',
          id: message.id,
          error: { code: -32602, message: 'This tool takes no arguments' },
        });
      }
      return Response.json({
        jsonrpc: '2.0',
        id: message.id,
        result: { content: [{ type: 'text', text: JSON.stringify({ accountId: identity.sub }) }] },
      });
    }

    const response = await handleMcpHttpRequest({ method: 'POST', headers: {}, body }, {});
    if (response.status === 200 && (message?.method === 'initialize' || message?.method === 'tools/list')) {
      const data = JSON.parse(response.body);
      if (data.result && message.method === 'initialize') data.result.protocolVersion = protocolVersion;
      if (data.result && message.method === 'tools/list') data.result.tools.push(accountTool);
      return Response.json(data);
    }

    return new Response(response.body, { status: response.status, headers: response.headers });
  }, { requiredScopes: [scope] });

  return {
    metadata,
    async handleRequest(request: Request) {
      const response = await protectedRequest(request, undefined);
      response.headers.set('Cache-Control', 'no-store');
      return response;
    },
  };
}

let handlers: ReturnType<typeof createDevMcpHandlers> | undefined;

export function devMcpHandlers() {
  const config = readDevOAuthConfig(process.env);
  if (!config) return;
  return handlers ??= createDevMcpHandlers(createMcpAuth(config));
}
