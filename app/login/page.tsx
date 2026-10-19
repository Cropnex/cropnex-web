"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { LEGAL_VERSION } from "@/lib/app-meta";

export default function LoginPage() {

  const router = useRouter();

const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const [confirmPassword, setConfirmPassword] = useState("");
const [mode, setMode] = useState<"login" | "register">("login");
const [message, setMessage] = useState("");
const [loading, setLoading] = useState(false);
const [acceptedLegal, setAcceptedLegal] = useState(false);
const handleLogin = async () => {
  setLoading(true);

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    console.log("Login data:", data);
    console.log("Login error:", error);

    if (error) {
      alert(error.message);
      return;
    }

    router.push("/dashboard");
  } catch (err) {
    console.error("Login failed:", err);
    alert("Login failed. Check Supabase URL/key or network.");
  } finally {
    setLoading(false);
  }
};

const handleRegister = async () => {
  setMessage("");
  if (!email.trim() || password.length < 8) {
    alert("Enter a valid email and a password of at least 8 characters.");
    return;
  }
  if (password !== confirmPassword) {
    alert("The passwords do not match.");
    return;
  }
  if (!acceptedLegal) {
    alert("Please accept the Terms and Privacy Notice to create an account.");
    return;
  }
  setLoading(true);
  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: {
          legal_version: LEGAL_VERSION,
          legal_accepted_at: new Date().toISOString(),
        },
      },
    });
    if (error) {
      alert(error.message);
      return;
    }
    if (data.session) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setMessage("Account created. Check your email and select the confirmation link, then return here to sign in.");
      setMode("login");
      setPassword("");
      setConfirmPassword("");
    }
  } catch (err) {
    console.error("Registration failed:", err);
    alert("Registration failed. Check the Supabase authentication settings or network connection.");
  } finally {
    setLoading(false);
  }
};

  return (
    <main className="min-h-screen bg-[#050b08] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black">
            AG<span className="text-green-500">CORE</span>
          </h1>
          <p className="mt-3 text-gray-400">{mode === "login" ? "Sign in to your CropNex workspace" : "Create an account and request verified access"}</p>
        </div>

        <form
  className="space-y-5"
  onSubmit={(e) => e.preventDefault()}
>
          <div>
            <label className="text-sm text-gray-300">Email</label>
            <input
  type="email"
  placeholder="you@example.com"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3"
/>
          </div>

          <div>
            <label className="text-sm text-gray-300">Password</label>
           <input
  type="password"
  placeholder="••••••••"
  value={password}
  onChange={(e) => setPassword(e.target.value)}
  className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3"
/>
          </div>

          {mode === "register" && <div>
            <label className="text-sm text-gray-300">Confirm password</label>
            <input
              type="password"
              placeholder="At least 8 characters"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3"
            />
          </div>}

          {mode === "register" && <label className="flex items-start gap-3 text-sm leading-6 text-gray-300">
            <input
              type="checkbox"
              checked={acceptedLegal}
              onChange={(event) => setAcceptedLegal(event.target.checked)}
              className="mt-1 h-4 w-4 accent-green-500"
            />
            <span>I accept the <Link className="font-semibold text-green-400 hover:underline" href="/legal/terms">Terms</Link> and acknowledge the <Link className="font-semibold text-green-400 hover:underline" href="/legal/privacy">Privacy Notice</Link>.</span>
          </label>}

<button
  type="button"
  onClick={mode === "login" ? handleLogin : handleRegister}
  disabled={loading}
  className="w-full rounded-xl bg-green-500 px-5 py-3 font-bold text-black"
>
  {loading ? (mode === "login" ? "Signing in..." : "Creating account...") : (mode === "login" ? "Login" : "Create account")}
</button>
        </form>

        {message && <p className="mt-5 rounded-xl border border-green-400/20 bg-green-400/10 p-3 text-sm leading-6 text-green-200">{message}</p>}

        <p className="mt-6 text-center text-sm text-gray-400">
          {mode === "login" ? "New to CropNex?" : "Already registered?"}{" "}
          <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setMessage(""); }} className="font-bold text-green-400">
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
