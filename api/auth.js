import {
  getPool, ensureTables, hashPassword, verifyPassword,
  makeSessionToken, sessionCookie, clearCookie, currentUserId, claimLegacyRows,
} from "./_lib.js";

function cleanUsername(v) {
  return String(v || "").trim().toLowerCase();
}

export default async function handler(req, res) {
  try {
    await ensureTables();
    const db = getPool();

    // who am I?
    if (req.method === "GET") {
      const uid = currentUserId(req);
      if (!uid) return res.status(200).json({ authed: false });
      const { rows } = await db.sql`SELECT username FROM worship_users WHERE id = ${uid}`;
      if (!rows.length) return res.status(200).json({ authed: false });
      return res.status(200).json({ authed: true, username: rows[0].username, userId: uid });
    }

    // logout
    if (req.method === "DELETE") {
      res.setHeader("Set-Cookie", clearCookie());
      return res.status(200).json({ ok: true });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const action = (req.body && req.body.action) || "login";
    const username = cleanUsername(req.body && req.body.username);
    const password = String((req.body && req.body.password) || "");

    if (username.length < 2 || username.length > 20) {
      return res.status(400).json({ error: "아이디는 2~20자로 입력해주세요." });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: "비밀번호는 4자 이상으로 입력해주세요." });
    }

    if (action === "signup") {
      const { rows: exists } = await db.sql`SELECT id FROM worship_users WHERE username = ${username}`;
      if (exists.length) {
        return res.status(409).json({ error: "이미 사용 중인 아이디예요." });
      }
      const { salt, hash } = hashPassword(password);
      const { rows } = await db.sql`
        INSERT INTO worship_users (username, pw_hash, pw_salt)
        VALUES (${username}, ${hash}, ${salt})
        RETURNING id
      `;
      const userId = rows[0].id;

      // the very first account inherits any data from the pre-accounts version
      const { rows: countRows } = await db.sql`SELECT COUNT(*)::int AS n FROM worship_users`;
      let adopted = 0;
      if (countRows[0].n === 1) adopted = await claimLegacyRows(userId);

      res.setHeader("Set-Cookie", sessionCookie(makeSessionToken(userId)));
      return res.status(200).json({ ok: true, username, userId, adopted });
    }

    // login
    const { rows } = await db.sql`
      SELECT id, pw_hash, pw_salt FROM worship_users WHERE username = ${username}
    `;
    if (!rows.length) {
      return res.status(401).json({ error: "아이디 또는 비밀번호가 맞지 않아요." });
    }
    const u = rows[0];
    if (!verifyPassword(password, u.pw_salt, u.pw_hash)) {
      return res.status(401).json({ error: "아이디 또는 비밀번호가 맞지 않아요." });
    }

    res.setHeader("Set-Cookie", sessionCookie(makeSessionToken(u.id)));
    return res.status(200).json({ ok: true, username, userId: u.id });
  } catch (e) {
    return res.status(500).json({ error: e && e.message ? e.message : "서버 오류" });
  }
}
