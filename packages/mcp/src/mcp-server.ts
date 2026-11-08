/**
 * Slopboy Remote MCP Server.
 *
 * Implements the Model Context Protocol (MCP) specification over Streamable HTTP.
 * Serves both ChatGPT Plugins and Claude Remote MCP Connectors through a single unified contract:
 * - Public Discovery Tools: list_supported_engines, get_engine_capabilities, recommend_engine, get_game_template, validate_game_source.
 * - Privileged Mutation Tools: create_game_draft.
 * - Enforces OAuth 2.1 authentication and resource audience verification.
 * - Binds game draft ownership strictly to the authenticated subject (sub); NEVER trusts caller-supplied user IDs.
 */

import { randomUUID } from 'node:crypto';
import {
  listSupportedEngines,
  getEngineCapabilities,
  recommendEngine,
  getGameTemplate,
  validateGameSource,
  getEngineDescriptor,
  validateManifestV2,
  type CartridgeManifestV2,
} from '@slopboy/cartridge';
import { V2_DEVICE_1000 } from '@slopboy/hardware/v2';
import {
  verifyAccessToken,
  type TokenVerificationOptions,
  type AuthSubject,
} from './oauth-verifier.ts';

export const MCP_PROTOCOL_VERSION = '2024-11-05';
export const MCP_SERVER_INFO = Object.freeze({
  name: 'slopboy-remote-mcp',
  version: '0.1.0',
});

export interface McpToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly requiresScope?: string;
}

export const MCP_TOOLS: readonly McpToolDefinition[] = Object.freeze([
  {
    name: 'list_supported_engines',
    description: 'Lists all approved and candidate Slopboy game engines, pinned versions, capabilities, and virtual hardware display specifications.',
    inputSchema: {
      type: 'object',
      properties: {
        deviceProfile: {
          type: 'string',
          description: 'Target device profile (default: "slopboy-1000")',
        },
      },
    },
  },
  {
    name: 'get_engine_capabilities',
    description: 'Retrieves allowed imports, forbidden APIs, hardware constraints, and entrypoint guidelines for a specific engine.',
    inputSchema: {
      type: 'object',
      properties: {
        engineId: {
          type: 'string',
          description: 'Engine identifier (e.g. "kaplay", "pixel-v1", "phaser", "pixi")',
        },
        deviceProfile: {
          type: 'string',
          description: 'Target device profile (default: "slopboy-1000")',
        },
      },
      required: ['engineId'],
    },
  },
  {
    name: 'recommend_engine',
    description: 'Recommends an approved game engine and architecture based on the user prompt, gameplay genre, or mechanics.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'User prompt or game genre description (e.g. "retro arcade platformer", "physics puzzle", "tilemap RPG")',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'get_game_template',
    description: 'Generates a complete, typed, and validated starter cartridge project with manifest, entrypoint source, and controls.',
    inputSchema: {
      type: 'object',
      properties: {
        engineId: {
          type: 'string',
          description: 'Engine identifier ("kaplay", "pixel-v1", "phaser", "pixi")',
        },
        title: {
          type: 'string',
          description: 'Game title (max 80 chars)',
        },
        deviceProfile: {
          type: 'string',
          description: 'Target device profile (default: "slopboy-1000")',
        },
      },
      required: ['engineId'],
    },
  },
  {
    name: 'validate_game_source',
    description: 'Validates cartridge TypeScript/JavaScript source code and manifest against Slopboy security rules, returning structured, actionable diagnostics for self-correction.',
    inputSchema: {
      type: 'object',
      properties: {
        engineId: {
          type: 'string',
          description: 'Engine identifier ("kaplay", "pixel-v1")',
        },
        sourceCode: {
          type: 'string',
          description: 'Complete entrypoint source code',
        },
        manifest: {
          type: 'object',
          description: 'Optional partial or complete manifest.json object',
        },
      },
      required: ['engineId', 'sourceCode'],
    },
  },
  {
    name: 'create_game_draft',
    description: 'Creates a private game draft owned by the authenticated creator. Requires OAuth 2.1 token with mcp:write scope. Never accepts client-supplied user IDs.',
    requiresScope: 'mcp:write',
    inputSchema: {
      type: 'object',
      properties: {
        engineId: {
          type: 'string',
          description: 'Engine identifier ("kaplay", "pixel-v1")',
        },
        title: {
          type: 'string',
          description: 'Game title (1 to 80 characters)',
        },
        sourceCode: {
          type: 'string',
          description: 'Complete entrypoint source code',
        },
        deviceProfile: {
          type: 'string',
          description: 'Device profile (default: "slopboy-1000")',
        },
      },
      required: ['engineId', 'title', 'sourceCode'],
    },
  },
]);

