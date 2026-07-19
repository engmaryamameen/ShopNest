import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { validateReturnTo } from './lib/validate-return-to';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
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

  // If we have a valid-looking access token, proceed
  if (accessToken) {
    return NextResponse.next();
  }

  // No access token: attempt proactive refresh before failing
  if (refreshToken) {
    try {
      const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          Cookie: request.headers.get('cookie') ?? '',
          Origin: WEB_URL,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (refreshRes.ok || refreshRes.status === 409) {
        // 409 = recently-rotated (another tab already refreshed)
        // Either way, redirect to same URL so browser sends new cookies
        const response = NextResponse.redirect(request.nextUrl, { status: 307 });
        // Copy Set-Cookie headers from refresh response
        const setCookies = refreshRes.headers.getSetCookie?.() ?? [];
        for (const cookie of setCookies) {
          response.headers.append('Set-Cookie', cookie);
        }
        return response;
      }
    } catch {
      // Refresh call failed — fall through to login redirect
    }
  }

  const returnTo = validateReturnTo(pathname + request.nextUrl.search);
  const loginUrl = new URL(`/login?returnTo=${encodeURIComponent(returnTo)}`, request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
