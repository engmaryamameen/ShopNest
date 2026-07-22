const SERVER_API_URL =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';
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
  const { method = 'GET', body, cookies, isServer = typeof window === 'undefined' } = opts;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (cookies) {
    headers['Cookie'] = cookies;
  }

  if (isServer && method !== 'GET' && method !== 'HEAD') {
    headers['Origin'] = WEB_URL;
  }

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
    request<void>('/auth/logout', { method: 'POST', cookies }),

  me: (cookies?: string) =>
    request<{ user: { id: string; email: string; role: string } }>('/auth/me', { cookies }),

  // ── Catalog ────────────────────────────────────────────────────────────────

  listCategories: (cookies?: string) =>
    request<unknown[]>('/categories', { cookies }),

  listProducts: (params: Record<string, string | number>, cookies?: string) => {
    const qs = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ).toString();
    return request<{ items: unknown[]; total: number; page: number; limit: number }>(
      `/products?${qs}`,
      { cookies },
    );
  },

  getProduct: (slug: string, cookies?: string) =>
    request<unknown>(`/products/${slug}`, { cookies }),

  // ── Cart ───────────────────────────────────────────────────────────────────

  getCart: (cookies?: string) =>
    request<unknown>('/cart', { cookies }),

  upsertCartItem: (body: { productId: string; quantity: number }, cookies?: string) =>
    request<unknown>('/cart/items', { method: 'PUT', body, cookies }),

  removeCartItem: (productId: string, cookies?: string) =>
    request<void>(`/cart/items/${productId}`, { method: 'DELETE', cookies }),

  clearCart: (cookies?: string) =>
    request<void>('/cart', { method: 'DELETE', cookies }),

  // ── Orders ─────────────────────────────────────────────────────────────────

  checkout: (body: { idempotencyKey: string }, cookies?: string) =>
    request<unknown>('/orders/checkout', { method: 'POST', body, cookies }),

  listOrders: (cookies?: string) =>
    request<unknown[]>('/orders', { cookies }),

  getOrder: (id: string, cookies?: string) =>
    request<unknown>(`/orders/${id}`, { cookies }),

  cancelOrder: (id: string, cookies?: string) =>
    request<unknown>(`/orders/${id}/cancel`, { method: 'PATCH', cookies }),

  // ── Admin – Orders ─────────────────────────────────────────────────────────

  adminListOrders: (status?: string, cookies?: string) => {
    const qs = status ? `?status=${status}` : '';
    return request<unknown[]>(`/admin/orders${qs}`, { cookies });
  },

  adminGetOrder: (id: string, cookies?: string) =>
    request<unknown>(`/admin/orders/${id}`, { cookies }),

  adminUpdateOrderStatus: (id: string, body: { status: string }, cookies?: string) =>
    request<unknown>(`/admin/orders/${id}/status`, { method: 'PATCH', body, cookies }),

  // ── Admin – Products ───────────────────────────────────────────────────────

  adminListProducts: (cookies?: string) =>
    request<unknown[]>('/admin/products', { cookies }),

  adminCreateProduct: (body: unknown, cookies?: string) =>
    request<unknown>('/products', { method: 'POST', body, cookies }),

  adminUpdateProduct: (id: string, body: unknown, cookies?: string) =>
    request<unknown>(`/products/${id}`, { method: 'PATCH', body, cookies }),

  adminArchiveProduct: (id: string, cookies?: string) =>
    request<void>(`/products/${id}`, { method: 'DELETE', cookies }),

  // ── Admin – Categories ─────────────────────────────────────────────────────

  adminCreateCategory: (body: { name: string; slug?: string }, cookies?: string) =>
    request<unknown>('/categories', { method: 'POST', body, cookies }),

  adminUpdateCategory: (id: string, body: { name?: string; slug?: string }, cookies?: string) =>
    request<unknown>(`/categories/${id}`, { method: 'PATCH', body, cookies }),

  adminDeleteCategory: (id: string, cookies?: string) =>
    request<void>(`/categories/${id}`, { method: 'DELETE', cookies }),
};
