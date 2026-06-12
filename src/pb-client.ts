import PocketBase from "pocketbase";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export function createPBClient(url: string, token: string): PocketBase {
  const pb = new PocketBase(url);
  pb.authStore.save(token);
  return pb;
}

export async function createPBClientWithCredentials(
  url: string,
  email: string,
  password: string,
): Promise<PocketBase> {
  const pb = new PocketBase(url);

  // PocketBase v0.23+ uses the _superusers collection endpoint.
  // A 404 means the instance is older — fall back to the legacy admins API.
  try {
    await pb.collection("_superusers").authWithPassword(email, password);
    return pb;
  } catch (err) {
    const pbErr = err as { status?: number; message?: string };

    if (pbErr.status !== 404) {
      const msg = pbErr.message ?? (err instanceof Error ? err.message : String(err));
      console.error(`[pocketbase-mcp] loadAuthToken failure via _superusers (status ${pbErr.status ?? "unknown"}): ${msg}`);
      throw new AuthError(`Authentication failed: ${msg}`);
    }

    console.warn(
      "[pocketbase-mcp] _superusers endpoint returned 404 — this looks like PocketBase < v0.23. " +
      "Retrying with legacy /api/admins/auth-with-password endpoint.",
    );
  }

  // Legacy fallback for PocketBase < v0.23 (SDK 0.26.x removed pb.admins, use fetch directly)
  const baseUrl = url.replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/admins/auth-with-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: email, password }),
    });
  } catch (fetchErr) {
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    console.error(`[pocketbase-mcp] loadAuthToken failure (legacy admins fetch error): ${msg}`);
    throw new AuthError(`Authentication failed: ${msg}`);
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { message?: string };
    const msg = data.message ?? `HTTP ${res.status}`;
    console.error(`[pocketbase-mcp] loadAuthToken failure via legacy admins (status ${res.status}): ${msg}`);
    throw new AuthError(`Authentication failed: ${msg}`);
  }

  const data = await res.json() as { token: string };
  pb.authStore.save(data.token);
  console.warn("[pocketbase-mcp] Authenticated via legacy admins API. Upgrade to PocketBase v0.23+ for long-term support.");
  return pb;
}
