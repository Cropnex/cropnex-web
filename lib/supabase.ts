import { createClient } from "@supabase/supabase-js";
import { createOfflineFetch } from "@/lib/offline-platform";

export const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://your-project.supabase.co";
export const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "your-publishable-anon-key";

const client = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: createOfflineFetch() },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Supabase Auth 2.116 currently publishes a narrowed AuthClient declaration in
// some CommonJS/bundler combinations even though these methods exist at runtime.
// Keep the application surface explicit until the upstream declaration is fixed.
type AgcoreAuthClient = typeof client.auth & {
  getUser: (...args: unknown[]) => Promise<any>;
  getSession: (...args: unknown[]) => Promise<any>;
  signInWithPassword: (...args: any[]) => Promise<any>;
  signUp: (...args: any[]) => Promise<any>;
  signOut: (...args: unknown[]) => Promise<any>;
};

export const supabase = client as unknown as Omit<typeof client, "auth"> & {
  auth: AgcoreAuthClient;
};
