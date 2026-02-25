import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { registerTools } from "./mcp-server.ts";
import { createPBClient, createPBClientWithCredentials } from "./pb-client.ts";
import { validatePBUrl } from "./validate-url.ts";
import { checkRateLimit } from "./rate-limit.ts";

const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY_SIZE = 1_048_576; // 1 MB
const GIT_SHA = process.env.GIT_SHA || "dev";

const INSTALL_PROMPT = `Install the PocketBase MCP server. The MCP endpoint is https://pocketbase.tokenscompany.co/mcp and the transport type is http (NOT sse). It requires X-PB-URL set to my PocketBase instance URL and either X-PB-Email + X-PB-Password (superuser credentials) or X-PB-Token (superuser auth token). Add it to my project MCP config with type "http". Then fetch https://raw.githubusercontent.com/tokenscompany/pocketbase-mcp/main/SKILL.md and save it to my project's agent instructions so you always know how to use the PocketBase tools.`;

const HOME_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>pocketbase-mcp</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,system-ui,sans-serif;background:#09090b;color:#fafafa;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem 1.5rem;-webkit-font-smoothing:antialiased}
main{max-width:460px;width:100%;display:flex;flex-direction:column;align-items:stretch}
h1{font-size:.8125rem;font-weight:500;color:#52525b;text-transform:uppercase;text-align:center}
.hero{font-size:2rem;font-weight:600;color:#fafafa;margin:.75rem 0 .5rem;text-align:center;line-height:1.2;text-wrap:balance}
.desc{color:#71717a;font-size:.9375rem;text-align:center;margin-bottom:2rem;line-height:1.6;text-wrap:pretty}
.prompt{background:#18181b;border:1px solid #27272a;border-radius:12px;padding:1.25rem;margin-bottom:.75rem;font-size:.9375rem;line-height:1.7;color:#71717a;cursor:pointer;overflow-wrap:break-word;word-break:break-word;-webkit-user-select:all;user-select:all;text-wrap:pretty}
.prompt:hover{border-color:#3f3f46}
.cta{display:flex;align-items:center;justify-content:center;gap:.5rem;padding:.75rem;background:#fafafa;border:none;border-radius:10px;color:#09090b;font-size:.9375rem;font-weight:600;font-family:inherit;cursor:pointer}
.cta:hover{background:#e4e4e7}
.cta svg{width:16px;height:16px;flex-shrink:0}
.cta.copied{background:#22c55e;color:#fff}
.footer{display:flex;gap:1.5rem;justify-content:center;margin-top:1.5rem}
.footer a{color:#3f3f46;text-decoration:none;font-size:.8125rem}
.footer a:hover{color:#71717a}
</style>
</head>
<body>
<main>
<h1>pocketbase-mcp</h1>
<p class="hero">Connect PocketBase<br>to any AI agent</p>
<p class="desc">Copy the install prompt, paste it into your AI agent, and you're ready to go.</p>
<div class="prompt" onclick="cp()">${INSTALL_PROMPT}</div>
<button class="cta" onclick="cp()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Copy install prompt</span></button>
<div class="footer">
<a href="https://github.com/tokenscompany/pocketbase-mcp" target="_blank">GitHub</a>
<a href="/health">Health</a>
</div>
</main>
<script>
const P='${INSTALL_PROMPT.replace(/'/g, "\\'")}';
function cp(){
const b=document.querySelector('.cta');
navigator.clipboard.writeText(P).then(()=>{
b.classList.add('copied');
b.querySelector('span').textContent='Copied!';
setTimeout(()=>{b.classList.remove('copied');b.querySelector('span').textContent='Copy install prompt'},2000);
});
}
</script>
</body>
</html>`;

const COMMON_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Accept, X-PB-URL, X-PB-Token, X-PB-Email, X-PB-Password",
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

    if (url.pathname === "/" && req.method === "GET") {
      return withHeaders(new Response(HOME_HTML, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }));
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

console.log(`PocketBase MCP server running on http://localhost:${PORT}`);
console.log(`  POST /mcp   — MCP endpoint`);
console.log(`  GET  /health — Health check`);
