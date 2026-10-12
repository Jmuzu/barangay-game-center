import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { findGameRegistration } from "@code/database/sqlite";
import { signInbetweenPayload } from "@code/database/providerSecurity";
import { getGameCenterSession } from "@code/auth/parentSession";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ appKey: string }> }) {
  const session = await getGameCenterSession();
  if (!session) return NextResponse.json({ message: "Parent platform sign-in required." }, { status: 401 });
  const { appKey } = await context.params;
    const registrationRecord = findGameRegistration(appKey);
    if (!registrationRecord) return NextResponse.json({ message: "Registered app not found." }, { status: 404 });
    if (!registrationRecord.registration.active || registrationRecord.registration.status !== "active") {
      return NextResponse.json({ message: "Registered app is not active." }, { status: 403 });
    }

    const platformUser = session.user;

    const isInbetween =
      registrationRecord.registration.launchUrl.includes("ib-automated.oraytph.com") ||
      registrationRecord.registration.appKey === "inbetween" ||
      registrationRecord.registration.id === "game-reg-003";

    const payload = {
      username: platformUser.id,
      userToken: randomUUID(),
      platformName: "barangay-game-center",
      gameType: isInbetween ? "classic" : registrationRecord.registration.appKey,
    };
    const launchPayload = {
      ...payload,
      displayName: platformUser.displayName,
      avatarEmoji: "🙂",
      homeBarangay: platformUser.homeBarangay,
    };
    const sign = signInbetweenPayload(payload, registrationRecord.signingSecret);

    let launchUrlString: string;
    if (registrationRecord.registration.launchUrl.includes("ib-automated.oraytph.com")) {
      const base = registrationRecord.registration.launchUrl.replace(/\/+$/, "");
      launchUrlString = `${base}/third-party-auth/${encodeURIComponent(payload.platformName)}/${encodeURIComponent(payload.username)}/${encodeURIComponent(payload.userToken)}/${encodeURIComponent(sign)}/${encodeURIComponent(payload.gameType)}`;
    } else {
      const launchUrl = new URL(registrationRecord.registration.launchUrl);
      Object.entries({ ...launchPayload, sign }).forEach(([key, value]) => launchUrl.searchParams.set(key, value));
      launchUrlString = launchUrl.toString();
    }

    return NextResponse.json({
      launchUrl: launchUrlString,
      appKey: registrationRecord.registration.appKey,
      payload: launchPayload,
      sign,
    });
}