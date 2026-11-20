# OAuth and remote MCP compatibility

[Issue #28](https://github.com/MohamedXIV/slopboy/issues/28) tracks provider compatibility. This spike tests the resource-server half with the official `@neon/oauth` SDK. Live ChatGPT and Claude OAuth acceptance remains open.

## What the spike verified

Run `pnpm exec node --experimental-strip-types --test tests/neon-oauth-compatibility.test.ts`. The test uses `@neon/oauth@0.3.0`, the Next.js SDK adapters, a loopback issuer with discovery and JWKS, and ephemeral Ed25519 keys. The protected handler returns the verified subject and client ID. It has no storage or mutation capability.

| Case | Observed SDK result |
| --- | --- |
| Bare and path-specific RFC 9728 metadata | `200` with the exact resource, issuer and advertised scopes |
| Missing bearer token | `401` with `WWW-Authenticate` and the path-specific `resource_metadata` URL |
| Signature and resource valid, `openid` present | `200` with the signed `sub` and `client_id` |
| Wrong audience, different issuer with the same signing key, expired token, missing subject, or bad signature | `401 invalid_token` |
| Neon-shaped `openid offline_access` grant on a route that requires `mcp:write` | `403 insufficient_scope` |
| Authorization server discovery unavailable | `503` |

The existing `/api/mcp` route still uses the HS256 test-issuer verifier and serves public tools without a token. This work does not swap its verifier or expose a protected write tool. Loopback results cover the SDK adapter and JWT checks, while provider consent, authorization code exchange, and connector behavior require separate live evidence.

## Managed Neon compatibility limits

- **Scopes.** Managed Better Auth documents a fixed scope set of `openid`, `profile`, `email`, and `offline_access`. Slopboy currently expects `mcp:write`. Accepting an OpenID profile scope for a game mutation would change the permission model. For writes, either choose a provider that issues the application scope or implement explicit Slopboy-side delegated consent and revocation tied to the verified issuer, subject, client and resource. Keep writes disabled until that decision and #29's ownership-aware storage are verified.
- **Resource and audience.** Use the exact stable HTTPS endpoint URL including `/api/mcp` for the MCP resource, `aud`, and RFC 9728 metadata. Neon documents that clients must send `resource` with both authorization and token requests for JWT issuance. Set the issuer to the exact development branch's Neon Auth URL, including its path. Signing keys alone do not distinguish Neon branches.
- **Withdrawal and expiry.** Neon documents one-hour access JWTs and refresh-token rotation with `offline_access`. Removing the resource prevents new issuance but already-issued JWTs stay valid until expiry. Record both refresh behavior after disconnect and access behavior with the previously issued token. If immediate loss of write access is required, enforce a server-side active grant on every write or choose a provider that supports the required revocation semantics.
- **Sign-in and consent.** The provider requires the application to host both pages on a trusted domain. The existing dashboard login does not itself prove that signed OAuth continuation and an approval or denial work. Check how each connector registers, and verify the exact redirect and token endpoint authentication method. Neon documents `client_secret_basic` for confidential clients and PKCE for public clients.

[Neon OAuth provider guide](https://neon.com/docs/auth/guides/plugins/oauth-provider) · [Official SDK](https://www.npmjs.com/package/@neon/oauth/v/0.3.0) · [RFC 9728](https://www.rfc-editor.org/rfc/rfc9728)

## Live read-only acceptance

Use an authorized dev Neon Auth branch, a stable externally reachable HTTPS MCP endpoint and hosted login and consent pages, plus access to private ChatGPT and Claude connector settings. Set the endpoint URL as the dev provider's MCP resource. Avoid changing the URL between registration and testing. Use a protected, read-only test tool and keep the public discovery tools and the write gate as they are.

| Client | Registration and redirect to verify |
| --- | --- |
| ChatGPT | Check CIMD or the builder's supported registration mode. Use the exact redirect displayed for the private connector. OpenAI documents `https://chatgpt.com/connector/oauth/{callback_id}` for servers without its RFC 9207 issuer-identification support. |
| Claude | Verify automatic registration or use a managed client if needed. Anthropic documents `https://claude.ai/api/mcp/auth_callback` for a manually registered client. |

[OpenAI authentication guide](https://developers.openai.com/apps-sdk/build/auth) · [Anthropic custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)

For each client, record the exact deployed commit and resource URL, discovered issuer and registration mode, the login and consent outcome, PKCE `S256`, and a successful protected read. Confirm its verified subject matches the intended dev dashboard account. Run the missing-token and wrong-audience cases against the same deployed protected handler using a controlled dev harness if the connector cannot send those requests. Record the OAuth refresh outcome, disconnect or grant withdrawal, and the remaining lifetime of any valid access JWT. Keep only redacted evidence and HTTP outcomes. Bearer tokens, refresh tokens, codes, client secrets and raw session IDs stay out of logs and issue comments.

| Live check | ChatGPT | Claude |
| --- | --- | --- |
| Client registration, consent, callback and PKCE | Pending | Pending |
| Authorized read tied to the dev dashboard subject | Pending | Pending |
| Deployed endpoint rejects missing and wrong-audience tokens | Pending | Pending |
| Refresh and disconnect or revocation behavior | Pending | Pending |

This spike requires no database migration or deployment configuration. Reverting it removes the test, its dev dependency, and these documentation changes. [Issue #30](https://github.com/MohamedXIV/slopboy/issues/30) tracks the full private-draft flow after OAuth acceptance and write integration.