export interface McpServerOptions {
  readonly authConfig?: TokenVerificationOptions;
  readonly onSaveDraft?: (draft: {
    readonly gameId: string;
    readonly revisionId: string;
    readonly ownerId: string;
    readonly title: string;
    readonly engineId: string;
    readonly engineVersion: string;
    readonly sourceCode: string;
    readonly status: 'private_draft';
    readonly createdAt: string;
  }) => Promise<void>;
}

export interface JsonRpcRequest {
  readonly jsonrpc: '2.0';
  readonly id?: string | number | null;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  readonly jsonrpc: '2.0';
  readonly id?: string | number | null;
  readonly result?: unknown;
  readonly error?: {
    readonly code: number;
    readonly message: string;
    readonly data?: unknown;
  };
}

export interface McpHttpRequest {
  readonly method: string;
  readonly headers: Record<string, string | undefined>;
  readonly body: string | unknown;
}

export interface McpHttpResponse {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: string;
}

export async function handleMcpHttpRequest(
  req: McpHttpRequest,
  options: McpServerOptions
): Promise<McpHttpResponse> {
  const jsonHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (req.method === 'OPTIONS') {
    return { status: 204, headers: jsonHeaders, body: '' };
  }

  if (req.method === 'GET') {
    // Health / Server Info
    return {
      status: 200,
      headers: jsonHeaders,
      body: JSON.stringify({
        status: 'ok',
        server: MCP_SERVER_INFO,
        protocolVersion: MCP_PROTOCOL_VERSION,
        endpoints: {
          mcp: '/api/mcp',
          protectedResourceMetadata: '/.well-known/oauth-protected-resource',
        },
      }),
    };
  }

  if (req.method !== 'POST') {
    return {
      status: 405,
      headers: { ...jsonHeaders, Allow: 'GET, POST, OPTIONS' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  let jsonRpc: JsonRpcRequest;
  try {
    jsonRpc = typeof req.body === 'string' ? JSON.parse(req.body) : req.body as JsonRpcRequest;
  } catch {
    return {
      status: 400,
      headers: jsonHeaders,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error: invalid JSON' },
      }),
    };
  }

  if (!jsonRpc || jsonRpc.jsonrpc !== '2.0' || !jsonRpc.method) {
    return {
      status: 400,
      headers: jsonHeaders,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: jsonRpc?.id ?? null,
        error: { code: -32600, message: 'Invalid Request: jsonrpc 2.0 and method required' },
      }),
    };
  }

  const authHeader = req.headers['authorization'] || req.headers['Authorization'];

  try {
    const result = await processJsonRpc(jsonRpc, authHeader, options);
    return {
      status: 200,
      headers: jsonHeaders,
      body: JSON.stringify(result),
    };
  } catch (err: unknown) {
    const errorRecord = err as {
      status?: number;
      code?: number;
      message?: string;
      wwwAuthenticate?: string;
    };
    const status = errorRecord.status || 500;
    const responseHeaders: Record<string, string> = { ...jsonHeaders };
    if (errorRecord.wwwAuthenticate) {
      responseHeaders['WWW-Authenticate'] = errorRecord.wwwAuthenticate;
    }

    return {
      status,
      headers: responseHeaders,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: jsonRpc.id ?? null,
        error: {
          code: errorRecord.code || -32603,
          message: errorRecord.message || 'Internal error',
        },
      }),
    };
  }
}

