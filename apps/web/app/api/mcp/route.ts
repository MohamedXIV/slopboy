import { NextRequest, NextResponse } from 'next/server';
import { handleMcpHttpRequest, type TokenVerificationOptions } from '@slopboy/mcp';

export const dynamic = 'force-dynamic';

function getAuthConfig(): TokenVerificationOptions | undefined {
  // This spike only supports explicitly configured HS256 test issuers.
  // NEON_AUTH_SECRET is not a JWT access-token verification key, and there must
  // never be a publicly known fallback secret in a deployed application.
  const secretKey = process.env.MCP_JWT_SECRET;
  const expectedIssuer = process.env.OAUTH_AUTH_SERVER_URL;
  const expectedAudience = process.env.MCP_RESOURCE_AUDIENCE;
  if (!secretKey || Buffer.byteLength(secretKey, 'utf8') < 32 ||
      !expectedIssuer || !expectedAudience) {
    return undefined; // fail closed; no authenticated writes
  }
  return { secretKey, expectedIssuer, expectedAudience, requiredScope: 'mcp:write' };
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { Allow: 'GET, POST, OPTIONS' },
  });
}

export async function GET(request: NextRequest) {
  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => {
    headers[k] = v;
  });

  const mcpResponse = await handleMcpHttpRequest(
    {
      method: 'GET',
      headers,
      body: '',
    },
    { authConfig: getAuthConfig() }
  );

  return new NextResponse(mcpResponse.body, {
    status: mcpResponse.status,
    headers: mcpResponse.headers,
  });
}

export async function POST(request: NextRequest) {
  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => {
    headers[k] = v;
  });

  let body = '';
  try {
    body = await request.text();
  } catch {
    body = '';
  }

  const mcpResponse = await handleMcpHttpRequest(
    {
      method: 'POST',
      headers,
      body,
    },
    { authConfig: getAuthConfig() }
  );

  return new NextResponse(mcpResponse.body, {
    status: mcpResponse.status,
    headers: mcpResponse.headers,
  });
}
