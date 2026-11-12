/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9704).
 *
 * Exposes resource metadata so ChatGPT Plugins, Claude Remote MCP Connectors,
 * and OAuth 2.1 clients can automatically discover authorization servers,
 * supported scopes, and token requirements.
 */

export interface ProtectedResourceMetadata {
  readonly resource: string;
  readonly authorization_servers: readonly string[];
  readonly scopes_supported: readonly string[];
  readonly bearer_methods_supported: readonly string[];
  readonly resource_documentation?: string;
  readonly dpop_signing_alg_values_supported?: readonly string[];
}

export interface ProtectedResourceConfig {
  readonly resourceUrl: string;
  readonly authServerUrl: string;
  readonly documentationUrl?: string;
}

export function getProtectedResourceMetadata(config: ProtectedResourceConfig): ProtectedResourceMetadata {
  return {
    resource: config.resourceUrl,
    authorization_servers: [config.authServerUrl],
    scopes_supported: ['mcp:read', 'mcp:write', 'mcp:admin'],
    bearer_methods_supported: ['header'],
    resource_documentation: config.documentationUrl || `${config.resourceUrl}/docs`,
  };
}
