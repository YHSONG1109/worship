import { isAuthed, ensureTable, getPool } from "./_lib.js";

export const config = {
  api: {
    bodyParser: { sizeLimit: "20mb" },
  },
};

export default async function handler(req, res) {
  if (!isAuthed(req)) {
    return res.status(401).json({ error: "로그인이 필요해요." });
  }

  try {
    await ensureTable();
    const db = getPool();

    if (req.method === "GET") {
      const { rows } = await db.sql`SELECT key, value FROM worship_data`;
      const out = {};
      for (const r of rows) out[r.key] = r.value;
      return res.status(200).json({ data: out });
    }

    if (req.method === "POST") {
      const sets = (req.body && req.body.sets) || [];
      const deletes = (req.body && req.body.deletes) || [];

      for (const item of sets) {
        if (!item || typeof item.key !== "string") continue;
        await db.sql`
          INSERT INTO worship_data (key, value, updated_at)
          VALUES (${item.key}, ${JSON.stringify(item.value)}::jsonb, now())
          ON CONFLICT (key)
          DO UPDATE SET value = EXCLUDED.value, updated_at = now()
        `;
      }
      for (const key of deletes) {
        if (typeof key !== "string") continue;
        await db.sql`DELETE FROM worship_data WHERE key = ${key}`;
      }

      return res.status(200).json({ ok: true, written: sets.length, removed: deletes.length });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    const msg = e && e.message ? e.message : "서버 오류";
    return res.status(500).json({ error: msg, code: e && e.code ? e.code : undefined });
  }
}
