import { handleUpload } from "@vercel/blob/client";
import { isAuthed } from "./_lib.js";

// Issues a short-lived token so the browser can upload the image file DIRECTLY
// to Blob storage. This bypasses the 4.5MB serverless request limit entirely,
// so score scans can be any size.
export default async function handler(req, res) {
  if (!isAuthed(req)) {
    return res.status(401).json({ error: "로그인이 필요해요." });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({
      error: "이미지 저장소가 연결되지 않았어요. Vercel Storage 탭에서 Blob을 만들고 Connect한 뒤 Redeploy 해주세요.",
    });
  }

  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic"],
        maximumSizeInBytes: 100 * 1024 * 1024, // 100MB per file
        addRandomSuffix: true,
      }),
      onUploadCompleted: async () => {},
    });
    return res.status(200).json(jsonResponse);
  } catch (e) {
    return res.status(400).json({ error: e && e.message ? e.message : "업로드 실패" });
  }
}
