const toRequestUrl = (request) => {
  try {
    return new URL(request.url);
  } catch {
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "osudovymoment.cz";
    const proto = request.headers.get("x-forwarded-proto") || "https";
    return new URL(request.url, `${proto}://${host}`);
  }
};

const extractShareId = (requestUrl) => {
  const url = new URL(requestUrl, "https://osudovymoment.cz");
  const queryId = url.searchParams.get("id");
  if (queryId) {
    return queryId;
  }

  return url.pathname.match(/\/(?:s|i)\/([^/?#]+?)(?:\.jpg)?$/i)?.[1] || "";
};

const escapeHtml = (value = "") =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export default async (request) => {
  try {
    const requestUrl = toRequestUrl(request);
    const id = extractShareId(requestUrl.toString());

    if (!id) {
      return new Response("Missing id", { status: 400 });
    }

    const safeId = id.replace(/[^a-zA-Z0-9-]/g, "");
    if (!safeId) {
      return new Response("Invalid id", { status: 400 });
    }

    const origin = requestUrl.origin;
    const sharePageUrl = `${origin}/s/${encodeURIComponent(safeId)}`;
    const imageUrl = `${origin}/.netlify/functions/share-image?id=${encodeURIComponent(safeId)}`;
    const appLandingUrl = `${origin}/`;
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
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="noindex,nofollow" />
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        background: #081221;
        color: #f6efe2;
      }
      .card {
        width: min(100%, 520px);
        border: 1px solid rgba(255, 234, 197, 0.25);
        border-radius: 16px;
        padding: 20px;
        background: rgba(255, 255, 255, 0.04);
      }
      a {
        color: #ffe4ae;
        text-decoration: underline;
        word-break: break-word;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <p>Odkaz s náhledem momentu je připraven.</p>
      <p>Pokud se aplikace neotevřela automaticky, pokračujte na: <a href="${escapeHtml(appLandingUrl)}">${escapeHtml(appLandingUrl)}</a></p>
    </div>
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
