import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode") || "";
  const token = url.searchParams.get("hub.verify_token") || "";
  const challenge = url.searchParams.get("hub.challenge") || "";
  const expected = process.env.WHATSAPP_VERIFY_TOKEN || "";
  if (mode === "subscribe" && expected && safeEqual(token, expected)) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return Response.json({ error: "Webhook verification failed." }, { status: 403 });
}

type MetaMessage = {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: MediaPayload;
  document?: MediaPayload;
  audio?: MediaPayload;
  video?: MediaPayload;
  sticker?: MediaPayload;
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  button?: { text?: string };
};
type MediaPayload = { id?: string; mime_type?: string; filename?: string; sha256?: string; caption?: string };

export async function POST(request: Request) {
  const appSecret = process.env.WHATSAPP_APP_SECRET || "";
  const signature = request.headers.get("x-hub-signature-256") || "";
  if (!appSecret) return Response.json({ error: "WhatsApp webhook is not configured." }, { status: 503 });

  const rawBody = await request.text();
  const expectedSignature = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  if (!signature || !safeEqual(signature, expectedSignature)) {
    return Response.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: "Server-side Supabase credentials are not configured." }, { status: 503 });
  }

  let payload: { entry?: { changes?: { value?: { metadata?: { phone_number_id?: string }; messages?: MetaMessage[] } }[] }[] };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        for (const message of value?.messages || []) {
          if (!message.id || !message.from) continue;
          const phone = `+${message.from.replace(/\D/g, "")}`;
          const { data: sender, error: senderError } = await supabase
            .from("whatsapp_senders")
            .select("id,user_id,display_name,default_shed_name")
            .eq("phone_e164", phone)
            .eq("active", true)
            .maybeSingle();
          if (senderError) throw senderError;
          // Only retain messages from a number the farm has explicitly authorised.
          if (!sender) continue;

          const media = message.image || message.document || message.audio || message.video || message.sticker;
          const location = message.location;
          const readableText = message.text?.body
            || media?.caption
            || message.interactive?.button_reply?.title
            || message.interactive?.list_reply?.title
            || message.button?.text
            || (location ? `Location shared: ${location.latitude ?? "?"}, ${location.longitude ?? "?"}${location.name ? ` · ${location.name}` : ""}` : null);
          const timestamp = Number(message.timestamp);
          const receivedAt = Number.isFinite(timestamp) && timestamp > 0
            ? new Date(timestamp * 1000).toISOString()
            : new Date().toISOString();
          const { error: insertError } = await supabase.from("whatsapp_inbox").upsert({
            user_id: sender.user_id,
            sender_id: sender.id,
            sender_phone_e164: phone,
            sender_name: sender.display_name,
            whatsapp_message_id: message.id,
            whatsapp_phone_number_id: value?.metadata?.phone_number_id || null,
            message_type: message.type || "unknown",
            message_text: readableText,
            media_id: media?.id || null,
            media_mime_type: media?.mime_type || null,
            media_filename: media?.filename || null,
            media_sha256: media?.sha256 || null,
            default_shed_name: sender.default_shed_name,
            received_at: receivedAt,
          }, { onConflict: "whatsapp_message_id", ignoreDuplicates: true });
          if (insertError) throw insertError;
        }
      }
    }
  } catch (error) {
    console.error("WhatsApp webhook could not store an authorised message", error);
    return Response.json({ error: "Could not save the incoming message." }, { status: 500 });
  }

  return Response.json({ received: true });
}
