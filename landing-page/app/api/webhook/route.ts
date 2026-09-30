import { NextRequest, NextResponse } from "next/server";

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || "viraldog_meta_webhook_secret_2026";

/**
 * Endpoint de verificação do Webhook da Meta (Instagram / Facebook Graph API)
 * A Meta envia um GET com hub.mode, hub.verify_token e hub.challenge
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[Meta Webhook] Validação realizada com sucesso pelo Meta Developer!");
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  console.warn("[Meta Webhook] Falha na validação do token:", { mode, token });
  return new Response("Forbidden: Invalid verify token", { status: 403 });
}

/**
 * Endpoint de recebimento de notificações de eventos da Meta
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    console.log("[Meta Webhook Event]", JSON.stringify(payload));
    return NextResponse.json({ status: "EVENT_RECEIVED" }, { status: 200 });
  } catch (err) {
    console.error("[Meta Webhook Error]", err);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
}
