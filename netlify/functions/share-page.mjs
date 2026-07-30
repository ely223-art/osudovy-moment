const escapeHtml = (value = "") =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export default async (request) => {
  try {
    const requestUrl = new URL(request.url);
    const id = requestUrl.searchParams.get("id");

    if (!id) {
      return new Response("Missing id", { status: 400 });
    }

    const safeId = id.replace(/[^a-zA-Z0-9-]/g, "");
    if (!safeId) {
      return new Response("Invalid id", { status: 400 });
    }

    const origin = requestUrl.origin;
    const canonicalUrl = "https://osudovymoment.cz";
    const sharePageUrl = `${origin}/s/${encodeURIComponent(safeId)}`;
    const imageUrl = `${origin}/i/${encodeURIComponent(safeId)}.jpg`;
    const title = "Osudovy moment";
    const description = "Osudovy moment vytvoreny v aplikaci osudovymoment.cz";

    const html = `<!doctype html>
<html lang="cs">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Osudovy moment" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(sharePageUrl)}" />
    <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="1500" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
    <meta name="robots" content="noindex,nofollow" />
    <meta http-equiv="refresh" content="1;url=${escapeHtml(canonicalUrl)}" />
  </head>
  <body>
    <p>Presmerovani na <a href="${escapeHtml(canonicalUrl)}">osudovymoment.cz</a>...</p>
  </body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("share-page error", error);
    return new Response("Internal error", { status: 500 });
  }
};
