import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { registerTools } from "./mcp-server.ts";
import { createPBClient } from "./pb-client.ts";

const PORT = Number(process.env.PORT) || 3000;

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    if (url.pathname === "/mcp") {
      // Only POST carries MCP messages in stateless mode
      if (req.method !== "POST") {
        return Response.json(
          {
            jsonrpc: "2.0",
            error: { code: -32000, message: "Method not allowed. Use POST." },
            id: null,
          },
          { status: 405 },
        );
      }

      const pbUrl = req.headers.get("x-pb-url");
      const pbToken = req.headers.get("x-pb-token");

      if (!pbUrl || !pbToken) {
        return Response.json(
          {
            jsonrpc: "2.0",
            error: {
              code: -32001,
              message:
                "Missing X-PB-URL and/or X-PB-Token headers. Both are required.",
            },
            id: null,
          },
          { status: 401 },
        );
      }

      try {
        const pb = createPBClient(pbUrl, pbToken);
        const mcp = new McpServer({
          name: "pocketbase-mcp",
          version: "1.0.0",
        });
        registerTools(mcp, pb);

        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        await mcp.connect(transport);

        return transport.handleRequest(req);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Internal error";
        return Response.json(
          {
            jsonrpc: "2.0",
            error: { code: -32603, message },
            id: null,
          },
          { status: 500 },
        );
      }
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
});

console.log(`PocketBase MCP server running on http://localhost:${PORT}`);
console.log(`  POST /mcp   — MCP endpoint`);
console.log(`  GET  /health — Health check`);
