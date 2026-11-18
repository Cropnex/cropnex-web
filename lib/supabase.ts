import { createClient } from "@supabase/supabase-js";
import { createOfflineFetch } from "@/lib/offline-platform";

export const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://your-project.supabase.co";
export const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "your-publishable-anon-key";

// Only a public Supabase key belongs in the browser.
const legacyPayload = supabaseAnonKey.split(".")[1];
let legacyRole: string | undefined;
if (legacyPayload) {
  try {
    legacyRole = JSON.parse(atob(legacyPayload.replace(/-/g, "+").replace(/_/g, "/"))).role;
  } catch {
    // Non-JWT public keys are handled by Supabase.
  }
}
if (supabaseAnonKey.startsWith("sb_secret_") || (legacyRole && legacyRole !== "anon")) {
  throw new Error("CropNex requires a public Supabase key. Check the deployment configuration.");
}

const client = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: createOfflineFetch(supabaseUrl) },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Supabase Auth 2.116 currently publishes a narrowed AuthClient declaration in
// some CommonJS/bundler combinations even though these methods exist at runtime.
// Keep the application surface explicit until the upstream declaration is fixed.
type CropNexAuthClient = typeof client.auth & {
  getUser: (...args: unknown[]) => Promise<any>;
  getSession: (...args: unknown[]) => Promise<any>;
  signInWithPassword: (...args: any[]) => Promise<any>;
  signUp: (...args: any[]) => Promise<any>;
  resend: (...args: any[]) => Promise<any>;
  onAuthStateChange: (...args: any[]) => any;
  signOut: (...args: unknown[]) => Promise<any>;
};

export const supabase = client as unknown as Omit<typeof client, "auth"> & {
  auth: CropNexAuthClient;
};
