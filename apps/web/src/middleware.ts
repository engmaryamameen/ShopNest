import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { validateReturnTo } from './lib/validate-return-to';

// Direct server-to-server URL; bypasses the /api rewrite proxy.
const API_URL =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/shop',
  '/api/',
  '/_next/',
  '/favicon',
  '/login.avif',
  '/login-bg.avif',
  '/login-bg.jpg',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) return NextResponse.next();

  const accessToken = request.cookies.get('access_token')?.value;
  const refreshToken = request.cookies.get('refresh_token')?.value;

  // If we have a valid-looking access token, proceed.
  if (accessToken) {
    return NextResponse.next();
  }

  // No access token: attempt a proactive refresh before redirecting to login.
  if (refreshToken) {
    try {
      const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: request.headers.get('cookie') ?? '',
          // OriginGuard requires Origin on non-GET server→server calls.
          Origin: WEB_URL,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (refreshRes.ok) {
        // Refresh succeeded: redirect to the same URL so the browser re-sends
        // with the new cookies that are attached to the redirect response.
        const response = NextResponse.redirect(request.nextUrl, { status: 307 });
        const setCookies = refreshRes.headers.getSetCookie?.() ?? [];
        for (const cookie of setCookies) {
          response.headers.append('Set-Cookie', cookie);
        }
        return response;
      }

      if (refreshRes.status === 409) {
        // 409 CONFLICT = another tab/request already rotated this token within
        // the grace window.  The new access token was already set in the browser
        // by the winning request.  Do NOT redirect — that would loop because this
        // response carries no new cookies.  Instead, proceed: the browser already
        // holds a valid access_token cookie from the winning rotation.
        return NextResponse.next();
      }

      // Any other non-OK status (401, 403, 500 …) → fall through to login redirect.
    } catch {
      // Network error calling the API — fall through to login redirect.
    }
  }

  const returnTo = validateReturnTo(pathname + request.nextUrl.search);
  const loginUrl = new URL(`/login?returnTo=${encodeURIComponent(returnTo)}`, request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
