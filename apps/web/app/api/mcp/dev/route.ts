import { devMcpHandlers } from '@/lib/mcp/dev-oauth';

export const dynamic = 'force-dynamic';

function handleRequest(request: Request) {
  return devMcpHandlers()?.handleRequest(request) ??
    new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

export { handleRequest as GET, handleRequest as POST };
