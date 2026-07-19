/**
 * Typed API client for server and client components.
 * Server-side calls include Origin header for OriginGuard bypass.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

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

  // Server-to-server calls must set Origin so OriginGuard allows unsafe methods.
  if (isServer && method !== 'GET' && method !== 'HEAD') {
    headers['Origin'] = WEB_URL;
  }

  const response = await fetch(`${API_URL}${path}`, {
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
  // ─── Auth ───────────────────────────────────────────────────────────────
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
    request<void>('/auth/logout', { method: 'POST', cookies, isServer: true }),

  me: (cookies?: string) =>
    request<{ user: { id: string; email: string; role: string } }>('/auth/me', {
      cookies,
      isServer: true,
    }),

  // ─── Catalog ────────────────────────────────────────────────────────────
  listCategories: () => request<unknown[]>('/categories'),

  listProducts: (params: Record<string, string | number>) => {
    const qs = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ).toString();
    return request<{ items: unknown[]; total: number; page: number; limit: number }>(
      `/products?${qs}`,
    );
  },

  getProduct: (slug: string) => request<unknown>(`/products/${slug}`),

  // ─── Cart ────────────────────────────────────────────────────────────────
  getCart: (cookies?: string) =>
    request<unknown>('/cart', { cookies, isServer: true }),

  upsertCartItem: (body: { productId: string; quantity: number }, cookies?: string) =>
    request<unknown>('/cart/items', { method: 'PUT', body, cookies, isServer: true }),

  removeCartItem: (productId: string, cookies?: string) =>
    request<void>(`/cart/items/${productId}`, { method: 'DELETE', cookies, isServer: true }),

  clearCart: (cookies?: string) =>
    request<void>('/cart', { method: 'DELETE', cookies, isServer: true }),

  // ─── Orders ─────────────────────────────────────────────────────────────
  checkout: (body: { idempotencyKey: string }, cookies?: string) =>
    request<unknown>('/orders/checkout', { method: 'POST', body, cookies, isServer: true }),

  listOrders: (cookies?: string) =>
    request<unknown[]>('/orders', { cookies, isServer: true }),

  getOrder: (id: string, cookies?: string) =>
    request<unknown>(`/orders/${id}`, { cookies, isServer: true }),

  cancelOrder: (id: string, cookies?: string) =>
    request<unknown>(`/orders/${id}/cancel`, { method: 'PATCH', cookies, isServer: true }),

  // ─── Admin ──────────────────────────────────────────────────────────────
  adminListOrders: (status?: string, cookies?: string) => {
    const qs = status ? `?status=${status}` : '';
    return request<unknown[]>(`/admin/orders${qs}`, { cookies, isServer: true });
  },

  adminUpdateOrderStatus: (id: string, body: { status: string }, cookies?: string) =>
    request<unknown>(`/admin/orders/${id}/status`, {
      method: 'PATCH',
      body,
      cookies,
      isServer: true,
    }),

  adminCreateProduct: (body: unknown, cookies?: string) =>
    request<unknown>('/products', { method: 'POST', body, cookies, isServer: true }),

  adminUpdateProduct: (id: string, body: unknown, cookies?: string) =>
    request<unknown>(`/products/${id}`, { method: 'PATCH', body, cookies, isServer: true }),

  adminDeleteProduct: (id: string, cookies?: string) =>
    request<void>(`/products/${id}`, { method: 'DELETE', cookies, isServer: true }),

  adminCreateCategory: (body: { name: string; slug: string }, cookies?: string) =>
    request<unknown>('/categories', { method: 'POST', body, cookies, isServer: true }),
};
