import type { components } from '@shopnest/api-client';

import type {
  CartResponse,
  CategoryResponse,
  OrderResponse,
  ProductListResponse,
  ProductResponse,
} from './api-types';

type Schemas = components['schemas'];

const SERVER_API_URL =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

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
    const errorBody = (await response.json().catch(() => ({}))) as {
      message?: string;
      errorCode?: string;
    };
    throw new ApiError(
      response.status,
      errorBody.message ?? response.statusText,
      errorBody.errorCode,
    );
  }

  if (response.status === 204) return undefined as unknown as T;

  const json = (await response.json()) as { data: T };
  return json.data;
}

export const api = {
  // ── Auth ───────────────────────────────────────────────────────────────────
  // Request bodies and the auth response shape below are the generated
  // OpenAPI types from `@shopnest/api-client` — real types sourced from the
  // committed, CI-verified spec instead of hand-typed duplicates.

  register: (body: Schemas['RegisterDto']) =>
    request<Schemas['AuthResponseDto']>('/auth/register', { method: 'POST', body }),

  login: (body: Schemas['LoginDto']) =>
    request<Schemas['AuthResponseDto']>('/auth/login', { method: 'POST', body }),

  refresh: (cookies: string) =>
    request<Schemas['AuthResponseDto']>('/auth/refresh', {
      method: 'POST',
      cookies,
      isServer: true,
    }),

  logout: (cookies?: string) => request<void>('/auth/logout', { method: 'POST', cookies }),

  me: (cookies?: string) => request<Schemas['AuthResponseDto']>('/auth/me', { cookies }),

  // ── Catalog ────────────────────────────────────────────────────────────────
  // Response shapes come from `./api-types` (see that file's header comment
  // for why — the API doesn't yet describe these response bodies in its
  // OpenAPI spec, so the generated client has nothing to type them with).

  listCategories: (cookies?: string) => request<CategoryResponse[]>('/categories', { cookies }),

  listProducts: (params: Record<string, string | number>, cookies?: string) => {
    const qs = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ).toString();
    return request<ProductListResponse>(`/products?${qs}`, { cookies });
  },

  getProduct: (slug: string, cookies?: string) =>
    request<ProductResponse>(`/products/${slug}`, { cookies }),

  reverseGeocode: (latitude: number, longitude: number) => {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
    });
    return request<{ label: string; details: string }>(`/location/reverse?${params}`);
  },

  searchLocations: (query: string) =>
    request<Array<{ id: string; label: string; details: string }>>(
      `/location/suggestions?${new URLSearchParams({ query })}`,
    ),

  // ── Cart ───────────────────────────────────────────────────────────────────

  getCart: (cookies?: string) => request<CartResponse>('/cart', { cookies }),

  upsertCartItem: (body: Schemas['UpsertCartItemDto'], cookies?: string) =>
    request<CartItemFromUpsert>('/cart/items', { method: 'PUT', body, cookies }),

  removeCartItem: (productId: string, cookies?: string) =>
    request<void>(`/cart/items/${productId}`, { method: 'DELETE', cookies }),

  clearCart: (cookies?: string) => request<void>('/cart', { method: 'DELETE', cookies }),

  // ── Orders ─────────────────────────────────────────────────────────────────

  checkout: (body: Schemas['CheckoutDto'], cookies?: string) =>
    request<OrderResponse>('/orders/checkout', { method: 'POST', body, cookies }),

  listOrders: (cookies?: string) => request<OrderResponse[]>('/orders', { cookies }),

  getOrder: (id: string, cookies?: string) => request<OrderResponse>(`/orders/${id}`, { cookies }),

  cancelOrder: (id: string, cookies?: string) =>
    request<OrderResponse>(`/orders/${id}/cancel`, { method: 'PATCH', cookies }),

  // ── Admin – Orders ─────────────────────────────────────────────────────────

  adminListOrders: (status?: string, cookies?: string) => {
    const qs = status ? `?status=${status}` : '';
    return request<OrderResponse[]>(`/admin/orders${qs}`, { cookies });
  },

  adminGetOrder: (id: string, cookies?: string) =>
    request<OrderResponse>(`/admin/orders/${id}`, { cookies }),

  adminUpdateOrderStatus: (id: string, body: Schemas['UpdateOrderStatusDto'], cookies?: string) =>
    request<OrderResponse>(`/admin/orders/${id}/status`, { method: 'PATCH', body, cookies }),

  // ── Admin – Products ───────────────────────────────────────────────────────

  adminListProducts: (cookies?: string) => request<ProductResponse[]>('/admin/products', { cookies }),

  adminCreateProduct: (body: Schemas['CreateProductDto'], cookies?: string) =>
    request<ProductResponse>('/products', { method: 'POST', body, cookies }),

  adminUpdateProduct: (id: string, body: Schemas['UpdateProductDto'], cookies?: string) =>
    request<ProductResponse>(`/products/${id}`, { method: 'PATCH', body, cookies }),

  adminArchiveProduct: (id: string, cookies?: string) =>
    request<void>(`/products/${id}`, { method: 'DELETE', cookies }),

  // ── Admin – Categories ─────────────────────────────────────────────────────

  adminCreateCategory: (body: Schemas['CreateCategoryDto'], cookies?: string) =>
    request<CategoryResponse>('/categories', { method: 'POST', body, cookies }),

  adminUpdateCategory: (id: string, body: { name?: string; slug?: string }, cookies?: string) =>
    request<CategoryResponse>(`/categories/${id}`, { method: 'PATCH', body, cookies }),

  adminDeleteCategory: (id: string, cookies?: string) =>
    request<void>(`/categories/${id}`, { method: 'DELETE', cookies }),
};

// `PUT /cart/items` returns the created/updated cart item with only a partial
// product projection (`id, name, slug, priceCents`) — narrower than the full
// `CartItemResponse.product` shape returned by `GET /cart`, per
// `cart.service.ts`'s `upsertItem()`. Typed separately so callers aren't led
// to expect fields (`imageUrl`, `stockQuantity`, `isActive`) that this
// specific response doesn't actually carry.
interface CartItemFromUpsert {
  id: string;
  cartId: string;
  productId: string;
  quantity: number;
  addedAt: string;
  updatedAt: string;
  product: { id: string; name: string; slug: string; priceCents: number };
}
