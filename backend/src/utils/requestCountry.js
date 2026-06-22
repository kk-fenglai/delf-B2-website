// Resolve the visitor's country (ISO 3166-1 alpha-2) from edge-proxy headers.
// Vercel sets x-vercel-ip-country; Cloudflare sets cf-ipcountry. These come
// from the CDN, not the browser, so they're trustworthy for region gating.
function requestCountry(req) {
  const cc =
    req.headers['x-vercel-ip-country'] ||
    req.headers['cf-ipcountry'] ||
    req.headers['x-country-code'] ||
    null;
  return cc ? String(cc).toUpperCase() : null;
}

module.exports = { requestCountry };
