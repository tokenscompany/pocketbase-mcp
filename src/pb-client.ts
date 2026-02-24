import PocketBase from "pocketbase";

export function createPBClient(url: string, token: string): PocketBase {
  const pb = new PocketBase(url);
  pb.authStore.save(token);
  return pb;
}
