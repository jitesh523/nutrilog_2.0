const handler = require("../server");

module.exports = (request, response) => {
  const url = new URL(request.url, `https://${request.headers.host || "localhost"}`);
  const route = request.query?.__route || url.searchParams.get("__route");
  if (typeof route === "string") {
    url.pathname = route === "healthz" ? "/healthz" : `/api/${route}`;
    url.searchParams.delete("__route");
    request.url = url.pathname + url.search;
  }
  return handler(request, response);
};
