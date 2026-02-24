import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type PocketBase from "pocketbase";
import { z } from "zod";

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function err(error: unknown) {
  let message: string;
  if (error && typeof error === "object" && "response" in error) {
    // PocketBase ClientResponseError — include response data for field-level details
    const pbErr = error as { status: number; message: string; response: unknown };
    message = JSON.stringify(
      { message: pbErr.message, status: pbErr.status, data: pbErr.response },
      null,
      2,
    );
  } else if (error instanceof Error) {
    message = error.message;
  } else {
    message = JSON.stringify(error);
  }
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

async function call<T>(fn: () => Promise<T>): Promise<ReturnType<typeof ok>> {
  try {
    const result = await fn();
    return ok(JSON.stringify(result, null, 2));
  } catch (e) {
    return err(e);
  }
}

export function registerTools(server: McpServer, pb: PocketBase) {
  // ─── Schema & Admin ───

  server.tool("pb_health", "PocketBase health check", {}, async () => {
    return call(() => pb.health.check());
  });

  server.tool(
    "pb_list_collections",
    "List all collections with full field schemas",
    {},
    async () => {
      return call(() => pb.collections.getFullList());
    },
  );

  server.tool(
    "pb_get_collection_schema",
    "Get a single collection's full schema (fields, rules, indexes)",
    { collection: z.string().describe("Collection name or ID") },
    async ({ collection }) => {
      return call(() => pb.collections.getOne(collection));
    },
  );

  server.tool(
    "pb_create_collection",
    "Create a new collection",
    {
      name: z.string().describe("Collection name"),
      type: z
        .enum(["base", "auth", "view"])
        .default("base")
        .describe("Collection type"),
      fields: z
        .array(z.record(z.string(), z.any()))
        .describe("Array of field definitions"),
    },
    async ({ name, type, fields }) => {
      return call(() =>
        pb.collections.create({ name, type, fields }),
      );
    },
  );

  server.tool(
    "pb_update_collection",
    "Update a collection's schema or rules",
    {
      collection: z.string().describe("Collection name or ID"),
      updates: z
        .record(z.string(), z.any())
        .describe("Fields to update (name, fields, rules, etc.)"),
    },
    async ({ collection, updates }) => {
      return call(() => pb.collections.update(collection, updates));
    },
  );

  server.tool(
    "pb_delete_collection",
    "Delete a collection",
    { collection: z.string().describe("Collection name or ID") },
    async ({ collection }) => {
      return call(() => pb.collections.delete(collection));
    },
  );

  server.tool(
    "pb_import_collections",
    "Bulk import/overwrite collection schemas (for migrations)",
    {
      collections: z
        .array(z.record(z.string(), z.any()))
        .describe("Array of collection definitions to import"),
      deleteMissing: z
        .boolean()
        .default(false)
        .describe("Delete collections not present in the import"),
    },
    async ({ collections, deleteMissing }) => {
      return call(() => pb.collections.import(collections, deleteMissing));
    },
  );

  // ─── Records (Generic CRUD) ───

  server.tool(
    "pb_list_records",
    "List/search records in a collection",
    {
      collection: z.string().describe("Collection name or ID"),
      filter: z.string().optional().describe("PocketBase filter expression"),
      sort: z.string().optional().describe("Sort expression (e.g. '-created')"),
      page: z.number().optional().default(1).describe("Page number"),
      perPage: z.number().optional().default(30).describe("Items per page"),
      expand: z.string().optional().describe("Relations to expand"),
      fields: z.string().optional().describe("Comma-separated fields to return"),
    },
    async ({ collection, filter, sort, page, perPage, expand, fields }) => {
      return call(() =>
        pb.collection(collection).getList(page, perPage, {
          filter,
          sort,
          expand,
          fields,
        }),
      );
    },
  );

  server.tool(
    "pb_get_record",
    "Get a single record by ID",
    {
      collection: z.string().describe("Collection name or ID"),
      id: z.string().describe("Record ID"),
      expand: z.string().optional().describe("Relations to expand"),
      fields: z.string().optional().describe("Comma-separated fields to return"),
    },
    async ({ collection, id, expand, fields }) => {
      return call(() =>
        pb.collection(collection).getOne(id, { expand, fields }),
      );
    },
  );

  server.tool(
    "pb_create_record",
    "Create a new record in a collection",
    {
      collection: z.string().describe("Collection name or ID"),
      data: z
        .record(z.string(), z.any())
        .describe("Record data as key-value pairs"),
    },
    async ({ collection, data }) => {
      return call(() => pb.collection(collection).create(data));
    },
  );

  server.tool(
    "pb_update_record",
    "Update an existing record",
    {
      collection: z.string().describe("Collection name or ID"),
      id: z.string().describe("Record ID"),
      data: z
        .record(z.string(), z.any())
        .describe("Fields to update as key-value pairs"),
    },
    async ({ collection, id, data }) => {
      return call(() => pb.collection(collection).update(id, data));
    },
  );

  server.tool(
    "pb_delete_record",
    "Delete a record by ID",
    {
      collection: z.string().describe("Collection name or ID"),
      id: z.string().describe("Record ID"),
    },
    async ({ collection, id }) => {
      return call(() => pb.collection(collection).delete(id));
    },
  );

  // ─── Backups ───

  server.tool("pb_list_backups", "List available backups", {}, async () => {
    return call(() => pb.backups.getFullList());
  });

  server.tool(
    "pb_create_backup",
    "Create a new backup",
    {
      name: z
        .string()
        .optional()
        .describe("Optional backup name (auto-generated if omitted)"),
    },
    async ({ name }) => {
      return call(() => pb.backups.create(name || ""));
    },
  );

  server.tool(
    "pb_delete_backup",
    "Delete a backup by key",
    { key: z.string().describe("Backup file key/name") },
    async ({ key }) => {
      return call(() => pb.backups.delete(key));
    },
  );

  // ─── Files ───

  server.tool(
    "pb_get_file_url",
    "Get download URL for a file field",
    {
      collection: z.string().describe("Collection name or ID"),
      recordId: z.string().describe("Record ID"),
      filename: z.string().describe("Filename from the record's file field"),
      thumb: z
        .string()
        .optional()
        .describe("Thumbnail size (e.g. '100x100')"),
    },
    async ({ collection, recordId, filename, thumb }) => {
      try {
        const record = await pb
          .collection(collection)
          .getOne(recordId);
        const url = pb.files.getURL(record, filename, { thumb });
        return ok(url);
      } catch (e) {
        return err(e);
      }
    },
  );

  // ─── Settings & Ops ───

  server.tool("pb_get_settings", "Get app settings", {}, async () => {
    return call(() => pb.settings.getAll());
  });

  server.tool(
    "pb_update_settings",
    "Update app settings",
    {
      settings: z
        .record(z.string(), z.any())
        .describe("Settings key-value pairs to update"),
    },
    async ({ settings }) => {
      return call(() => pb.settings.update(settings));
    },
  );

  server.tool(
    "pb_list_logs",
    "Query request logs",
    {
      filter: z.string().optional().describe("PocketBase filter expression"),
      sort: z.string().optional().describe("Sort expression"),
      page: z.number().optional().default(1).describe("Page number"),
      perPage: z.number().optional().default(30).describe("Items per page"),
    },
    async ({ filter, sort, page, perPage }) => {
      return call(() => pb.logs.getList(page, perPage, { filter, sort }));
    },
  );

  // ─── Resource: pocketbase://schema ───

  server.resource(
    "schema",
    "pocketbase://schema",
    {
      description:
        "All PocketBase collection schemas. Provides full field definitions, rules, and indexes.",
      mimeType: "application/json",
    },
    async (uri) => {
      try {
        const collections = await pb.collections.getFullList();
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(collections, null, 2),
            },
          ],
        };
      } catch (e) {
        const message =
          e instanceof Error ? e.message : JSON.stringify(e);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({ error: message }),
            },
          ],
        };
      }
    },
  );
}
