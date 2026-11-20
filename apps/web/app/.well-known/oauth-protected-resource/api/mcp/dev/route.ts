import { devMcpHandlers } from '@/lib/mcp/dev-oauth';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return devMcpHandlers()?.metadata.GET(request) ??
    new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

export function OPTIONS(request: Request) {
  return devMcpHandlers()?.metadata.OPTIONS(request) ??
    new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
}
