import crypto from "crypto";
import { makeToken, authCookie, clearCookie, isAuthed } from "./_lib.js";

export default async function handler(req, res) {
  // GET = "am I still logged in?"
  if (req.method === "GET") {
    if (!process.env.APP_PASSWORD) {
      return res.status(500).json({ error: "APP_PASSWORD 환경변수가 설정되지 않았어요." });
    }
    return res.status(200).json({ authed: isAuthed(req) });
  }

  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", clearCookie());
    return res.status(200).json({ ok: true });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    return res.status(500).json({ error: "APP_PASSWORD 환경변수가 설정되지 않았어요." });
  }

  const password = (req.body && req.body.password) || "";
  const a = Buffer.from(String(password));
  const b = Buffer.from(String(expected));
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!ok) {
    return res.status(401).json({ error: "비밀번호가 맞지 않아요." });
  }

  res.setHeader("Set-Cookie", authCookie(makeToken()));
  return res.status(200).json({ ok: true });
}
