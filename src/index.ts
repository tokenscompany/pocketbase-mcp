import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { registerTools } from "./mcp-server.ts";
import { createPBClient } from "./pb-client.ts";
import { validatePBUrl } from "./validate-url.ts";
import { checkRateLimit } from "./rate-limit.ts";

const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY_SIZE = 1_048_576; // 1 MB
const GIT_SHA = process.env.GIT_SHA || "dev";

const COMMON_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Accept, X-PB-URL, X-PB-Token",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "X-Build-Commit": GIT_SHA,
};

function withHeaders(response: Response): Response {
  for (const [key, value] of Object.entries(COMMON_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

function jsonResponse(body: unknown, status: number): Response {
  return withHeaders(Response.json(body, { status }));
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // --- CORS preflight ---
    if (req.method === "OPTIONS" && url.pathname === "/mcp") {
      return withHeaders(new Response(null, { status: 204 }));
    }

    if (url.pathname === "/health") {
      return jsonResponse({ status: "ok", version: "1.0.0", commit: GIT_SHA }, 200);
    }

    if (url.pathname === "/mcp") {
      // --- Rate limiting ---
      const ip = server.requestIP(req)?.address ?? "unknown";
      if (!checkRateLimit(ip)) {
        return jsonResponse(
          {
            jsonrpc: "2.0",
            error: { code: -32000, message: "Rate limit exceeded. Try again later." },
            id: null,
          },
          429,
        );
      }

      // Only POST carries MCP messages in stateless mode
      if (req.method !== "POST") {
        return jsonResponse(
          {
            jsonrpc: "2.0",
            error: { code: -32000, message: "Method not allowed. Use POST." },
            id: null,
          },
          405,
        );
      }

      // --- Body size limit ---
      const contentLength = req.headers.get("content-length");
      if (contentLength && Number(contentLength) > MAX_BODY_SIZE) {
        return jsonResponse(
          {
            jsonrpc: "2.0",
            error: { code: -32000, message: "Request body too large. Max 1MB." },
            id: null,
          },
          413,
        );
      }

      const pbUrl = req.headers.get("x-pb-url");
      const pbToken = req.headers.get("x-pb-token");

      if (!pbUrl || !pbToken) {
        return jsonResponse(
          {
            jsonrpc: "2.0",
            error: {
              code: -32001,
              message:
                "Missing X-PB-URL and/or X-PB-Token headers. Both are required.",
            },
            id: null,
          },
          401,
        );
      }

      // --- SSRF protection ---
      try {
        await validatePBUrl(pbUrl);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Invalid PB URL";
        return jsonResponse(
          {
            jsonrpc: "2.0",
            error: { code: -32001, message },
            id: null,
          },
          403,
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

        const response = await transport.handleRequest(req);
        return withHeaders(response);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Internal error";
        return jsonResponse(
          {
            jsonrpc: "2.0",
            error: { code: -32603, message },
            id: null,
          },
          500,
        );
      }
    }

    return jsonResponse({ error: "Not found" }, 404);
  },
});

console.log(`PocketBase MCP server running on http://localhost:${PORT}`);
console.log(`  POST /mcp   — MCP endpoint`);
console.log(`  GET  /health — Health check`);
