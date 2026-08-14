import { foundConnVar, getPool, ensureTables } from "./_lib.js";

// Reports setup status without exposing secrets — used by the login screen
// to tell the user exactly which step is missing.
export default async function handler(req, res) {
  const status = {
    authSecretSet: Boolean(process.env.AUTH_SECRET),
    blobSet: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    dbEnvVar: foundConnVar(),
    dbConnected: false,
    userCount: null,
    error: null,
  };

  if (status.dbEnvVar) {
    try {
      await ensureTables();
      const db = getPool();
      const { rows } = await db.sql`SELECT COUNT(*)::int AS n FROM worship_users`;
      status.userCount = rows[0].n;
      status.dbConnected = true;
    } catch (e) {
      status.error = e && e.message ? e.message : "DB 연결 실패";
    }
  } else {
    status.error = "데이터베이스 연결 정보(POSTGRES_URL / DATABASE_URL)를 찾을 수 없어요.";
  }

  return res.status(200).json(status);
}
