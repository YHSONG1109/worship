import { foundConnVar, getPool, ensureTable } from "./_lib.js";

// Reports setup status without exposing secrets — used by the login screen
// to tell the user exactly which step is missing.
export default async function handler(req, res) {
  const status = {
    passwordSet: Boolean(process.env.APP_PASSWORD),
    authSecretSet: Boolean(process.env.AUTH_SECRET),
    dbEnvVar: foundConnVar(),
    dbConnected: false,
    error: null,
  };

  if (status.dbEnvVar) {
    try {
      await ensureTable();
      const db = getPool();
      await db.sql`SELECT 1`;
      status.dbConnected = true;
    } catch (e) {
      status.error = e && e.message ? e.message : "DB 연결 실패";
    }
  } else {
    status.error = "데이터베이스 연결 정보(POSTGRES_URL / DATABASE_URL)를 찾을 수 없어요.";
  }

  return res.status(200).json(status);
}
