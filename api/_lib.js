import crypto from "crypto";
import { createPool } from "@vercel/postgres";

const COOKIE_NAME = "wd_auth";

// Vercel/Neon hand the connection string over under different names depending on
// which integration created the database, so check all the common ones.
const CONN_VARS = [
  "POSTGRES_URL",
  "DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "DATABASE_POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NO_SSL",
];

export function connectionString() {
  for (const name of CONN_VARS) {
    const v = process.env[name];
    if (v && v.trim()) return v.trim();
  }
  return null;
}

export function foundConnVar() {
  for (const name of CONN_VARS) {
    const v = process.env[name];
    if (v && v.trim()) return name;
  }
  return null;
}

let pool = null;
export function getPool() {
  if (pool) return pool;
  const cs = connectionString();
  if (!cs) {
    const err = new Error(
      "데이터베이스가 연결되지 않았어요. Vercel 프로젝트의 Storage 탭에서 Postgres(Neon) 데이터베이스를 만들어 이 프로젝트에 Connect한 뒤, Deployments에서 Redeploy 해주세요."
    );
    err.code = "NO_DB";
    throw err;
  }
  pool = createPool({ connectionString: cs });
  return pool;
}

function secret() {
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
  return [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Secure",
    "Max-Age=" + 60 * 60 * 24 * 365,
  ].join("; ");
}

export function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
}

let ensured = false;
export async function ensureTable() {
  if (ensured) return;
  const db = getPool();
  await db.sql`
    CREATE TABLE IF NOT EXISTS worship_data (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  ensured = true;
}
