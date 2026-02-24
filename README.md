# pocketbase-mcp

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/tokenscompany/pocketbase-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/tokenscompany/pocketbase-mcp/actions/workflows/ci.yml)
[![Docker](https://github.com/tokenscompany/pocketbase-mcp/actions/workflows/docker.yml/badge.svg)](https://github.com/tokenscompany/pocketbase-mcp/actions/workflows/docker.yml)

Remote MCP server that connects any MCP client to a PocketBase instance over stateless HTTP.

## Quick start

Use the hosted instance at `https://pocketbase.tokenscompany.co/mcp` or [self-host your own](#self-hosting).

### Install with AI agent

Copy and paste this prompt into your AI agent (Claude Code, Cursor, Windsurf, etc.):

```
Install the PocketBase MCP server. The MCP endpoint is https://pocketbase.tokenscompany.co/mcp. It requires X-PB-URL set to my PocketBase instance URL and either X-PB-Email + X-PB-Password (superuser credentials) or X-PB-Token (superuser auth token). Add it to my project MCP config. Then fetch https://raw.githubusercontent.com/tokenscompany/pocketbase-mcp/main/SKILL.md and save it to my project's agent instructions so you always know how to use the PocketBase tools.
```

<details>
<summary>Claude Code</summary>

```bash
claude mcp add --transport http pocketbase https://pocketbase.tokenscompany.co/mcp \
  --header "X-PB-URL: https://your-pocketbase.example.com" \
  --header "X-PB-Email: admin@example.com" \
  --header "X-PB-Password: your-password"
```

Or add to `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "pocketbase": {
      "type": "http",
      "url": "https://pocketbase.tokenscompany.co/mcp",
      "headers": {
        "X-PB-URL": "https://your-pocketbase.example.com",
        "X-PB-Email": "admin@example.com",
        "X-PB-Password": "your-password"
      }
    }
  }
}
```

</details>

<details>
<summary>Cursor</summary>

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "pocketbase": {
      "url": "https://pocketbase.tokenscompany.co/mcp",
      "headers": {
        "X-PB-URL": "https://your-pocketbase.example.com",
        "X-PB-Email": "admin@example.com",
        "X-PB-Password": "your-password"
      }
    }
  }
}
```

</details>

<details>
<summary>OpenCode</summary>

Add to `opencode.json` in your project root:

```json
{
  "mcp": {
    "pocketbase": {
      "type": "remote",
      "url": "https://pocketbase.tokenscompany.co/mcp",
      "headers": {
        "X-PB-URL": "https://your-pocketbase.example.com",
        "X-PB-Email": "admin@example.com",
        "X-PB-Password": "your-password"
      },
      "enabled": true
    }
  }
}
```

</details>

## Self-hosting

### Bun

```bash
bun install
bun run src/index.ts
```

The server listens on `PORT` (default `3000`).

### Docker (GHCR)

```bash
docker pull ghcr.io/tokenscompany/pocketbase-mcp:latest
docker run -p 3000:3000 ghcr.io/tokenscompany/pocketbase-mcp:latest
```

Or build locally:

```bash
docker build -t pocketbase-mcp .
docker run -p 3000:3000 pocketbase-mcp
```

### Verifying the image

Every image published to GHCR includes SLSA provenance attestation. You can verify that an image was built from this repository:

```bash
gh attestation verify oci://ghcr.io/tokenscompany/pocketbase-mcp:latest \
  --owner tokenscompany
```

## Authentication

Every request to `POST /mcp` must include `X-PB-URL` and one of two auth methods:

### Option 1: Email + Password (recommended)

| Header | Description |
|---|---|
| `X-PB-URL` | Base URL of your PocketBase instance |
| `X-PB-Email` | Superuser email |
| `X-PB-Password` | Superuser password |

The server authenticates against PocketBase on each request. No manual token management needed.

### Option 2: Token

| Header | Description |
|---|---|
| `X-PB-URL` | Base URL of your PocketBase instance |
| `X-PB-Token` | Superuser auth token |

To get a token manually:

```bash
curl -X POST https://your-pb.example.com/api/admins/auth-with-password \
  -H 'Content-Type: application/json' \
  -d '{"identity":"admin@example.com","password":"your-password"}'
```

The `token` field in the response is your `X-PB-Token`. If both token and email+password are provided, the token takes priority.

## Tools

| Tool | Description |
|---|---|
| `pb_health` | PocketBase health check |
| `pb_list_collections` | List all collections with full field schemas |
| `pb_get_collection_schema` | Get a single collection's full schema |
| `pb_create_collection` | Create a new collection |
| `pb_update_collection` | Update a collection's schema or rules |
| `pb_delete_collection` | Delete a collection |
| `pb_import_collections` | Bulk import/overwrite collection schemas |
| `pb_list_records` | List/search records in a collection |
| `pb_get_record` | Get a single record by ID |
| `pb_create_record` | Create a new record |
| `pb_update_record` | Update an existing record |
| `pb_delete_record` | Delete a record by ID |
| `pb_list_backups` | List available backups |
| `pb_create_backup` | Create a new backup |
| `pb_delete_backup` | Delete a backup by key |
| `pb_get_file_url` | Get download URL for a file field |
| `pb_get_settings` | Get app settings |
| `pb_update_settings` | Update app settings |
| `pb_list_logs` | Query request logs |

## Resources

| Resource | URI | Description |
|---|---|---|
| `schema` | `pocketbase://schema` | All collection schemas as JSON |

## Security & Privacy

This server is **fully stateless** — it does not store, log, or retain any of your data:

- **No database, no disk writes** — each request creates a fresh MCP server and transport in memory, processes it, and  discards everything. Nothing is written to disk.
- **No credential storage** — your `X-PB-URL`, `X-PB-Token`, `X-PB-Email`, and `X-PB-Password` headers are used for the duration of the request and never persisted, cached, or logged.
- **No telemetry or analytics** — the server collects zero usage data. No third-party services are contacted.
- **No sessions** — there are no cookies, no session IDs, and no server-side state between requests.
- **Open source** — the entire codebase is MIT-licensed. Every Docker image includes [SLSA provenance attestation](#verifying-the-image), so you can verify it was built directly from this repository with no modifications.
- **Self-host it yourself** — for maximum control, run your own instance. The server is a single container with no external dependencies beyond your PocketBase instance.

### Hardening

When hosting a public instance, the server includes several additional measures:

- **SSRF protection** — `X-PB-URL` is validated: only `http`/`https` schemes are allowed, and hostnames that resolve to private/reserved IP ranges (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`, `fc00::/7`, `fe80::/10`) are rejected.
- **Rate limiting** — in-memory token-bucket per IP. Configurable via environment variables:

  | Variable | Default | Description |
  |---|---|---|
  | `RATE_LIMIT_RPM` | `60` | Requests per minute per IP |
  | `RATE_LIMIT_BURST` | `10` | Max burst size |

- **CORS** — `Access-Control-Allow-Origin: *` with preflight support on `/mcp`.
- **Body size limit** — requests larger than 1 MB are rejected with `413`.

## Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/mcp` | MCP endpoint (stateless, JSON responses) |
| `GET` | `/health` | Health check |

## License

[MIT](LICENSE)
