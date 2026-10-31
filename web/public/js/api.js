export class ApiError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
export async function api(method, url, body) {
  let res;
  try {
    res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "You appear to be offline. Check your connection and try again.");
  }
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new ApiError(res.status, data.error || "Something went wrong.", data.code);
  return data;
}
export const get = (u) => api("GET", u);
export const post = (u, b) => api("POST", u, b || {});
export const put = (u, b) => api("PUT", u, b || {});
export const del = (u) => api("DELETE", u);
