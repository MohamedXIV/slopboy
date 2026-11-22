# MCP tool contract 1.0.0

Both connector clients discover the same tool definitions through
`tools/list` on `/api/mcp`. Each definition advertises version `1.0.0` in
`_meta["slopboy.dev/contractVersion"]`. This version covers tool arguments and
tool-call error codes. It is independent of the MCP protocol version.

| Public tool | Required arguments | Optional arguments |
| --- | --- | --- |
| `list_supported_engines` | None | `deviceProfile` |
| `get_engine_capabilities` | `engineId` | `deviceProfile` |
| `recommend_engine` | `prompt` | None |
| `get_game_template` | `engineId` | `title`, `deviceProfile` |
| `validate_game_source` | `engineId`, `sourceCode` | `manifest` |

Use the engine IDs in the advertised registry enum. A listed candidate can be
inspected independently of its approval for publication. The optional device
profile defaults to `slopboy-1000`. Prompts and titles need a non-whitespace
character and are limited to 4,000 and 80 Unicode code points, respectively.
Source is limited to 64 KiB in UTF-8. The optional manifest must be an object.
Source and manifest validation failures are returned as structured diagnostics
in the existing text content payload. Callers can use those diagnostics to fix
the draft. The endpoint does not evaluate the submitted source.

An omitted arguments object defaults to an empty object. Extra arguments,
invalid types, unknown enum values and over-limit strings are rejected using
the same definitions advertised in discovery.

| HTTP | JSON-RPC code | `error.data.code` |
| --- | --- | --- |
| 200 | `-32602` | `INVALID_TOOL_ARGUMENTS` |
| 200 | `-32601` | `TOOL_NOT_FOUND` |
| 401 | `-32001` | `AUTH_REQUIRED` |
| 403 | `-32003` | `INSUFFICIENT_SCOPE` |
| 503 | `-32003` | `TOOL_UNAVAILABLE` |
| 500 | `-32603` | `INTERNAL_ERROR` |

Invalid-argument errors include `error.data.field` with the schema field to
fix, `name` for a missing tool name, or `arguments` for a malformed object or
extra key. Callers should use the stable data code when two errors share a
numeric code. OAuth errors keep the `WWW-Authenticate` challenge.

The web route does not provide a draft persistence callback, so discovery
omits `create_game_draft` and direct calls cannot save. The package can expose
the tool with both authentication and persistence attached. That contract
requires `engineId`, `title` and `sourceCode`; it accepts an optional
`deviceProfile` and derives ownership from verified identity. A public write
integration still depends on [#28](https://github.com/MohamedXIV/slopboy/issues/28)
and shared ownership-aware, idempotent draft storage. Live connector acceptance
is tracked in [#30](https://github.com/MohamedXIV/slopboy/issues/30).

No data migration or environment variable change is required. Reverting the
contract commit restores the previous discovery and argument behavior.
