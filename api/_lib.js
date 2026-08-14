import crypto from "crypto";
import { createPool } from "@vercel/postgres";

const COOKIE_NAME = "wd_session";

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
  // AUTH_SECRET signs session cookies. Falling back to the DB string keeps the app
  // usable if it's missing, but sessions then reset whenever that changes.
  return process.env.AUTH_SECRET || connectionString() || "worship-dashboard-fallback";
}

// ---------- password hashing (scrypt) ----------
export function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), s, 64).toString("hex");
  return { salt: s, hash };
}

export function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash);
  const b = Buffer.from(expectedHash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- session cookie: "<userId>.<hmac>" ----------
function sign(value) {
  return crypto.createHmac("sha256", secret()).update(String(value)).digest("hex");
}

export function makeSessionToken(userId) {
  return `${userId}.${sign(userId)}`;
}

export function currentUserId(req) {
  const raw = req.headers.cookie || "";
  const found = raw
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(COOKIE_NAME + "="));
  if (!found) return null;
  const token = decodeURIComponent(found.slice(COOKIE_NAME.length + 1));
  const idx = token.lastIndexOf(".");
  if (idx < 1) return null;
  const id = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = sign(id);
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function sessionCookie(token) {
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

// ---------- schema ----------
let ensured = false;
export async function ensureTables() {
  if (ensured) return;
  const db = getPool();

  await db.sql`
    CREATE TABLE IF NOT EXISTS worship_users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      pw_hash TEXT NOT NULL,
      pw_salt TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await db.sql`
    CREATE TABLE IF NOT EXISTS worship_data (
      key TEXT NOT NULL,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // upgrade the single-tenant table from earlier versions
  await db.sql`ALTER TABLE worship_data ADD COLUMN IF NOT EXISTS user_id INTEGER`;

  // old table had key as the sole primary key; move to (user_id, key)
  const { rows: pk } = await db.sql`
    SELECT constraint_name FROM information_schema.table_constraints
    WHERE table_name = 'worship_data' AND constraint_type = 'PRIMARY KEY'
  `;
  if (pk.length) {
    const { rows: cols } = await db.sql`
      SELECT column_name FROM information_schema.key_column_usage
      WHERE constraint_name = ${pk[0].constraint_name}
    `;
    const names = cols.map((c) => c.column_name);
    if (!names.includes("user_id")) {
      await db.query(`ALTER TABLE worship_data DROP CONSTRAINT "${pk[0].constraint_name}"`);
    }
  }
  await db.sql`
    CREATE UNIQUE INDEX IF NOT EXISTS worship_data_user_key
    ON worship_data (user_id, key)
  `;

  ensured = true;
}

// ---------- shared vs personal data ----------
// The score/lyric/hymn library is common to everyone (user_id = SHARED_ID),
// while setlists — and therefore the stats derived from them — stay personal.
export const SHARED_ID = 0;

export function isSharedKey(key) {
  return (
    key === "lyrics" ||
    key === "hymnLyrics" ||
    key === "scoreIndex" ||
    key === "hymnScoreIndex" ||
    key.startsWith("score:") ||
    key.startsWith("hymnScore:")
  );
}

export function ownerFor(key, userId) {
  return isSharedKey(key) ? SHARED_ID : userId;
}

// Data saved before accounts existed has user_id IS NULL.
// Shared material becomes the common library; setlists go to the first account.
export async function claimLegacyRows(userId) {
  const db = getPool();
  const { rows } = await db.sql`SELECT key FROM worship_data WHERE user_id IS NULL`;
  let n = 0;
  for (const r of rows) {
    const owner = ownerFor(r.key, userId);
    await db.sql`UPDATE worship_data SET user_id = ${owner} WHERE user_id IS NULL AND key = ${r.key}`;
    n++;
  }
  return n;
}
