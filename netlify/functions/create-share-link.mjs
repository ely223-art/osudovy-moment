import { getStore } from "@netlify/blobs";
import sharp from "sharp";

const MAX_IMAGE_SIZE = 20 * 1024 * 1024;
const SHARE_ID_PATTERN = /^[a-zA-Z0-9-]{8,120}$/;
const SHARE_WIDTH = 1200;
const SHARE_HEIGHT = 630;

const jsonResponse = (statusCode, payload) => ({
  status: statusCode,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  },
});

const responseWithJson = (statusCode, payload) =>
  new Response(JSON.stringify(payload), jsonResponse(statusCode, payload));

export default async (request) => {
  if (request.method !== "POST") {
    return responseWithJson(405, { error: "Method not allowed" });
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("image/")) {
      return responseWithJson(415, { error: "Only image payloads are supported" });
    }

    const rawImageBuffer = Buffer.from(await request.arrayBuffer());
    if (!rawImageBuffer.length) {
      return responseWithJson(400, { error: "Image payload is empty" });
    }

    if (rawImageBuffer.length > MAX_IMAGE_SIZE) {
      return responseWithJson(413, { error: "Image payload is too large" });
    }

    let imageBuffer = rawImageBuffer;
    try {
      imageBuffer = await sharp(rawImageBuffer, { failOn: "none" })
        .rotate()
        .resize(SHARE_WIDTH, SHARE_HEIGHT, {
          fit: "cover",
          // If mobile capture contains a black band at the top, keeping the bottom
          // area prioritizes visible card content.
          position: "south",
          withoutEnlargement: false,
        })
        .jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: "4:4:4" })
        .toBuffer();
    } catch (normalizeError) {
      console.error("share image normalization failed, storing original payload", {
        message: normalizeError?.message || String(normalizeError),
        name: normalizeError?.name || null,
      });
      imageBuffer = rawImageBuffer;
    }

    const titleHeader = request.headers.get("x-share-title") || "Osudovy moment";
    const title = decodeURIComponent(titleHeader).slice(0, 120);

    const requestedShareIdHeader = request.headers.get("x-share-id") || "";
    const requestedShareId = decodeURIComponent(requestedShareIdHeader).trim();
    const id = SHARE_ID_PATTERN.test(requestedShareId) ? requestedShareId : crypto.randomUUID();
    const store = getStore({ name: "moment-share-images" });

    await store.set(`${id}.jpg`, imageBuffer, {
      metadata: {
        createdAt: new Date().toISOString(),
        title,
      },
    });

    const url = new URL(request.url);
    const origin = url.origin;

    return responseWithJson(200, {
      id,
      shareUrl: `${origin}/s/${encodeURIComponent(id)}`,
      imageUrl: `${origin}/.netlify/functions/share-image?id=${encodeURIComponent(id)}`,
    });
  } catch (error) {
    console.error("create-share-link error", error);
    return responseWithJson(500, { error: "Failed to create share link" });
  }
};
