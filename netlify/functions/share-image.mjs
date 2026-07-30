import { getStore } from "@netlify/blobs";
import { extractShareId } from "../../src/utils/shareRequest.js";

export default async (request) => {
  try {
    const url = new URL(request.url);
    const id = extractShareId(request.url);
    const shouldDownload = url.searchParams.get("download") === "1";
    const requestedFilename = url.searchParams.get("filename") || "osudovy-moment.jpg";

    if (!id) {
      return new Response("Missing id", { status: 400 });
    }

    const safeId = id.replace(/[^a-zA-Z0-9-]/g, "");
    if (!safeId) {
      return new Response("Invalid id", { status: 400 });
    }

    const store = getStore({ name: "moment-share-images" });
    const image = await store.get(`${safeId}.jpg`, { type: "arrayBuffer" });

    if (!image) {
      return new Response("Not found", { status: 404 });
    }

    const safeFilename = requestedFilename
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/(^-|-$)/g, "") || "osudovy-moment.jpg";

    return new Response(image, {
      status: 200,
      headers: {
        "content-type": "image/jpeg",
        "cache-control": shouldDownload
          ? "no-store, no-transform"
          : "public, max-age=31536000, immutable",
        "content-disposition": shouldDownload
          ? `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`
          : "inline",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error("share-image error", error);
    return new Response("Internal error", { status: 500 });
  }
};