export async function processJsonRpc(
  req: JsonRpcRequest,
  authHeader: string | undefined,
  options: McpServerOptions
): Promise<JsonRpcResponse> {
  const { id, method, params } = req;

  switch (method) {
    case 'initialize': {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {
            tools: {
              listChanged: false,
            },
          },
          serverInfo: MCP_SERVER_INFO,
        },
      };
    }

    case 'ping': {
      return { jsonrpc: '2.0', id, result: {} };
    }

    case 'tools/list': {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: MCP_TOOLS.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        },
      };
    }

    case 'tools/call': {
      if (!params || typeof params.name !== 'string') {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: 'Invalid params: "name" required' },
        };
      }

      const toolName = params.name;
      const toolArgs = (params.arguments || {}) as Record<string, unknown>;
      const toolDef = MCP_TOOLS.find(t => t.name === toolName);

      if (!toolDef) {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Tool not found: "${toolName}"` },
        };
      }

      // Check if tool requires authorization
      let subject: AuthSubject | undefined = undefined;
      if (toolDef.requiresScope) {
        if (!options.authConfig) {
          const error: any = new Error('OAuth authentication not configured on server');
          error.status = 500;
          error.code = -32603;
          throw error;
        }

        const authResult = verifyAccessToken(authHeader, {
          ...options.authConfig,
          requiredScope: toolDef.requiresScope,
        });

        if (!authResult.ok || !authResult.subject) {
          const authError: any = new Error(authResult.error?.errorDescription || 'Unauthorized');
          authError.status = authResult.error?.status || 401;
          authError.code = authResult.error?.status === 403 ? -32003 : -32001;
          authError.wwwAuthenticate = authResult.error?.wwwAuthenticate;
          throw authError;
        }

        subject = authResult.subject;
      }

      const callResult = await executeTool(toolName, toolArgs, subject, options);

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: typeof callResult === 'string' ? callResult : JSON.stringify(callResult, null, 2),
            },
          ],
        },
      };
    }

    default:
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: "${method}"` },
      };
  }
}

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  subject: AuthSubject | undefined,
  options: McpServerOptions
): Promise<unknown> {
  switch (name) {
    case 'list_supported_engines': {
      const deviceProfile = typeof args.deviceProfile === 'string' ? args.deviceProfile : undefined;
      return listSupportedEngines({ deviceProfile });
    }

    case 'get_engine_capabilities': {
      const engineId = String(args.engineId || '');
      const deviceProfile = typeof args.deviceProfile === 'string' ? args.deviceProfile : undefined;
      return getEngineCapabilities({ engineId, deviceProfile });
    }

    case 'recommend_engine': {
      const prompt = String(args.prompt || '');
      return recommendEngine(prompt);
    }

    case 'get_game_template': {
      const engineId = String(args.engineId || '');
      const title = typeof args.title === 'string' ? args.title : undefined;
      const deviceProfile = typeof args.deviceProfile === 'string' ? args.deviceProfile : undefined;
      return getGameTemplate({ engineId, title, deviceProfile });
    }

    case 'validate_game_source': {
      const engineId = String(args.engineId || '');
      const sourceCode = String(args.sourceCode || '');
      const manifest = args.manifest as Partial<CartridgeManifestV2> | undefined;
      return validateGameSource({ engineId, sourceCode, manifest });
    }

    case 'create_game_draft': {
      if (!subject) {
        throw new Error('create_game_draft requires authenticated subject');
      }

      const engineId = String(args.engineId || '');
      const title = String(args.title || '').trim();
      const sourceCode = String(args.sourceCode || '');
      const deviceProfile = typeof args.deviceProfile === 'string' ? args.deviceProfile : V2_DEVICE_1000.id;

      const desc = getEngineDescriptor(engineId);
      if (!desc) {
        throw new Error(`Unsupported engine "${engineId}"`);
      }

      // Validate source code first
      const validation = validateGameSource({ engineId, sourceCode });
      if (!validation.valid) {
        return {
          ok: false,
          error: 'VALIDATION_FAILED',
          message: 'Game source failed security and syntax validation',
          diagnostics: validation.diagnostics,
        };
      }

      // Server assigns immutable UUIDs and binds ownership to authenticated subject
      const gameId = randomUUID();
      const revisionId = randomUUID();
      const ownerId = subject.userId; // NEVER from args!

      const draftRecord = {
        gameId,
        revisionId,
        ownerId,
        title,
        engineId: desc.id,
        engineVersion: desc.version,
        sourceCode,
        status: 'private_draft' as const,
        createdAt: new Date().toISOString(),
      };

      if (options.onSaveDraft) {
        await options.onSaveDraft(draftRecord);
      }

      return {
        ok: true,
        gameId,
        revisionId,
        ownerId,
        title,
        engine: {
          id: desc.id,
          version: desc.version,
        },
        status: 'private_draft',
        message: 'Private draft created successfully. Stored in creator dashboard.',
      };
    }

    default:
      throw new Error(`Unhandled tool: "${name}"`);
  }
}
