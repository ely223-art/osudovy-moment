import { getStore } from "@netlify/blobs";

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

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
    if (!contentType.toLowerCase().includes("image/jpeg")) {
      return responseWithJson(415, { error: "Only image/jpeg is supported" });
    }

    const imageBuffer = Buffer.from(await request.arrayBuffer());
    if (!imageBuffer.length) {
      return responseWithJson(400, { error: "Image payload is empty" });
    }

    if (imageBuffer.length > MAX_IMAGE_SIZE) {
      return responseWithJson(413, { error: "Image payload is too large" });
    }

    const titleHeader = request.headers.get("x-share-title") || "Osudovy moment";
    const title = decodeURIComponent(titleHeader).slice(0, 120);

    const id = crypto.randomUUID();
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
      shareUrl: `${origin}/.netlify/functions/share-page?id=${encodeURIComponent(id)}`,
      imageUrl: `${origin}/.netlify/functions/share-image?id=${encodeURIComponent(id)}`,
    });
  } catch (error) {
    console.error("create-share-link error", error);
    return responseWithJson(500, { error: "Failed to create share link" });
  }
};
