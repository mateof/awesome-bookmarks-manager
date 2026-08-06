# @awesome-bookmarks/mcp

Model Context Protocol server for [AwesomeBookmarks](../../README.md). Lets an
AI assistant add, search and manage bookmarks in a self-hosted instance over
its public `/api/v1` API.

## Quick start

```bash
pnpm install
pnpm --filter @awesome-bookmarks/mcp build

AWESOMEBOOKMARKS_URL=http://192.168.0.22:7055 \
AWESOMEBOOKMARKS_TOKEN=your-token \
node apps/mcp/dist/index.js
```

Create the token in the web app under **Settings → API**.

Full setup (Claude Desktop config, tool list, troubleshooting) lives in
[`doc/mcp.md`](../../doc/mcp.md).
