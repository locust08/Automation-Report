const USER_PAGE_PATHS = ["/dashboard", "/overall", "/preview", "/advanced"];
export function isUserRoleRequestAllowed(pathname: string, method = "GET") {
  if (USER_PAGE_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return true;
  if (pathname === "/api/auth/session" && method === "GET") return true;
  if (pathname === "/api/auth/logout" && method === "POST") return true;
  if (pathname === "/api/notion/accounts/search" && method === "GET") return true;
  if (pathname === "/api/reporting/advanced" && (method === "GET" || method === "POST")) return true;
  if (/^\/api\/reporting(?:\/preview)?$/.test(pathname) && method === "GET") return true;
  if (/^\/api\/reports\/[^/]+\/(?:summary|campaign-performance|tables)$/.test(pathname) && method === "GET") return true;
  if (/^\/api\/advanced\/[^/]+\/(?:final-url-performance|auction-insight)$/.test(pathname) && method === "GET") return true;
  if (/^\/api\/accounts\/[^/]+\/(?:campaigns|structure)$/.test(pathname) && method === "GET") return true;
  if (/^\/api\/campaigns\/[^/]+\/ad-groups$/.test(pathname) && method === "GET") return true;
  if (/^\/api\/ad-groups\/[^/]+\/ads$/.test(pathname) && method === "GET") return true;
  return /^\/api\/ads\/[^/]+\/(?:preview|assets)$/.test(pathname) && method === "GET";
}
