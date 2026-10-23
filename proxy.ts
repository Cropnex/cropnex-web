import { NextResponse } from "next/server";

export function proxy(request: Request) {
  // Meta needs this one signed endpoint to receive messages during CropNex's
  // pre-launch period. Every other application API remains launch-gated.
  if (new URL(request.url).pathname === "/api/whatsapp/webhook") {
    return NextResponse.next();
  }

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
