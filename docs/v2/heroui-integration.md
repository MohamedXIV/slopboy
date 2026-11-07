# HeroUI v3 UI foundation — editor integration

HeroUI **v3**, not the incompatible HeroUI v2. React 19 and Tailwind CSS v4 are already present. Official development skill copied unchanged from `heroui-inc/heroui` branch `v3` into `.agents/skills/heroui-react` (Codex/Antigravity) and `.claude/skills/heroui-react` (Claude Code).

Project-scoped stdio MCP config is registered for Codex (`.codex/config.toml`), Claude Code (`.mcp.json`), and VS Code (`.vscode/mcp.json`). These files require a compatible editor, npm/network access, and a **local agent restart** to start the `@heroui/react-mcp` process. The ChatGPT cloud session cannot restart or verify a user's local editor; do not assert `MCP Connected` from config files alone.

**Dev environment blocker (2026-11-07):** `curl -I https://heroui.com/install` failed with DNS resolution; `corepack pnpm --version` failed to resolve registry.npmjs.org. Official skill files were retrieved from the public GitHub source via the connected GitHub integration instead of executing unknown remote shell scripts.

Official references:
- https://heroui.com/docs/react/getting-started/quick-start
- https://heroui.com/docs/react/getting-started/mcp-server
- https://heroui.com/docs/react/getting-started/agent-skills

For actual web UI dependency installation: `pnpm --filter @slopboy/web add @heroui/react@3 @heroui/styles@3`, then import `@heroui/styles` after `tailwindcss` in `apps/web/app/globals.css`. Do not mark components HeroUI-backed until dependency installation and lockfile/CI are verified.
