"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import Link from "next/link";
import { LEGAL_VERSION } from "@/lib/app-meta";
import CropNexLogo from "@/components/brand/CropNexLogo";
import {registrationRoles,validateRegistration} from '@/lib/registration';
import {trialRequest} from '@/lib/trial-request';

type Props={initialMode:"login"|"register";preSubscribe:boolean};
// Load Auth only when an action is requested. Browser storage/SDK startup must not hide the form.
async function authClient(){return trialRequest(async()=> (await import('@/lib/supabase')).supabase,undefined,20000);}
export default function LoginForm({initialMode,preSubscribe}:Props) {
  const router=useRouter();
const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const [confirmPassword, setConfirmPassword] = useState("");
const [mode, setMode] = useState<"login" | "register">(initialMode);
const [message, setMessage] = useState("");
const [messageIsError, setMessageIsError] = useState(false);
const [loading, setLoading] = useState(false);
const [resending, setResending] = useState(false);
const [acceptedLegal, setAcceptedLegal] = useState(false);
const [fullName, setFullName] = useState("");
const [farmName, setFarmName] = useState("");
const [phone,setPhone]=useState(""),[vat,setVat]=useState(""),[accountType,setAccountType]=useState("Farmer");

const handleLogin = async () => {
  setMessage("");
  setMessageIsError(false);
  setLoading(true);

  try {
    const supabase=await authClient();
    const { error } = await trialRequest(()=>supabase.auth.signInWithPassword({
      email:email.trim(),
      password,
    }),undefined,20000);

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
  const problem=validateRegistration({name:fullName,phone,company:farmName,email,password,confirmation:confirmPassword,role:accountType});
  if(problem){setMessage(problem);setMessageIsError(true);return;}
  if (!acceptedLegal) {
    setMessage("Please accept the Terms and Privacy Notice to create an account.");
    setMessageIsError(true);
    return;
  }
  setLoading(true);
  try {
    const supabase=await authClient();
    const { data, error } = await trialRequest(()=>supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          legal_version: LEGAL_VERSION,
          legal_accepted_at: new Date().toISOString(),
          full_name: fullName.trim(),
          account_type:accountType,phone:phone.trim(),business_name:farmName.trim(),vat_number:vat.trim()||null,
          farm_name: farmName.trim(),
          pre_subscribe: preSubscribe,
        },
      },
    }),undefined,20000);
    if (error) {
      setMessage(error.message);
      setMessageIsError(true);
      return;
    }
    if (data.session) {
      await supabase.from("profiles").upsert({
        id: data.session.user.id,
        full_name: fullName.trim(),phone:phone.trim(),business_name:farmName.trim(),vat_number:vat.trim()||null,
        farm_name: farmName.trim() || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
      router.push("/dashboard");
      router.refresh();
    } else {
      setMessage("Your registration was received. Confirm your email using the link in your inbox. Farmer accounts open after confirmation; buyer, transporter, adviser and agent accounts require administrator approval.");
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
    const supabase=await authClient();
    const { error } = await trialRequest(()=>supabase.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/auth/callback` } }),undefined,20000);
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
          <p className="mt-3 text-gray-400">{mode === "login" ? "Sign in to your CropNex workspace" : "Create an account. Confirm your email to continue."}</p>
        </div>

        <form
  className="space-y-5"
          onSubmit={handleSubmit}
>
          {mode === "register" && <>
          <div><label htmlFor="auth-account-type" className="text-sm text-gray-300">Account type</label><select id="auth-account-type" value={accountType} onChange={e=>setAccountType(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#111516] px-4 py-3 text-white">{registrationRoles.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><p className="mt-2 text-xs leading-5 text-gray-300">{accountType==='Farmer'?'Confirm your email and start using CropNex. No administrator approval is needed.':'Confirm your email, then wait for administrator approval for this account type.'}</p></div>
          <div>
            <label htmlFor="auth-full-name" className="text-sm text-gray-300">Your name</label>
            <input id="auth-full-name" type="text" autoComplete="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3" />
          </div>
          <div>
            <label htmlFor="auth-farm-name" className="text-sm text-gray-300">Company / farm business name</label>
            <input id="auth-farm-name" required type="text" autoComplete="organization" value={farmName} onChange={(e) => setFarmName(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3" />
          </div>
          <div><label htmlFor="auth-phone" className="text-sm text-gray-300">Contact number</label><input id="auth-phone" type="tel" autoComplete="tel" required value={phone} onChange={e=>setPhone(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3" /></div>
          <div><label htmlFor="auth-vat" className="text-sm text-gray-300">VAT number (optional)</label><input id="auth-vat" type="text" value={vat} onChange={e=>setVat(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3" /></div>
          </>}

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
            {loading ? (mode === "login" ? "Signing in..." : "Creating profile...") : (mode === "login" ? "Login" : "Create account")}
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
