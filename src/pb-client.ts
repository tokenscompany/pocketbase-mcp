import PocketBase from "pocketbase";

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
  await pb.collection("_superusers").authWithPassword(email, password);
  return pb;
}
