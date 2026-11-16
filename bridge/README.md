# gerrit-lens-bridge

Local bridge between Claude Code / Codex and the **Gerrit Lens** Chrome extension.

- To your AI tool it is an MCP server (stdio) with `add_review_notes`, `list_review_notes`, `remove_review_notes`.
- To the extension it is an HTTP server on `127.0.0.1:7357`. It answers only loopback hosts, and only `chrome-extension://` origins when an Origin is sent.

Notes are stored in `~/.gerrit-lens/notes/<change>.json`. Nothing leaves your machine.

## Setup

```bash
# Claude Code
claude mcp add --scope user gerrit-lens -- npx -y gerrit-lens-bridge
# Codex
codex mcp add gerrit-lens -- npx -y gerrit-lens-bridge
```

Then click "Allow connection" in the Gerrit Lens popup. Ask your AI tool to review a Gerrit change link and the notes appear next to the diff lines.

`npx -y gerrit-lens-bridge --http` runs only the HTTP side, for when no AI session is open.

Environment: `GERRIT_LENS_PORT` (default 7357), `GERRIT_LENS_DIR` (default `~/.gerrit-lens/notes`).

## License

MIT
