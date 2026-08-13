import { getPool, ensureTables, currentUserId, ownerFor, SHARED_ID } from "./_lib.js";

export const config = {
  api: {
    bodyParser: { sizeLimit: "20mb" },
  },
};

export default async function handler(req, res) {
  const userId = currentUserId(req);
  if (!userId) {
    return res.status(401).json({ error: "로그인이 필요해요." });
  }

  try {
    await ensureTables();
    const db = getPool();

    if (req.method === "GET") {
      // personal rows (setlists) plus the shared library (scores / lyrics / hymns)
      const { rows } = await db.sql`
        SELECT key, value FROM worship_data
        WHERE user_id = ${userId} OR user_id = ${SHARED_ID}
      `;
      const out = {};
      for (const r of rows) out[r.key] = r.value;
      return res.status(200).json({ data: out });
    }

    if (req.method === "POST") {
      const sets = (req.body && req.body.sets) || [];
      const deletes = (req.body && req.body.deletes) || [];

      for (const item of sets) {
        if (!item || typeof item.key !== "string") continue;
        const owner = ownerFor(item.key, userId);
        await db.sql`
          INSERT INTO worship_data (user_id, key, value, updated_at)
          VALUES (${owner}, ${item.key}, ${JSON.stringify(item.value)}::jsonb, now())
          ON CONFLICT (user_id, key)
          DO UPDATE SET value = EXCLUDED.value, updated_at = now()
        `;
      }
      for (const key of deletes) {
        if (typeof key !== "string") continue;
        const owner = ownerFor(key, userId);
        await db.sql`DELETE FROM worship_data WHERE user_id = ${owner} AND key = ${key}`;
      }

      return res.status(200).json({ ok: true, written: sets.length, removed: deletes.length });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    const msg = e && e.message ? e.message : "서버 오류";
    return res.status(500).json({ error: msg, code: e && e.code ? e.code : undefined });
  }
}
