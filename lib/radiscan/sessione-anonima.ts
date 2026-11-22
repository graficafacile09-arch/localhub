import { createHash, randomBytes } from "node:crypto";

export const COOKIE_SESSIONE_RADISCAN = "radiscan_sid";
export const DURATA_SESSIONE_RADISCAN_SECONDI = 60 * 60 * 24 * 180;

export function leggiTokenSessioneRadiciScan(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const voce = cookie.split(";").map((parte) => parte.trim()).find((parte) => parte.startsWith(`${COOKIE_SESSIONE_RADISCAN}=`));
  const token = voce?.slice(COOKIE_SESSIONE_RADISCAN.length + 1) ?? "";
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

export function creaTokenSessioneRadiciScan(): string {
  return randomBytes(32).toString("base64url");
}

export function hashTokenSessioneRadiciScan(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function cookieSessioneRadiciScan(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_SESSIONE_RADISCAN}=${token}; Path=/; Max-Age=${DURATA_SESSIONE_RADISCAN_SECONDI}; HttpOnly; SameSite=Lax${secure}`;
}
