import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { AuthorRole } from "@shared/enums";

export const GAME_CENTER_SESSION_COOKIE = "brgy_game_center_session";

export interface ParentGameIdentity {
  id: string;
  displayName: string;
  homeBarangay: string;
  barangayId: string;
  role: "resident" | "admin" | "super_admin";
  isActive: boolean;
}

export interface GameCenterSession {
  id: string;
  user: ParentGameIdentity;
  gameCenterRole: AuthorRole;
}

interface TokenClaims {
  iss: "barangay-platform";
  aud: "barangay-game-center";
  purpose: "launch" | "session" | "introspect";
  sub: string;
  sid: string;
  jti: string;
  origin?: string;
  iat: number;
  exp: number;
}

function tokenCodec() {
  const secret = process.env.GAME_CENTER_SSO_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error("Game Center SSO is not configured.");
  return {
    sign(claims: TokenClaims) {
      const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
      return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
    },
    verify(token: string, purpose: TokenClaims["purpose"]): TokenClaims {
      if (token.length > 4096) throw new Error("Invalid session token.");
      const [payload, signature, extra] = token.split(".");
      if (!payload || !signature || extra) throw new Error("Invalid session token.");
      const expected = createHmac("sha256", secret).update(payload).digest();
      const actual = Buffer.from(signature, "base64url");
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Invalid session token.");
      const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TokenClaims;
      const now = Math.floor(Date.now() / 1000);
      const maximumLifetime = purpose === "session" ? 28800 : 60;
      let launchOriginIsValid = false;
      if (typeof claims.origin === "string") {
        try {
          const origin = new URL(claims.origin);
          launchOriginIsValid = (origin.protocol === "http:" || origin.protocol === "https:") && origin.origin === claims.origin;
        } catch {
          launchOriginIsValid = false;
        }
      }
      if (claims.iss !== "barangay-platform" || claims.aud !== "barangay-game-center" || claims.purpose !== purpose
        || (purpose === "launch" && !launchOriginIsValid)
        || !claims.sub || !claims.sid || !claims.jti || !Number.isInteger(claims.iat) || !Number.isInteger(claims.exp)
        || claims.iat > now + 5 || claims.exp <= now || claims.exp <= claims.iat || claims.exp - claims.iat > maximumLifetime) {
        throw new Error("Invalid or expired session token.");
      }
      return claims;
    },
  };
}

function mapGameCenterRole(role: ParentGameIdentity["role"]): AuthorRole {
  if (role === "admin" || role === "super_admin") return AuthorRole.SuperAdmin;
  return AuthorRole.Player;
}

async function introspectParentSession(claims: TokenClaims): Promise<ParentGameIdentity> {
  const parentUrl = process.env.BARANGAY_PLATFORM_URL;
  if (!parentUrl) throw new Error("Barangay Platform URL is not configured.");
  const now = Math.floor(Date.now() / 1000);
  const proof = tokenCodec().sign({
    iss: "barangay-platform", aud: "barangay-game-center", purpose: "introspect",
    sub: claims.sub, sid: claims.sid, jti: randomUUID(), iat: now, exp: now + 30,
  });
  const response = await fetch(new URL("/api/game-center/introspect", parentUrl), {
    method: "POST",
    headers: { Authorization: `Bearer ${proof}` },
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Parent platform session is not active.");
  const result = await response.json() as { user?: ParentGameIdentity };
  if (!result.user || result.user.id !== claims.sub || result.user.isActive !== true) throw new Error("Parent user is not active.");
  return result.user;
}

export function verifyLaunchToken(token: string) {
  return tokenCodec().verify(token, "launch");
}

export function createChildSessionToken(claims: TokenClaims): string {
  const now = Math.floor(Date.now() / 1000);
  return tokenCodec().sign({ ...claims, purpose: "session", iat: now, exp: now + 28800 });
}

export async function getGameCenterSession(): Promise<GameCenterSession | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(GAME_CENTER_SESSION_COOKIE)?.value;
    if (!token) return null;
    const claims = tokenCodec().verify(token, "session");
    const user = await introspectParentSession(claims);
    return { id: claims.sid, user, gameCenterRole: mapGameCenterRole(user.role) };
  } catch {
    return null;
  }
}

export async function exchangeLaunchToken(token: string): Promise<{ user: ParentGameIdentity; sessionToken: string; launchId: string; parentSessionId: string; expiresAt: number }> {
  const claims = verifyLaunchToken(token);
  const user = await introspectParentSession(claims);
  const sessionToken = createChildSessionToken(claims);
  return { user, sessionToken, launchId: claims.jti, parentSessionId: claims.sid, expiresAt: claims.exp };
}