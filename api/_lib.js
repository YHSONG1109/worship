import crypto from "crypto";
import { sql } from "@vercel/postgres";

const COOKIE_NAME = "wd_auth";

function secret() {
  // AUTH_SECRET is preferred; fall back to the password so the app still works
  // if the user only sets APP_PASSWORD.
  return process.env.AUTH_SECRET || process.env.APP_PASSWORD || "";
}

export function makeToken() {
  return crypto.createHmac("sha256", secret()).update("worship-dashboard-v1").digest("hex");
}

export function isAuthed(req) {
  if (!process.env.APP_PASSWORD) return false;
  const raw = req.headers.cookie || "";
  const found = raw
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(COOKIE_NAME + "="));
  if (!found) return false;
  const token = decodeURIComponent(found.slice(COOKIE_NAME.length + 1));
  const expected = makeToken();
  if (token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export function authCookie(token) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Secure",
    "Max-Age=" + 60 * 60 * 24 * 365,
  ];
  return parts.join("; ");
}

export function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
}

let ensured = false;
export async function ensureTable() {
  if (ensured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS worship_data (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  ensured = true;
}
