import { del } from "@vercel/blob";
import { isAuthed } from "./_lib.js";

export default async function handler(req, res) {
  if (!isAuthed(req)) return res.status(401).json({ error: "로그인이 필요해요." });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const url = req.body && req.body.url;
  if (!url || typeof url !== "string") return res.status(400).json({ error: "url이 필요해요." });

  try {
    await del(url);
    return res.status(200).json({ ok: true });
  } catch (e) {
    // a missing blob is fine — the UI already removed the reference
    return res.status(200).json({ ok: true, warning: e && e.message ? e.message : "" });
  }
}
