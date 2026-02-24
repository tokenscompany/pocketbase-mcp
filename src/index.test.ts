import { test, expect, beforeAll, afterAll } from "bun:test";
import type { Server } from "bun";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const { McpServer } = await import(
    "@modelcontextprotocol/sdk/server/mcp.js"
  );
  const { WebStandardStreamableHTTPServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
  );
  const { registerTools } = await import("./mcp-server.ts");
  const { createPBClient } = await import("./pb-client.ts");

  server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/health") {
        return Response.json({ status: "ok" });
      }

      if (url.pathname === "/mcp") {
        if (req.method !== "POST") {
          return Response.json(
            {
              jsonrpc: "2.0",
              error: {
                code: -32000,
                message: "Method not allowed. Use POST.",
              },
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

  baseUrl = `http://localhost:${server.port}`;
});

afterAll(() => {
  server?.stop(true);
});

const AUTH_HEADERS = {
  "X-PB-URL": "http://localhost:8090",
  "X-PB-Token": "test-token",
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

function mcpRequest(method: string, id: number, params?: unknown) {
  return {
    jsonrpc: "2.0",
    method,
    id,
    ...(params !== undefined ? { params } : {}),
  };
}

// ─── Health ───

test("GET /health returns 200 with status ok", async () => {
  const res = await fetch(`${baseUrl}/health`);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: "ok" });
});

// ─── Auth ───

test("POST /mcp without auth headers returns 401", async () => {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mcpRequest("initialize", 1)),
  });
  expect(res.status).toBe(401);
  const body = await res.json();
  expect(body.error.code).toBe(-32001);
});

// ─── Method not allowed ───

test("GET /mcp returns 405", async () => {
  const res = await fetch(`${baseUrl}/mcp`);
  expect(res.status).toBe(405);
  const body = await res.json();
  expect(body.error.code).toBe(-32000);
});

// ─── MCP initialize ───

test("POST /mcp with initialize returns server info", async () => {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: AUTH_HEADERS,
    body: JSON.stringify(
      mcpRequest("initialize", 1, {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" },
      }),
    ),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.result.serverInfo.name).toBe("pocketbase-mcp");
  expect(body.result.serverInfo.version).toBe("1.0.0");
});

// ─── MCP tools/list ───

test("POST /mcp with tools/list returns 19 tools", async () => {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: AUTH_HEADERS,
    body: JSON.stringify(mcpRequest("tools/list", 1)),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.result.tools).toHaveLength(19);
});

// ─── MCP resources/list ───

test("POST /mcp with resources/list returns 1 resource", async () => {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: AUTH_HEADERS,
    body: JSON.stringify(mcpRequest("resources/list", 1)),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.result.resources).toHaveLength(1);
  expect(body.result.resources[0].uri).toBe("pocketbase://schema");
});

// ─── Invalid JSON ───

test("POST /mcp with invalid JSON returns 400", async () => {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: AUTH_HEADERS,
    body: "not valid json{{{",
  });
  expect(res.status).toBe(400);
});
