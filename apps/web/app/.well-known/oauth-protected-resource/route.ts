import { NextResponse } from 'next/server';
import { getProtectedResourceMetadata } from '@slopboy/mcp';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;

  const resourceUrl = process.env.MCP_RESOURCE_AUDIENCE || process.env.MCP_RESOURCE_URL;
  const authServerUrl = process.env.OAUTH_AUTH_SERVER_URL;
  // Do not advertise a nonexistent OAuth issuer or consent flow.
  if (!resourceUrl || !authServerUrl ||
      !resourceUrl.startsWith('https://') || !authServerUrl.startsWith('https://')) {
    return NextResponse.json({ error: 'OAuth provider not configured' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
  }

  const metadata = getProtectedResourceMetadata({
    resourceUrl,
    authServerUrl,
    documentationUrl: `${origin}/docs/mcp`,
  });

  return NextResponse.json(metadata, {
    status: 200,
    headers: {
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
