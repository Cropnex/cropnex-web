"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { LEGAL_VERSION } from "@/lib/app-meta";
import CropNexLogo from "@/components/brand/CropNexLogo";

export default function LoginPage() {

  const router = useRouter();

const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const [confirmPassword, setConfirmPassword] = useState("");
const [mode, setMode] = useState<"login" | "register">("login");
const [message, setMessage] = useState("");
const [messageIsError, setMessageIsError] = useState(false);
const [loading, setLoading] = useState(false);
const [resending, setResending] = useState(false);
const [acceptedLegal, setAcceptedLegal] = useState(false);
const handleLogin = async () => {
  setMessage("");
  setMessageIsError(false);
  setLoading(true);

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      setMessageIsError(true);
      return;
    }

    router.push("/dashboard");
  } catch (err) {
    console.error("Login failed:", err);
    setMessage("Could not sign in. Check your connection and try again.");
    setMessageIsError(true);
  } finally {
    setLoading(false);
  }
};

const handleRegister = async () => {
  setMessage("");
  if (!email.trim() || password.length < 8) {
    setMessage("Enter a valid email and a password of at least 8 characters.");
    setMessageIsError(true);
    return;
  }
  if (password !== confirmPassword) {
    setMessage("The passwords do not match.");
    setMessageIsError(true);
    return;
  }
  if (!acceptedLegal) {
    setMessage("Please accept the Terms and Privacy Notice to create an account.");
    setMessageIsError(true);
    return;
  }
  setLoading(true);
  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          legal_version: LEGAL_VERSION,
          legal_accepted_at: new Date().toISOString(),
        },
      },
    });
    if (error) {
      setMessage(error.message);
      setMessageIsError(true);
      return;
    }
    if (data.session) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setMessage("Account created. Check your email and select the confirmation link, then return here to sign in.");
      setMessageIsError(false);
      setMode("login");
      setPassword("");
      setConfirmPassword("");
    }
  } catch (err) {
    console.error("Registration failed:", err);
    setMessage("Registration could not be completed. Check your connection and try again.");
    setMessageIsError(true);
  } finally {
    setLoading(false);
  }
};

const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  if (loading) return;
  if (mode === "login") await handleLogin();
  else await handleRegister();
};

const resendConfirmation = async () => {
  if (!email.trim()) {
    setMessage("Enter the email address you registered with first.");
    setMessageIsError(true);
    return;
  }
  setResending(true);
  setMessage("");
  try {
    const { error } = await supabase.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
    if (error) {
      setMessage(error.message);
      setMessageIsError(true);
    } else {
      setMessage("A new confirmation email has been sent. Check your inbox and spam folder.");
      setMessageIsError(false);
    }
  } catch {
    setMessage("Could not send a confirmation email. Check your connection and try again.");
    setMessageIsError(true);
  } finally {
    setResending(false);
  }
};

  return (
    <main className="min-h-dvh overflow-y-auto bg-[#111516] text-white flex items-start sm:items-center justify-center px-4 py-6 sm:px-6 sm:py-8">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#1A2022] p-6 sm:p-8 shadow-2xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <CropNexLogo className="justify-center" />
          <p className="mt-3 text-gray-400">{mode === "login" ? "Sign in to your CropNex workspace" : "Create an account and request verified access"}</p>
        </div>

        <form
  className="space-y-5"
          onSubmit={handleSubmit}
>
          <div>
            <label htmlFor="auth-email" className="text-sm text-gray-300">Email</label>
            <input
  id="auth-email"
  type="email"
  inputMode="email"
  autoComplete="email"
  required
  placeholder="you@example.com"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3"
/>
          </div>

          <div>
            <label htmlFor="auth-password" className="text-sm text-gray-300">Password</label>
           <input
  id="auth-password"
  type="password"
  autoComplete={mode === "login" ? "current-password" : "new-password"}
  minLength={mode === "register" ? 8 : undefined}
  required
  placeholder="••••••••"
  value={password}
  onChange={(e) => setPassword(e.target.value)}
  className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3"
/>
          </div>

          {mode === "register" && <div>
            <label htmlFor="auth-confirm-password" className="text-sm text-gray-300">Confirm password</label>
            <input
              id="auth-confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              placeholder="At least 8 characters"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3"
            />
          </div>}

          {mode === "register" && <label className="flex items-start gap-3 text-sm leading-6 text-gray-300">
            <input
              type="checkbox"
              required
              checked={acceptedLegal}
              onChange={(event) => setAcceptedLegal(event.target.checked)}
              className="mt-1 h-4 w-4 accent-[#86CF34]"
            />
            <span>I accept the <Link className="font-semibold text-[#9ADB49] hover:underline" href="/legal/terms">Terms</Link> and acknowledge the <Link className="font-semibold text-[#9ADB49] hover:underline" href="/legal/privacy">Privacy Notice</Link>.</span>
          </label>}

<button
  type="submit"
  disabled={loading}
  className="w-full rounded-xl bg-[#86CF34] px-5 py-3 font-bold text-[#111516] transition hover:bg-[#9ADB49]"
>
  {loading ? (mode === "login" ? "Signing in..." : "Creating account...") : (mode === "login" ? "Login" : "Create account")}
</button>
        </form>

        {message && <div role="status" aria-live="polite" className={`mt-5 rounded-xl border p-3 text-sm leading-6 ${messageIsError ? "border-red-400/30 bg-red-400/10 text-red-200" : "border-green-400/20 bg-green-400/10 text-green-200"}`}>
          <p>{message}</p>
          {mode === "login" && messageIsError && /email not confirmed|confirm your email/i.test(message) && <button type="button" onClick={resendConfirmation} disabled={resending} className="mt-2 font-semibold underline disabled:opacity-60">{resending ? "Sending…" : "Resend confirmation email"}</button>}
        </div>}

        <p className="mt-6 text-center text-sm text-gray-400">
          {mode === "login" ? "New to CropNex?" : "Already registered?"}{" "}
          <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setMessage(""); }} className="font-bold text-[#9ADB49]">
            {mode === "login" ? "Create account" : "Sign in"}
          </button>
        </p>
        <div className="mt-5 flex justify-center gap-4 text-xs text-gray-500">
          <Link className="hover:text-white" href="/legal/terms">Terms</Link>
          <Link className="hover:text-white" href="/legal/privacy">Privacy</Link>
          <Link className="hover:text-white" href="/legal/acceptable-use">Acceptable use</Link>
        </div>
      </div>
    </main>
  );
}
