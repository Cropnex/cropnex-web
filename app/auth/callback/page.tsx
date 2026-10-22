"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import CropNexLogo from "@/components/brand/CropNexLogo";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let completed = false;
    const authError = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("error_description");
    if (authError) {
      window.setTimeout(() => { if (active) setFailed(true); }, 0);
      return () => { active = false; };
    }
    const finish = async () => {
      if (!active || completed) return;
      completed = true;
      try {
        const user = (await supabase.auth.getUser()).data.user;
        if (user?.user_metadata?.pre_subscribe === true) {
          const { error } = await supabase.from("profiles").upsert({
            id: user.id,
            full_name: typeof user.user_metadata.full_name === "string" ? user.user_metadata.full_name : null,
            farm_name: typeof user.user_metadata.farm_name === "string" && user.user_metadata.farm_name.trim() ? user.user_metadata.farm_name : null,
            updated_at: new Date().toISOString(),
          }, { onConflict: "id" });
          if (error) console.error("Could not save the new CropNex profile details:", error.message);
        }
      } catch (error) {
        console.error("Could not save the new CropNex profile details:", error);
      } finally {
        router.replace("/dashboard");
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user?.email_confirmed_at && (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")) finish();
    });

    // Supabase detects and exchanges the confirmation link parameters during
    // client initialization. Check the resulting session as well as listening
    // for the auth event to cover both fast and delayed mobile mail clients.
    void supabase.auth.getSession().then(({ data, error }) => {
      if (data.session?.user?.email_confirmed_at) finish();
      else if (error && active) setFailed(true);
    }).catch(() => { if (active) setFailed(true); });

    const timeout = window.setTimeout(() => { if (active && !completed) setFailed(true); }, 12000);
    return () => {
      active = false;
      window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [router]);

  return (
    <main className="min-h-dvh bg-[#14261F] text-white flex items-center justify-center px-4 py-8">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-7 text-center shadow-2xl sm:p-8">
        <div className="mb-6 flex justify-center"><CropNexLogo className="justify-center" /></div>
        {failed ? <>
          <h1 className="text-xl font-bold">We couldn’t finish confirming your email</h1>
          <p className="mt-3 text-sm leading-6 text-gray-300">The confirmation link may have expired or already been used. Return to sign in and request a new confirmation email.</p>
          <Link href="/login" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#D6A64C] px-5 font-bold text-[#171812]">Return to sign in</Link>
        </> : <>
          <h1 className="text-xl font-bold">Confirming your email…</h1>
          <p className="mt-3 text-sm leading-6 text-gray-300">Please keep this page open. We’ll take you to CropNex when verification is complete.</p>
        </>}
      </section>
    </main>
  );
}
