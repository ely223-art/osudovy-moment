import { getStore } from "@netlify/blobs";
import sharp from "sharp";

const MAX_IMAGE_SIZE = 20 * 1024 * 1024;
const SHARE_ID_PATTERN = /^[a-zA-Z0-9-]{8,120}$/;
const SHARE_WIDTH = 1200;
const SHARE_HEIGHT = 630;

const buildTemplateShareImage = async ({ title = "Osudovy moment", place = "", symbol = "", shareUrl = "" } = {}) => {
  const safeTitle = String(title || "Osudovy moment")
    .replace(/[&<>"']/g, "")
    .slice(0, 80) || "Osudovy moment";
  const safePlace = String(place || "")
    .replace(/[&<>"']/g, "")
    .slice(0, 48);
  const safeSymbol = String(symbol || "")
    .replace(/[&<>"']/g, "")
    .slice(0, 64);
  const safeUrl = String(shareUrl || "")
    .replace(/[&<>"']/g, "")
    .slice(0, 110);

  const svg = `
<svg width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}" viewBox="0 0 ${SHARE_WIDTH} ${SHARE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0b1a2e" />
      <stop offset="100%" stop-color="#081323" />
    </linearGradient>
  </defs>
  <rect width="${SHARE_WIDTH}" height="${SHARE_HEIGHT}" fill="url(#bg)" />
  <rect x="34" y="34" width="690" height="562" rx="24" fill="#10233a" stroke="rgba(255,234,197,0.18)" />
  <circle cx="378" cy="315" r="74" fill="rgba(255,214,120,0.35)" />
  <circle cx="378" cy="315" r="11" fill="#ffd777" />
  <rect x="758" y="74" width="408" height="482" rx="18" fill="rgba(255,255,255,0.04)" stroke="rgba(255,234,197,0.2)" />
  <text x="782" y="156" fill="#f7efe2" font-size="60" font-weight="600" font-family="Georgia, serif">Osudovy moment</text>
  <text x="782" y="224" fill="#f7efe2" font-size="60" font-weight="600" font-family="Georgia, serif">prave zazaril</text>
  <text x="782" y="278" fill="rgba(247,239,226,0.76)" font-size="26" font-weight="400" font-family="Arial, sans-serif">${safePlace}</text>
  <text x="782" y="336" fill="rgba(247,239,226,0.72)" font-size="19" font-weight="700" font-family="Arial, sans-serif">SYMBOL</text>
  <text x="782" y="364" fill="rgba(247,239,226,0.95)" font-size="30" font-weight="500" font-family="Arial, sans-serif">${safeSymbol}</text>
  <text x="782" y="412" fill="rgba(247,239,226,0.72)" font-size="19" font-weight="700" font-family="Arial, sans-serif">NAZEV</text>
  <text x="782" y="444" fill="rgba(247,239,226,0.95)" font-size="34" font-weight="500" font-family="Arial, sans-serif">${safeTitle}</text>
  <text x="782" y="494" fill="rgba(247,239,226,0.72)" font-size="19" font-weight="700" font-family="Arial, sans-serif">WEB</text>
  <text x="782" y="524" fill="rgba(247,239,226,0.90)" font-size="20" font-weight="400" font-family="Arial, sans-serif">${safeUrl || "osudovymoment.cz"}</text>
</svg>`;

  return sharp(Buffer.from(svg)).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
};

const detectBlackTopOffset = async (inputBuffer) => {
  try {
    const image = sharp(inputBuffer, { failOn: "none" }).rotate();
    const metadata = await image.metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;
    const channels = metadata.channels || 3;

    if (!width || !height || channels < 3) {
      return 0;
    }

    const sampleHeight = Math.min(height, 1400);
    const sampleBuffer = await image
      .extract({ left: 0, top: 0, width, height: sampleHeight })
      .raw()
      .toBuffer();

    const stepX = Math.max(1, Math.floor(width / 120));
    const sampleCount = Math.max(1, Math.floor(width / stepX));
    const rowThreshold = Math.max(3, Math.floor(sampleCount * 0.35));
    const luminanceThreshold = 20;

    for (let y = 0; y < sampleHeight; y += 1) {
      let brightSamples = 0;
      for (let x = 0; x < width; x += stepX) {
        const index = (y * width + x) * channels;
        const r = sampleBuffer[index];
        const g = sampleBuffer[index + 1];
        const b = sampleBuffer[index + 2];
        const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (luminance > luminanceThreshold) {
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
    const titleHeader = request.headers.get("x-share-title") || "Osudovy moment";
    const title = decodeURIComponent(titleHeader).slice(0, 120);
    const placeHeader = request.headers.get("x-share-place") || "";
    const place = decodeURIComponent(placeHeader).slice(0, 120);
    const symbolHeader = request.headers.get("x-share-symbol") || "";
    const symbol = decodeURIComponent(symbolHeader).slice(0, 120);
    const shareUrlHeader = request.headers.get("x-share-url") || "";
    const shareUrl = decodeURIComponent(shareUrlHeader).slice(0, 260);
    const renderMode = (request.headers.get("x-share-render") || "").toLowerCase();

    const requestedShareIdHeader = request.headers.get("x-share-id") || "";
    const requestedShareId = decodeURIComponent(requestedShareIdHeader).trim();
    const id = SHARE_ID_PATTERN.test(requestedShareId) ? requestedShareId : crypto.randomUUID();
    const url = new URL(request.url);
    const origin = url.origin;
    const resolvedShareUrl = shareUrl || `${origin}/s/${encodeURIComponent(id)}`;

    const contentType = request.headers.get("content-type") || "";
    let imageBuffer;

    if (renderMode === "template") {
      imageBuffer = await buildTemplateShareImage({
        title,
        place,
        symbol,
        shareUrl: resolvedShareUrl,
      });
    } else {
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

      imageBuffer = rawImageBuffer;
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

        // Validate final encoded JPEG to avoid saving corrupted data.
        await sharp(imageBuffer).metadata();
      } catch (normalizeError) {
        console.error("share image normalization failed, trying basic resize fallback", {
          message: normalizeError?.message || String(normalizeError),
          name: normalizeError?.name || null,
        });

        try {
          imageBuffer = await sharp(rawImageBuffer, { failOn: "none" })
            .rotate()
            .resize(SHARE_WIDTH, SHARE_HEIGHT, {
              fit: "cover",
              position: "south",
              withoutEnlargement: false,
            })
            .jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: "4:4:4" })
            .toBuffer();

          await sharp(imageBuffer).metadata();
        } catch (fallbackError) {
          console.error("basic resize fallback failed, using template image", {
            message: fallbackError?.message || String(fallbackError),
            name: fallbackError?.name || null,
          });
          imageBuffer = await buildTemplateShareImage({
            title,
            place,
            symbol,
            shareUrl: resolvedShareUrl,
          });
        }
      }
    }

    const store = getStore({ name: "moment-share-images" });

    await store.set(`${id}.jpg`, imageBuffer, {
      metadata: {
        createdAt: new Date().toISOString(),
        title,
      },
    });

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
