export const buildServerDownloadUrl = (imageUrl, filename) => {
  if (!imageUrl) {
    return "";
  }

  try {
    const parsedUrl = new URL(imageUrl, "https://osudovymoment.cz");
    const imageId = parsedUrl.searchParams.get("id") || parsedUrl.pathname.match(/\/i\/([^/.]+)\.jpg$/i)?.[1] || "";

    if (imageId) {
      const directFunctionUrl = new URL("/.netlify/functions/share-image", parsedUrl.origin);
      directFunctionUrl.searchParams.set("id", imageId);
      directFunctionUrl.searchParams.set("download", "1");
      directFunctionUrl.searchParams.set("filename", filename || "osudovy-moment.jpg");
      return directFunctionUrl.toString();
    }

    const fallbackUrl = new URL(imageUrl, parsedUrl.origin);
    fallbackUrl.searchParams.set("download", "1");
    fallbackUrl.searchParams.set("filename", filename || "osudovy-moment.jpg");
    return fallbackUrl.toString();
  } catch {
    return "";
  }
};