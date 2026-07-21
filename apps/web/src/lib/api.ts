/**
 * Typed API client for server and client components.
 *
 * Server-side calls (isServer: true):
 *   - Use INTERNAL_API_URL directly (bypasses the /api rewrite proxy).
 *   - Forward the caller's Cookie header.
 *   - Set Origin header so OriginGuard permits unsafe methods.
 *
 * Browser-side calls (isServer: false, the default):
 *   - Use a relative /api path (same-origin, handled by Next.js rewrites).
 *   - The browser sends cookies automatically via credentials: 'include'.
 *   - No Origin header is needed — the browser sets it correctly.
 */

// Server-to-server: may differ in Docker (http://api:3001) vs. local (http://localhost:3001).
const SERVER_API_URL =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001';

// WEB_URL must match the Origin the OriginGuard expects.
const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

// Browser calls go through the /api rewrite proxy (same-origin).
const CLIENT_API_BASE = '/api';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly errorCode?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  cookies?: string;
  isServer?: boolean;
};

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, cookies, isServer = false } = opts;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (cookies) {
    headers['Cookie'] = cookies;
  }

  // Server-to-server calls must include Origin so OriginGuard allows unsafe methods.
  if (isServer && method !== 'GET' && method !== 'HEAD') {
    headers['Origin'] = WEB_URL;
  }

  // Server-side: call NestJS directly. Browser-side: relative path through /api proxy.
  const base = isServer ? SERVER_API_URL : CLIENT_API_BASE;

  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({})) as { message?: string; errorCode?: string };
    throw new ApiError(response.status, errorBody.message ?? response.statusText, errorBody.errorCode);
  }

  if (response.status === 204) return undefined as unknown as T;

  const json = await response.json() as { data: T };
  return json.data;
}

export const api = {
  // ── Auth ───────────────────────────────────────────────────────────────────

  register: (body: { email: string; password: string }) =>
    request<{ user: { id: string; email: string; role: string } }>('/auth/register', {
      method: 'POST',
      body,
    }),

  login: (body: { email: string; password: string }) =>
    request<{ user: { id: string; email: string; role: string } }>('/auth/login', {
      method: 'POST',
      body,
    }),

  refresh: (cookies: string) =>
    request<{ user: { id: string; email: string; role: string } }>('/auth/refresh', {
      method: 'POST',
      cookies,
      isServer: true,
    }),

  logout: (cookies?: string) =>
    request<void>('/auth/logout', { method: 'POST', cookies, isServer: !!cookies }),

  me: (cookies?: string) =>
    request<{ user: { id: string; email: string; role: string } }>('/auth/me', {
      cookies,
      isServer: !!cookies,
    }),

  // ── Catalog ────────────────────────────────────────────────────────────────

  listCategories: (cookies?: string) =>
    request<unknown[]>('/categories', { cookies, isServer: !!cookies }),

  listProducts: (params: Record<string, string | number>, cookies?: string) => {
    const qs = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ).toString();
    return request<{ items: unknown[]; total: number; page: number; limit: number }>(
      `/products?${qs}`,
      { cookies, isServer: !!cookies },
    );
  },

  getProduct: (slug: string, cookies?: string) =>
    request<unknown>(`/products/${slug}`, { cookies, isServer: !!cookies }),

  // ── Cart ───────────────────────────────────────────────────────────────────

  getCart: (cookies?: string) =>
    request<unknown>('/cart', { cookies, isServer: !!cookies }),

  upsertCartItem: (body: { productId: string; quantity: number }, cookies?: string) =>
    request<unknown>('/cart/items', { method: 'PUT', body, cookies, isServer: !!cookies }),

  removeCartItem: (productId: string, cookies?: string) =>
    request<void>(`/cart/items/${productId}`, { method: 'DELETE', cookies, isServer: !!cookies }),

  clearCart: (cookies?: string) =>
    request<void>('/cart', { method: 'DELETE', cookies, isServer: !!cookies }),

  // ── Orders ─────────────────────────────────────────────────────────────────

  checkout: (body: { idempotencyKey: string }, cookies?: string) =>
    request<unknown>('/orders/checkout', { method: 'POST', body, cookies, isServer: !!cookies }),

  listOrders: (cookies?: string) =>
    request<unknown[]>('/orders', { cookies, isServer: !!cookies }),

  getOrder: (id: string, cookies?: string) =>
    request<unknown>(`/orders/${id}`, { cookies, isServer: !!cookies }),

  cancelOrder: (id: string, cookies?: string) =>
    request<unknown>(`/orders/${id}/cancel`, { method: 'PATCH', cookies, isServer: !!cookies }),

  // ── Admin – Orders ─────────────────────────────────────────────────────────

  adminListOrders: (status?: string, cookies?: string) => {
    const qs = status ? `?status=${status}` : '';
    return request<unknown[]>(`/admin/orders${qs}`, { cookies, isServer: !!cookies });
  },

  adminGetOrder: (id: string, cookies?: string) =>
    request<unknown>(`/admin/orders/${id}`, { cookies, isServer: !!cookies }),

  adminUpdateOrderStatus: (id: string, body: { status: string }, cookies?: string) =>
    request<unknown>(`/admin/orders/${id}/status`, {
      method: 'PATCH',
      body,
      cookies,
      isServer: !!cookies,
    }),

  // ── Admin – Products ───────────────────────────────────────────────────────

  adminCreateProduct: (body: unknown, cookies?: string) =>
    request<unknown>('/products', { method: 'POST', body, cookies, isServer: !!cookies }),

  adminUpdateProduct: (id: string, body: unknown, cookies?: string) =>
    request<unknown>(`/products/${id}`, { method: 'PATCH', body, cookies, isServer: !!cookies }),

  /** Archive a product (soft-delete via isActive = false). Never physically deletes. */
  adminArchiveProduct: (id: string, cookies?: string) =>
    request<void>(`/products/${id}`, { method: 'DELETE', cookies, isServer: !!cookies }),

  // ── Admin – Categories ─────────────────────────────────────────────────────

  adminCreateCategory: (body: { name: string; slug?: string }, cookies?: string) =>
    request<unknown>('/categories', { method: 'POST', body, cookies, isServer: !!cookies }),
};
