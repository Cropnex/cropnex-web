export async function requireSupabaseUser(request: Request) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token)
    return Response.json(
      { error: "Sign in to use this CropNex feature." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey)
    return Response.json(
      { error: "CropNex authentication is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );

  let identity: Response;
  try {
    identity = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return Response.json(
      { error: "Unable to verify your login session. Please try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!identity.ok)
    return Response.json(
      {
        error:
          identity.status === 401 || identity.status === 403
            ? "Your login session expired. Please sign in again."
            : "Unable to verify your login session. Please try again.",
      },
      {
        status: identity.status === 401 || identity.status === 403 ? 401 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );

  return null;
}
