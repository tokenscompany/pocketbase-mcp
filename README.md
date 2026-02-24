# pocketbase-mcp

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/kacperhemperek/pocketbase-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/kacperhemperek/pocketbase-mcp/actions/workflows/ci.yml)

Remote MCP server that connects any MCP client to a PocketBase instance over stateless HTTP.

## Quick start

Add to your MCP client config:

```json
{
  "mcpServers": {
    "pocketbase": {
      "type": "streamable-http",
      "url": "https://your-host/mcp",
      "headers": {
        "X-PB-URL": "https://your-pocketbase.example.com",
        "X-PB-Token": "your-superuser-token"
      }
    }
  }
}
```

## Self-hosting

### Bun

```bash
bun install
bun run src/index.ts
```

The server listens on `PORT` (default `3000`).

### Docker

```bash
docker build -t pocketbase-mcp .
docker run -p 3000:3000 pocketbase-mcp
```

## Authentication

Every request to `POST /mcp` must include two headers:

| Header | Description |
|---|---|
| `X-PB-URL` | Base URL of your PocketBase instance |
| `X-PB-Token` | Superuser auth token |

### Getting a superuser token

```bash
curl -X POST https://your-pb.example.com/api/admins/auth-with-password \
  -H 'Content-Type: application/json' \
  -d '{"identity":"admin@example.com","password":"your-password"}'
```

The `token` field in the response is your `X-PB-Token`.

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

## Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/mcp` | MCP endpoint (stateless, JSON responses) |
| `GET` | `/health` | Health check |

## License

[MIT](LICENSE)
