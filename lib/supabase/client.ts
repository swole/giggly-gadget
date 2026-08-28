import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Untyped client (no generated Database types in this project). Declaring the generics
// as `any` keeps `.update()/.insert()` payloads usable from components instead of `never`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, "public", any>;

let _client: AnyClient | null = null;

export function supabaseBrowser(): AnyClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  _client = createClient(url, key);
  return _client;
}
