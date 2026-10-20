import { createClient } from "@supabase/supabase-js";
let client;
export function getSupabase() {
  if (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    !process.env.SUPABASE_PRIVATE_STORAGE_BUCKET
  ) {
    const error = new Error("Photo storage is not configured");
    error.code = "STUDIO_NOT_CONFIGURED";
    throw error;
  }
  return (client ||= createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  ));
}
export default {
  get storage() {
    return getSupabase().storage;
  },
};
