import { getStore } from "@netlify/blobs";

export default async (request) => {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

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

    return new Response(image, {
      status: 200,
      headers: {
        "content-type": "image/jpeg",
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("share-image error", error);
    return new Response("Internal error", { status: 500 });
  }
};
