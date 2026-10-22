import { NextResponse } from "next/server";

export function proxy() {
  if (process.env.NEXT_PUBLIC_CROPNEX_LAUNCHED === "true") {
    return NextResponse.next();
  }

  return NextResponse.json(
    { error: "CropNex is preparing to launch. API access is not open yet." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export const config = {
  matcher: ["/api/:path*"],
};
