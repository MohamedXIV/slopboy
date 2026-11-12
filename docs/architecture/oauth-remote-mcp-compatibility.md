# OAuth 2.1 and Remote MCP Protected Resource Compatibility Spike

**Deliverable for Issue #28** · **Date:** 2026-11-08  
**Parent Epic:** #17 (ChatGPT / Claude Remote MCP Integration)  
**Author:** Lead Software Engineer

---

## 1. Executive Summary

This spike investigates, specifies, and implements the **OAuth 2.1 Protected Resource** and **Streamable HTTP Model Context Protocol (MCP)** server for Slopboy.

### Core Architecture Findings

1. **One Unified Remote MCP Endpoint (`/api/mcp`):**
   - Both **ChatGPT Plugins** and **Claude Remote MCP Connectors** connect to the exact same HTTPS endpoint using the standard Model Context Protocol (JSON-RPC 2.0 over Streamable HTTP).
   - Unauthenticated discovery tools (`list_supported_engines`, `get_engine_capabilities`, `recommend_engine`, `get_game_template`, `validate_game_source`) are accessible for context discovery.
   - Privileged write tools (`create_game_draft`) strictly require an OAuth 2.1 Bearer Token with `mcp:write` scope.

2. **RFC 9704 Protected Resource Discovery (`/.well-known/oauth-protected-resource`):**
   - Automatically informs connecting AI agents where to obtain authorization, which scopes are required, and the exact resource URI to include in the token audience claim (`aud`).

3. **Strict Audience and Subject Enforcement:**
   - **Audience Binding (RFC 9068):** The token `aud` claim must explicitly match the Slopboy MCP resource (`https://slopboy.com/mcp` or configured resource URI). Tokens issued for other APIs or general login cannot be replayed against Slopboy.
   - **Server-Derived Subject (`sub`):** Draft ownership is assigned exclusively to `token.sub`. The API server **never accepts a `userId` or `ownerId` supplied in client arguments or model completions**.

4. **Neon Managed Better Auth (`@neon/oauth`):**
   - Neon's November 2026 Managed Better Auth ships an OAuth 2.1 Provider supporting Authorization Code + PKCE S256, token refresh, revocation, and CIMD.
   - Slopboy's MCP resource layer verifies access tokens via HMAC-SHA256 (in development) or RS256/ES256 JWKS public key introspection against the Neon Auth issuer.

---

## 2. Specification & Standards Mapping

| Standard | Role in Slopboy | Implementation |
|---|---|---|
| **RFC 9704** | OAuth 2.0 Protected Resource Metadata | `GET /.well-known/oauth-protected-resource` returns `resource`, `authorization_servers`, and `scopes_supported`. |
| **RFC 8414** | OAuth 2.0 Authorization Server Metadata | `/.well-known/oauth-authorization-server` endpoint hosted by Neon Auth. |
| **RFC 7636** | Proof Key for Code Exchange (PKCE) | Enforces `code_challenge_method: S256` for both ChatGPT and Claude during authorization code exchange. |
| **RFC 6750** | Bearer Token Usage | Parses `Authorization: Bearer <token>` and returns standardized `WWW-Authenticate` headers on error. |
| **RFC 9068** | JWT Profile for Access Tokens | Validates `iss` (issuer), `aud` (resource audience), `sub` (user UUID), `exp` (expiry), `nbf` (not before), and `scope`. |
| **MCP 2024-11-05** | Model Context Protocol | JSON-RPC 2.0 protocol over Streamable HTTP (`initialize`, `tools/list`, `tools/call`, `ping`). |

---

## 3. Scope Hierarchy

```text
mcp:read    -> Inspect engine capabilities, templates, validate source (read-only)
mcp:write   -> Create private game drafts, upload cartridge files, trigger builds
mcp:admin   -> Operator moderation queue, review requests, audit log queries
```

---

## 4. Threat Model and Validation Rules

```text
AI Client (ChatGPT / Claude)
          |
          | 1. Discovers Protected Resource Metadata (RFC 9704)
          v
/.well-known/oauth-protected-resource
          |
          | 2. Redirects user to Neon Auth for Consent (PKCE S256)
          v
Neon Managed Better Auth
          |
          | 3. Returns Access Token (aud="https://slopboy.com/mcp", scope="mcp:write", sub=UUID)
          v
POST /api/mcp (tools/call: create_game_draft)
          |
          | 4. Server verifies:
          |    - Valid signature
          |    - Not expired (exp > now)
          |    - Matching issuer (iss == Neon Auth)
          |    - Matching audience (aud == Slopboy MCP Resource)
          |    - Scope contains "mcp:write"
          v
Create Draft:
  - gameId = randomUUID()
  - revisionId = randomUUID()
  - ownerId = token.sub (IGNORES any user-supplied ownerId)
  - status = "private_draft"
```

### Security Gates Enforced by Token Verifier:
1. **Missing Authorization Header:** Returns `401 Unauthorized` with `WWW-Authenticate: Bearer error="invalid_request"`.
2. **Invalid Signature / Malformed Token:** Returns `401 Unauthorized` with `WWW-Authenticate: Bearer error="invalid_token"`.
3. **Expired Token:** Returns `401 Unauthorized` with `WWW-Authenticate: Bearer error="invalid_token", error_description="Token expired"`.
4. **Mismatched Audience:** Returns `403 Forbidden` with `WWW-Authenticate: Bearer error="invalid_token", error_description="Audience mismatch"`.
5. **Insufficient Scope:** Returns `403 Forbidden` with `WWW-Authenticate: Bearer error="insufficient_scope", scope="mcp:write"`.
6. **Owner Spoofing Defense:** Any `userId` or `ownerId` parameter in `args` is discarded; ownership is bound exclusively to `subject.userId`.

---

## 5. Client Integration Constraints

### ChatGPT Plugin / Action
- **OAuth Callback URL:** `https://chatgpt.com/api/aip/plugin-.../oauth/callback`
- **PKCE:** S256 required.
- **Client Authentication:** Public client with PKCE, or confidential client with client secret configured in OpenAI Plugin Developer Portal.
- **Audience:** Must pass `resource: https://slopboy.com/api/mcp` during token exchange.

### Claude Custom Remote MCP Connector
- **OAuth Callback URL:** `https://claude.ai/api/mcp/oauth_callback`
- **Connector Type:** Streamable HTTP over HTTPS.
- **Audience:** Verified against MCP resource URL.

---

## 6. Verification and Test Results

All test cases are implemented and automated in `tests/mcp-oauth.test.ts`:
- RFC 9704 Protected Resource Metadata returns expected discovery JSON.
- Public discovery tools (`list_supported_engines`, `get_engine_capabilities`, `recommend_engine`, `get_game_template`, `validate_game_source`) execute without authentication.
- Privileged `create_game_draft` rejects unauthenticated, malformed, expired, wrong-audience, and wrong-scope requests with RFC 6750 error responses.
- Privileged `create_game_draft` succeeds with a valid token and derives `ownerId` from the token subject.
