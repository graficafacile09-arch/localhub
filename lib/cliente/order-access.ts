import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";

/** Durata del bearer token usato per le conferme guest e i link email. */
const ORDER_ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const ORDER_ACCESS_COOKIE_PREFIX = "lh_order_access_";

function tokenSecret(): string {
  const secret = process.env.ORDER_ACCESS_TOKEN_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error("ORDER_ACCESS_TOKEN_SECRET o SUPABASE_SERVICE_ROLE_KEY mancante.");
  }
  return secret;
}

function base64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function firma(payload: string): string {
  return createHmac("sha256", tokenSecret()).update(payload).digest("base64url");
}

/**
 * Crea un token bearer limitato a un solo ordine e con scadenza.
 * Il token non contiene PII: solo UUID ordine e timestamp di scadenza.
 */
export function createOrderAccessToken(
  ordineId: string,
  ttlSeconds = ORDER_ACCESS_TOKEN_TTL_SECONDS,
): string {
  const payload = base64Url(
    JSON.stringify({
      oid: String(ordineId),
      exp: Math.floor(Date.now() / 1000) + Math.floor(ttlSeconds),
    }),
  );
  return `${payload}.${firma(payload)}`;
}

export function orderAccessCookieName(ordineId: string): string {
  return `${ORDER_ACCESS_COOKIE_PREFIX}${base64Url(String(ordineId))}`;
}

/** Scrive il bearer in un cookie httpOnly per il normale flusso guest. */
export function setOrderAccessCookie(response: NextResponse, ordineId: string): void {
  response.cookies.set(orderAccessCookieName(ordineId), createOrderAccessToken(ordineId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ORDER_ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function createOrderConfirmationUrl(baseUrl: string, ordineId: string): string {
  const url = new URL(`/ordini/conferma/${encodeURIComponent(ordineId)}`, baseUrl);
  url.searchParams.set("token", createOrderAccessToken(ordineId));
  return url.toString();
}

/** Verifica firma, ordine associato e scadenza del token bearer. */
export function verifyOrderAccessToken(token: string | null | undefined, ordineId: string): boolean {
  if (!token || typeof token !== "string") return false;
  const [payload, signature, ...extra] = token.split(".");
  if (!payload || !signature || extra.length > 0) return false;

  try {
    const expected = firma(payload);
    const suppliedBuffer = Buffer.from(signature, "base64url");
    const expectedBuffer = Buffer.from(expected, "base64url");
    if (
      suppliedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(suppliedBuffer, expectedBuffer)
    ) {
      return false;
    }

    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      oid?: unknown;
      exp?: unknown;
    };
    return (
      decoded.oid === String(ordineId) &&
      typeof decoded.exp === "number" &&
      Number.isFinite(decoded.exp) &&
      decoded.exp > Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}
