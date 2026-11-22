export function GET(): Response {
  const text = `# Slopboy — games for imaginary handhelds

> A fantasy-device game platform. Public game-authoring documentation is available without an authenticated MCP connection.

## AI game creation
- /ai — human-friendly idea-to-prompt page; Genre is optional.
- /ai/game-guide/v1.md — versioned AI game guide (Markdown).
- /ai/game-guide/v1.json — machine-readable hardware and engine statuses.

## Boundaries
- The first candidate engine adapter is experimental; documentation does not imply upload, safe preview, sharing or publication.
- Source-only drafts require real account authorization; untrusted source is not executed upon upload.
- Legacy Creator Kit is a separate local-only format and not the V2 framework manifest.
`;
  return new Response(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
