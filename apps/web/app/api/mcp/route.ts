import { NextRequest, NextResponse } from 'next/server';
import { handleMcpHttpRequest, type TokenVerificationOptions } from '@slopboy/mcp';

export const dynamic = 'force-dynamic';

function getAuthConfig(origin: string): TokenVerificationOptions | undefined {
  const secretKey = process.env.MCP_JWT_SECRET || process.env.NEON_AUTH_SECRET || 'dev-mcp-secret-key-32-bytes-minimum-length!';
  const expectedIssuer = process.env.OAUTH_AUTH_SERVER_URL || process.env.NEON_AUTH_URL || `${origin}/api/auth`;
  const expectedAudience = process.env.MCP_RESOURCE_AUDIENCE || process.env.MCP_RESOURCE_URL || `${origin}/api/mcp`;

  return {
    secretKey,
    expectedIssuer,
    expectedAudience,
    requiredScope: 'mcp:write',
  };
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
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
    { authConfig: getAuthConfig(origin) }
  );

  return new NextResponse(mcpResponse.body, {
    status: mcpResponse.status,
    headers: mcpResponse.headers,
  });
}

export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
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
    { authConfig: getAuthConfig(origin) }
  );

  return new NextResponse(mcpResponse.body, {
    status: mcpResponse.status,
    headers: mcpResponse.headers,
  });
}
