import { NextResponse } from "next/server";
import { fulfillCoinPurchase, findCoinPurchase } from "@code/database/sqlite";
import { verifyPayMongoTestWebhook } from "@code/payments/paymongoTestMode";

export const runtime = "nodejs";

interface CheckoutPayment {
  id?: string;
  attributes?: { amount?: number; currency?: string; status?: string };
}

export async function POST(request: Request) {
  if (!process.env.PAYMONGO_TEST_WEBHOOK_SECRET) {
    return NextResponse.json({ message: "Sandbox webhook is not enabled." }, { status: 503 });
  }

  const rawBody = await request.text();
  if (!verifyPayMongoTestWebhook(rawBody, request.headers.get("paymongo-signature"), process.env.PAYMONGO_TEST_WEBHOOK_SECRET)) {
    return NextResponse.json({ message: "Invalid webhook signature." }, { status: 401 });
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody) as Record<string, any>;
  } catch {
    return NextResponse.json({ message: "Invalid webhook event." }, { status: 400 });
  }

  const envelope = event.data as Record<string, any> | undefined;
  const attributes = envelope?.attributes as Record<string, any> | undefined;
  const eventType = attributes?.type ?? envelope?.type;
  if (eventType !== "checkout_session.payment.paid") return NextResponse.json({ received: true, ignored: true });

  const livemode = attributes?.livemode ?? envelope?.livemode;
  if (livemode !== false) return NextResponse.json({ message: "Only test-mode payment events are accepted." }, { status: 400 });

  const session = (attributes?.data ?? envelope?.data?.data ?? envelope?.data) as Record<string, any> | undefined;
  const sessionAttributes = session?.attributes as Record<string, any> | undefined;
  const referenceNumber = sessionAttributes?.reference_number;
  const sessionId = session?.id;
  const payments = sessionAttributes?.payments as CheckoutPayment[] | undefined;
  const paidPayment = payments?.find((payment) => payment.attributes?.status === "paid");
  const paymentAttributes = paidPayment?.attributes;
  const providerEventId = envelope?.id ?? event.id;
  const eventId = typeof providerEventId === "string"
    ? providerEventId
    : typeof sessionId === "string" && typeof paidPayment?.id === "string"
      ? `checkout-session:${sessionId}:payment:${paidPayment.id}`
      : undefined;

  if (typeof referenceNumber !== "string" || typeof sessionId !== "string" || !eventId || !paidPayment?.id || !paymentAttributes) {
    return NextResponse.json({ message: "Paid checkout event is incomplete." }, { status: 400 });
  }

  const purchase = findCoinPurchase(referenceNumber);
  if (!purchase) return NextResponse.json({ message: "Purchase reference not found." }, { status: 404 });
  if (paymentAttributes.currency !== purchase.currency || paymentAttributes.amount !== purchase.amountMinor) {
    return NextResponse.json({ message: "Paid amount does not match the purchase." }, { status: 400 });
  }

  const outcome = fulfillCoinPurchase({
    playerId: purchase.playerId,
    referenceNumber,
    checkoutSessionId: sessionId,
    paymentId: paidPayment.id,
    eventId,
  });
  if (outcome === "not-found") return NextResponse.json({ message: "Purchase reference not found." }, { status: 404 });
  if (outcome === "session-mismatch" || outcome === "player-mismatch" || outcome === "not-pending") {
    return NextResponse.json({ message: "Paid event does not match a pending purchase." }, { status: 409 });
  }

  return NextResponse.json({ received: true, duplicate: outcome === "duplicate" });
}