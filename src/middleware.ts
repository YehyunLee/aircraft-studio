import type { NextRequest } from "next/server";

import { auth0 } from "./lib/auth0";

export async function middleware(request: NextRequest) {
  return await auth0.middleware(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - public assets and metadata files (favicon.ico, sitemap.xml, robots.txt)
     * - direct file requests like model-preview.html
     */
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|model-preview\\.html).*)"
  ]
};