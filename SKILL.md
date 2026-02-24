# PocketBase MCP — AI Agent Skill

You have access to a PocketBase instance through MCP tools. This guide tells you how to use them.

Authentication is handled via headers: either `X-PB-Email` + `X-PB-Password` (superuser credentials) or `X-PB-Token` (pre-existing superuser token), alongside `X-PB-URL`.

## First step: read the schema

Before making any tool calls, read the `pocketbase://schema` resource. This returns all collections with their fields, types, and rules. Use it to understand the database structure.

## Available tools

**Schema:** `pb_list_collections`, `pb_get_collection_schema`, `pb_create_collection`, `pb_update_collection`, `pb_delete_collection`, `pb_import_collections`

**Records:** `pb_list_records`, `pb_get_record`, `pb_create_record`, `pb_update_record`, `pb_delete_record`

**Backups:** `pb_list_backups`, `pb_create_backup`, `pb_delete_backup`

**Files:** `pb_get_file_url`

**Settings:** `pb_get_settings`, `pb_update_settings`

**Logs:** `pb_list_logs`

**Health:** `pb_health`

## Filter syntax

Used in `pb_list_records` and `pb_list_logs`. Pattern: `FIELD OPERATOR VALUE`.

| Operator | Meaning | Example |
|---|---|---|
| `=` | Equal | `status = "active"` |
| `!=` | Not equal | `status != "draft"` |
| `>` | Greater than | `views > 100` |
| `>=` | Greater or equal | `rating >= 4.5` |
| `<` | Less than | `price < 50` |
| `<=` | Less or equal | `stock <= 0` |
| `~` | Like/contains | `name ~ "john"` |
| `!~` | Not like/contains | `email !~ "spam"` |
| `?=` | Any array element equals | `tags ?= "urgent"` |
| `?!=` | No array element equals | `tags ?!= "archived"` |

Combine with `&&` (AND) and `||` (OR). Group with parentheses:

```
status = "active" && (priority = "high" || priority = "critical")
```

Dates use `YYYY-MM-DD HH:MM:SS` format:

```
created >= "2025-01-01 00:00:00"
```

## Sort syntax

Prefix with `-` for descending. Comma-separate for multi-field:

```
-created           → newest first
name,-created      → alphabetical, then newest
```

## Expand & fields

**`expand`** — resolve relation fields into full records instead of just IDs:

```
expand: "author"
expand: "author,category"
expand: "author.company"       ← nested relation
```

**`fields`** — return only specific fields (reduces response size):

```
fields: "id,title,author"
```

Both are available on `pb_list_records` and `pb_get_record`.

## Pagination

`pb_list_records` and `pb_list_logs` return paginated results. Defaults: `page: 1`, `perPage: 30`.

The response includes `page`, `perPage`, `totalPages`, and `totalItems`. Increment `page` to fetch more.

## Recipes

**Find records created today:**
```
pb_list_records collection="posts" filter="created >= \"2025-06-15 00:00:00\"" sort="-created"
```

**Create a collection with fields:**
```
pb_create_collection name="tasks" type="base" fields=[
  { "name": "title", "type": "text", "required": true },
  { "name": "done", "type": "bool" },
  { "name": "assignee", "type": "relation", "options": { "collectionId": "USERS_COLLECTION_ID" } }
]
```

**Get a record with expanded relations:**
```
pb_get_record collection="posts" id="RECORD_ID" expand="author,category" fields="id,title,author,category"
```

**Back up the database:**
```
pb_create_backup
pb_list_backups
```
