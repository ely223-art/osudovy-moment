import { getStore } from "@netlify/blobs";
import sharp from "sharp";

const MAX_IMAGE_SIZE = 20 * 1024 * 1024;
const SHARE_ID_PATTERN = /^[a-zA-Z0-9-]{8,120}$/;
const SHARE_WIDTH = 1200;
const SHARE_HEIGHT = 630;

const detectBlackTopOffset = async (inputBuffer) => {
  try {
    const image = sharp(inputBuffer, { failOn: "none" }).rotate();
    const metadata = await image.metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    if (!width || !height) {
      return 0;
    }

    const sampleHeight = Math.min(height, 1400);
    const sampleBuffer = await image
      .extract({ left: 0, top: 0, width, height: sampleHeight })
      .raw()
      .toBuffer();

    const channels = 3;
    const stepX = Math.max(1, Math.floor(width / 80));
    const rowThreshold = Math.max(2, Math.floor(width / stepX) * 0.08);
    const luminanceThreshold = 14;

    for (let y = 0; y < sampleHeight; y += 1) {
      let brightSamples = 0;
      for (let x = 0; x < width; x += stepX) {
        const index = (y * width + x) * channels;
        const r = sampleBuffer[index];
        const g = sampleBuffer[index + 1];
        const b = sampleBuffer[index + 2];
        if (r > luminanceThreshold || g > luminanceThreshold || b > luminanceThreshold) {
          brightSamples += 1;
        }
      }

      if (brightSamples >= rowThreshold) {
        return y;
      }
    }

    return 0;
  } catch (error) {
    console.error("black band detection failed", {
      message: error?.message || String(error),
      name: error?.name || null,
    });
    return 0;
  }
};

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
      const source = sharp(rawImageBuffer, { failOn: "none" }).rotate();
      const sourceMeta = await source.metadata();
      const sourceWidth = sourceMeta.width || SHARE_WIDTH;
      const sourceHeight = sourceMeta.height || SHARE_HEIGHT;
      const topOffset = await detectBlackTopOffset(rawImageBuffer);
      const effectiveTopOffset = topOffset > 24 ? Math.min(topOffset, Math.max(0, sourceHeight - 1)) : 0;
      const cropHeight = Math.max(1, sourceHeight - effectiveTopOffset);

      let normalized = source;
      if (effectiveTopOffset > 0 && sourceWidth > 0 && cropHeight > 0) {
        normalized = source.extract({
          left: 0,
          top: effectiveTopOffset,
          width: sourceWidth,
          height: cropHeight,
        });
      }

      imageBuffer = await normalized
        .resize(SHARE_WIDTH, SHARE_HEIGHT, {
          fit: "cover",
          position: "centre",
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
