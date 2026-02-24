Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>`
- Bun automatically loads .env, so don't use dotenv.

## Project

Remote MCP server connecting MCP clients to any PocketBase instance. Stateless streamable HTTP — no sessions.

## Architecture

Three files:

- `src/index.ts` — Bun.serve() HTTP server with two routes: `POST /mcp` and `GET /health`
- `src/mcp-server.ts` — `registerTools()` factory that registers 19 tools + 1 resource on an McpServer instance
- `src/pb-client.ts` — PocketBase client factory

Each request creates a fresh MCP server + transport (stateless). PB credentials come from `X-PB-URL` and `X-PB-Token` headers.

## Conventions

- MCP SDK v1: imports from `@modelcontextprotocol/sdk/server/mcp.js` and `@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js`
- Tool registration: `server.tool(name, description, zodSchema, handler)`
- Tool handlers use `call()` helper that wraps async fn in try/catch and returns MCP content format
- `enableJsonResponse: true` + `sessionIdGenerator: undefined` for stateless JSON mode
- Tests: `bun test` with `bun:test`, integration tests against the running server
