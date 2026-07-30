export const extractShareId = (requestUrl) => {
  const url = new URL(requestUrl);
  const queryId = url.searchParams.get("id");

  if (queryId) {
    return queryId;
  }

  const pathId = url.pathname.match(/\/(?:s|i)\/([^/?#]+?)(?:\.jpg)?$/i)?.[1];
  return pathId || "";
};