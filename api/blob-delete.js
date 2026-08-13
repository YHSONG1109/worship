import { del } from "@vercel/blob";
import { currentUserId } from "./_lib.js";

export default async function handler(req, res) {
  const userId = currentUserId(req);
  if (!userId) return res.status(401).json({ error: "로그인이 필요해요." });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const url = req.body && req.body.url;
  if (!url || typeof url !== "string") return res.status(400).json({ error: "url이 필요해요." });

  // the score library is shared, so any signed-in member may remove its images
  if (!url.includes("/shared/")) {
    return res.status(403).json({ error: "삭제할 수 없는 파일이에요." });
  }

  try {
    await del(url);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(200).json({ ok: true, warning: e && e.message ? e.message : "" });
  }
}
