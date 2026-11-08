import { NextResponse } from 'next/server';
import { getProtectedResourceMetadata } from '@slopboy/mcp';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;

  const resourceUrl = process.env.MCP_RESOURCE_URL || `${origin}/api/mcp`;
  const authServerUrl = process.env.OAUTH_AUTH_SERVER_URL || process.env.NEON_AUTH_URL || `${origin}/api/auth`;

  const metadata = getProtectedResourceMetadata({
    resourceUrl,
    authServerUrl,
    documentationUrl: `${origin}/docs/mcp`,
  });

  return NextResponse.json(metadata, {
    status: 200,
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
