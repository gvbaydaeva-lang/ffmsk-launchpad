import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const urlLooksValid = Boolean(url && /^https?:\/\//i.test(url.trim()));

export const hasSupabase = Boolean(urlLooksValid && anonKey && anonKey.length > 20);

export const supabase = hasSupabase
  ? createClient(url as string, anonKey as string, {
      auth: { persistSession: false },
    })
  : null;
