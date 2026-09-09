import { createClient, SupabaseClient } from '@supabase/supabase-js';

const STORAGE_URL_KEY = 'asthra_supabase_url';
const STORAGE_ANON_KEY = 'asthra_supabase_anon_key';

export function getSupabaseConfig(): { url: string; anonKey: string } {
  let envUrl = '';
  let envKey = '';
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      envUrl = (import.meta.env.VITE_SUPABASE_URL as string) || '';
      envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || '';
    }
  } catch {
    // Ignore in non-vite runtimes
  }
  // In production (env vars set), always use env vars (#32).
  // Only allow localStorage override in dev mode (no env vars).
  if (envUrl && envKey) {
    return { url: envUrl.trim(), anonKey: envKey.trim() };
  }
  const localUrl = import.meta.env.DEV ? localStorage.getItem(STORAGE_URL_KEY) : null;
  const localKey = import.meta.env.DEV ? localStorage.getItem(STORAGE_ANON_KEY) : null;
  const url = localUrl || envUrl;
  const anonKey = localKey || envKey;
  return { url: url.trim(), anonKey: anonKey.trim() };
}

export function saveSupabaseConfig(url: string, anonKey: string) {
  localStorage.setItem(STORAGE_URL_KEY, url.trim());
  localStorage.setItem(STORAGE_ANON_KEY, anonKey.trim());
  currentClient = null; // reset cached instance
}

let currentClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (currentClient) return currentClient;

  const { url, anonKey } = getSupabaseConfig();
  if (url && anonKey && url.startsWith('http')) {
    try {
      currentClient = createClient(url, anonKey, {
        auth: { persistSession: false },
        realtime: { params: { eventsPerSecond: 10 } },
      });
      return currentClient;
    } catch (err) {
      console.warn('Failed to initialize Supabase client:', err);
      return null;
    }
  }
  return null;
}

export async function testSupabaseConnection(): Promise<{ success: boolean; message: string }> {
  const client = getSupabase();
  if (!client) {
    return { success: false, message: 'Supabase URL or Anon Key is missing or invalid.' };
  }
  try {
    const { data, error } = await client.from('questions_public').select('id').limit(1);
    if (error) {
      return { success: false, message: `Connected to Supabase, but query failed: ${error.message}. Have you run the schema script?` };
    }
    return { success: true, message: `Connected successfully to Supabase! Found ${data ? data.length : 0} questions table.` };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, message: `Connection error: ${message}` };
  }
}
