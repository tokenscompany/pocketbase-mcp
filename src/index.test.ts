import { test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
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
  const { createPBClient, createPBClientWithCredentials } = await import("./pb-client.ts");
  const { validatePBUrl } = await import("./validate-url.ts");
  const { checkRateLimit } = await import("./rate-limit.ts");

  const MAX_BODY_SIZE = 1_048_576;

  const COMMON_HEADERS: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "Content-Type, Accept, X-PB-URL, X-PB-Token, X-PB-Email, X-PB-Password",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "X-Build-Commit": process.env.GIT_SHA || "dev",
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

  server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);

      if (req.method === "OPTIONS" && url.pathname === "/mcp") {
        return withHeaders(new Response(null, { status: 204 }));
      }

      if (url.pathname === "/health") {
        return jsonResponse({ status: "ok", version: "1.0.0", commit: process.env.GIT_SHA || "dev" }, 200);
      }

      if (url.pathname === "/mcp") {
        const ip = server.requestIP(req)?.address ?? "unknown";
        if (!checkRateLimit(ip)) {
          return jsonResponse(
            {
              jsonrpc: "2.0",
              error: {
                code: -32000,
                message: "Rate limit exceeded. Try again later.",
              },
              id: null,
            },
            429,
          );
        }

        if (req.method !== "POST") {
          return jsonResponse(
            {
              jsonrpc: "2.0",
              error: {
                code: -32000,
                message: "Method not allowed. Use POST.",
              },
              id: null,
            },
            405,
          );
        }

        const contentLength = req.headers.get("content-length");
        if (contentLength && Number(contentLength) > MAX_BODY_SIZE) {
          return jsonResponse(
            {
              jsonrpc: "2.0",
              error: {
                code: -32000,
                message: "Request body too large. Max 1MB.",
              },
              id: null,
            },
            413,
          );
        }

        const pbUrl = req.headers.get("x-pb-url");
        const pbToken = req.headers.get("x-pb-token");
        const pbEmail = req.headers.get("x-pb-email");
        const pbPassword = req.headers.get("x-pb-password");

        if (!pbUrl || (!pbToken && (!pbEmail || !pbPassword))) {
          return jsonResponse(
            {
              jsonrpc: "2.0",
              error: {
                code: -32001,
                message:
                  "Missing auth headers. Provide X-PB-URL with either X-PB-Token or X-PB-Email + X-PB-Password.",
              },
              id: null,
            },
            401,
          );
        }

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
          const pb = pbToken
            ? createPBClient(pbUrl, pbToken)
            : await createPBClientWithCredentials(pbUrl, pbEmail!, pbPassword!);
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

  baseUrl = `http://localhost:${server.port}`;
});

afterAll(() => {
  server?.stop(true);
});

beforeEach(async () => {
  const { resetRateLimits } = await import("./rate-limit.ts");
  resetRateLimits();
});

const AUTH_HEADERS = {
  "X-PB-URL": "http://example.com:8090",
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

test("GET /health returns 200 with status, version, and commit", async () => {
  const res = await fetch(`${baseUrl}/health`);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("ok");
  expect(body.version).toBe("1.0.0");
  expect(body.commit).toBe("dev");
  expect(res.headers.get("x-build-commit")).toBe("dev");
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
  expect(body.error.message).toContain("X-PB-Email");
});

test("POST /mcp with only email (no password) returns 401", async () => {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PB-URL": "http://example.com:8090",
      "X-PB-Email": "admin@example.com",
    },
    body: JSON.stringify(mcpRequest("initialize", 1)),
  });
  expect(res.status).toBe(401);
});

test("POST /mcp with only password (no email) returns 401", async () => {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PB-URL": "http://example.com:8090",
      "X-PB-Password": "testpassword",
    },
    body: JSON.stringify(mcpRequest("initialize", 1)),
  });
  expect(res.status).toBe(401);
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

// ─── SSRF protection ───

test("SSRF: X-PB-URL with http://127.0.0.1 returns 403", async () => {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      ...AUTH_HEADERS,
      "X-PB-URL": "http://127.0.0.1:8090",
    },
    body: JSON.stringify(mcpRequest("initialize", 1)),
  });
  expect(res.status).toBe(403);
});

test("SSRF: X-PB-URL with http://169.254.169.254 returns 403", async () => {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      ...AUTH_HEADERS,
      "X-PB-URL": "http://169.254.169.254",
    },
    body: JSON.stringify(mcpRequest("initialize", 1)),
  });
  expect(res.status).toBe(403);
});

test("SSRF: X-PB-URL with ftp://example.com returns 403", async () => {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      ...AUTH_HEADERS,
      "X-PB-URL": "ftp://example.com",
    },
    body: JSON.stringify(mcpRequest("initialize", 1)),
  });
  expect(res.status).toBe(403);
});

test("SSRF: X-PB-URL with http://10.0.0.1 returns 403", async () => {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      ...AUTH_HEADERS,
      "X-PB-URL": "http://10.0.0.1:8090",
    },
    body: JSON.stringify(mcpRequest("initialize", 1)),
  });
  expect(res.status).toBe(403);
});

test("SSRF: X-PB-URL with http://192.168.1.1 returns 403", async () => {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      ...AUTH_HEADERS,
      "X-PB-URL": "http://192.168.1.1:8090",
    },
    body: JSON.stringify(mcpRequest("initialize", 1)),
  });
  expect(res.status).toBe(403);
});

// ─── Rate limiting ───

test("Rate limit: returns 429 after burst exceeded", async () => {
  const { resetRateLimits } = await import("./rate-limit.ts");
  resetRateLimits();

  // Default burst is 10, send 11 requests
  const results: number[] = [];
  for (let i = 0; i < 12; i++) {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mcpRequest("initialize", 1)),
    });
    results.push(res.status);
    // consume body to free resources
    await res.text();
  }
  expect(results).toContain(429);
});

// ─── CORS ───

test("OPTIONS /mcp returns 204 with CORS headers", async () => {
  const res = await fetch(`${baseUrl}/mcp`, { method: "OPTIONS" });
  expect(res.status).toBe(204);
  expect(res.headers.get("access-control-allow-origin")).toBe("*");
  expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  expect(res.headers.get("access-control-allow-headers")).toContain(
    "X-PB-URL",
  );
});

test("Responses include CORS headers", async () => {
  const res = await fetch(`${baseUrl}/health`);
  expect(res.headers.get("access-control-allow-origin")).toBe("*");
});

// ─── Body size limit ───

test("Oversized POST returns 413", async () => {
  const largeBody = "x".repeat(2_000_000);
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      ...AUTH_HEADERS,
      "Content-Length": String(largeBody.length),
    },
    body: largeBody,
  });
  expect(res.status).toBe(413);
});
