import type { components } from '@shopnest/api-client';

import type {
  AddressInput,
  AddressResponse,
  AdminAccountResponse,
  AdminDashboardResponse,
  AuditLogListResponse,
  BrandResponse,
  CartResponse,
  CatalogImportRunResponse,
  CategoryResponse,
  ImportPreviewResponse,
  ImportScopeInput,
  InventoryAdjustmentResponse,
  OrderResponse,
  ProductCardResponse,
  ProductDetailResponse,
  ProductListResponse,
  ReviewEligibilityResponse,
  ReviewListResponse,
  ReviewResponse,
  UserSummary,
  VendorAnalyticsResponse,
  VendorFulfilmentResponse,
  VendorOfferResponse,
  VendorResponse,
  VendorStaffListResponse,
  WishlistItemResponse,
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

  logoutAll: (cookies?: string) => request<void>('/auth/logout-all', { method: 'POST', cookies }),

  me: (cookies?: string) => request<Schemas['AuthResponseDto']>('/auth/me', { cookies }),

  verifyEmail: (body: Schemas['VerifyEmailDto']) =>
    request<{ status: 'verified' | 'already-verified' }>('/auth/verify-email', { method: 'POST', body }),

  resendVerification: (body: Schemas['ResendVerificationDto']) =>
    request<void>('/auth/resend-verification', { method: 'POST', body }),

  forgotPassword: (body: Schemas['ForgotPasswordDto']) =>
    request<void>('/auth/forgot-password', { method: 'POST', body }),

  resetPassword: (body: Schemas['ResetPasswordDto']) =>
    request<void>('/auth/reset-password', { method: 'POST', body }),

  listSessions: (cookies?: string) => request<Schemas['SessionDto'][]>('/auth/sessions', { cookies }),

  revokeSession: (id: string, cookies?: string) =>
    request<void>(`/auth/sessions/${id}`, { method: 'DELETE', cookies }),

  // ── Catalog ────────────────────────────────────────────────────────────────
  // Response shapes come from `./api-types` (see that file's header comment
  // for why — the API doesn't yet describe these response bodies in its
  // OpenAPI spec, so the generated client has nothing to type them with).

  listCategories: (cookies?: string) => request<CategoryResponse[]>('/categories', { cookies }),

  listBrands: (cookies?: string) => request<BrandResponse[]>('/brands', { cookies }),

  listProducts: (params: Record<string, string | number>, cookies?: string) => {
    const qs = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ).toString();
    return request<ProductListResponse>(`/products?${qs}`, { cookies });
  },

  getProduct: (slug: string, cookies?: string) =>
    request<ProductDetailResponse>(`/products/${slug}`, { cookies }),

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

  removeCartItem: (vendorOfferId: string, cookies?: string) =>
    request<void>(`/cart/items/${vendorOfferId}`, { method: 'DELETE', cookies }),

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

  adminListProducts: (cookies?: string) => request<ProductCardResponse[]>('/admin/products', { cookies }),

  adminCreateProduct: (body: Schemas['CreateProductDto'], cookies?: string) =>
    request<ProductDetailResponse>('/products', { method: 'POST', body, cookies }),

  adminUpdateProduct: (id: string, body: Schemas['UpdateProductDto'], cookies?: string) =>
    request<ProductDetailResponse>(`/products/${id}`, { method: 'PATCH', body, cookies }),

  adminArchiveProduct: (id: string, cookies?: string) =>
    request<void>(`/products/${id}`, { method: 'DELETE', cookies }),

  // ── Admin – Categories ─────────────────────────────────────────────────────

  adminCreateCategory: (body: Schemas['CreateCategoryDto'], cookies?: string) =>
    request<CategoryResponse>('/categories', { method: 'POST', body, cookies }),

  adminUpdateCategory: (
    id: string,
    body: { name?: string; slug?: string; parentId?: string | null; position?: number; isActive?: boolean; imageUrl?: string },
    cookies?: string,
  ) => request<CategoryResponse>(`/categories/${id}`, { method: 'PATCH', body, cookies }),

  adminDeleteCategory: (id: string, cookies?: string) =>
    request<void>(`/categories/${id}`, { method: 'DELETE', cookies }),

  // ── Admin – Users ──────────────────────────────────────────────────────────

  adminListUsers: (page = 1, limit = 20, cookies?: string) =>
    request<{ items: UserSummary[]; total: number; page: number; limit: number }>(
      `/admin/users?page=${page}&limit=${limit}`,
      { cookies },
    ),

  adminUpdateUserStatus: (id: string, body: Schemas['UpdateUserStatusDto'], cookies?: string) =>
    request<{ id: string; email: string; status: string }>(`/admin/users/${id}/status`, {
      method: 'PATCH',
      body,
      cookies,
    }),

  // ── Vendor ─────────────────────────────────────────────────────────────────

  vendorApply: (body: { name: string; description?: string; logoUrl?: string; contactEmail: string }, cookies?: string) =>
    request<VendorResponse>('/vendor/apply', { method: 'POST', body, cookies }),

  vendorMe: (cookies?: string) => request<VendorResponse>('/vendor/me', { cookies }),

  vendorUpdateProfile: (
    body: { name?: string; description?: string; logoUrl?: string; contactEmail?: string },
    cookies?: string,
  ) => request<VendorResponse>('/vendor/me', { method: 'PATCH', body, cookies }),

  vendorAnalytics: (cookies?: string) => request<VendorAnalyticsResponse>('/vendor/analytics', { cookies }),

  vendorSearchProducts: (q: string, cookies?: string) =>
    request<Array<{ id: string; name: string; slug: string; category: { name: string; slug: string } | null }>>(
      `/vendor/offers/search-products?q=${encodeURIComponent(q)}`,
      { cookies },
    ),

  vendorListOffers: (cookies?: string) => request<VendorOfferResponse[]>('/vendor/offers', { cookies }),

  vendorCreateOffer: (
    body: {
      productId: string;
      variantId?: string;
      vendorSku: string;
      condition?: string;
      priceCents: number;
      compareAtPriceCents?: number;
      stockQuantity: number;
    },
    cookies?: string,
  ) => request<VendorOfferResponse>('/vendor/offers', { method: 'POST', body, cookies }),

  vendorUpdateOffer: (
    id: string,
    body: { vendorSku?: string; condition?: string; priceCents?: number; compareAtPriceCents?: number; status?: string },
    cookies?: string,
  ) => request<VendorOfferResponse>(`/vendor/offers/${id}`, { method: 'PATCH', body, cookies }),

  vendorAdjustInventory: (
    id: string,
    body: { delta: number; reason: 'RESTOCK' | 'CORRECTION'; reference?: string },
    cookies?: string,
  ) => request<VendorOfferResponse>(`/vendor/offers/${id}/inventory`, { method: 'PATCH', body, cookies }),

  vendorInventoryHistory: (id: string, cookies?: string) =>
    request<InventoryAdjustmentResponse[]>(`/vendor/offers/${id}/inventory`, { cookies }),

  vendorListOrders: (status?: string, cookies?: string) => {
    const qs = status ? `?status=${status}` : '';
    return request<VendorFulfilmentResponse[]>(`/vendor/orders${qs}`, { cookies });
  },

  vendorGetOrder: (id: string, cookies?: string) =>
    request<VendorFulfilmentResponse>(`/vendor/orders/${id}`, { cookies }),

  vendorUpdateOrderStatus: (id: string, status: 'CONFIRMED' | 'SHIPPED', cookies?: string) =>
    request<VendorFulfilmentResponse>(`/vendor/orders/${id}/status`, { method: 'PATCH', body: { status }, cookies }),

  vendorListStaff: (cookies?: string) => request<VendorStaffListResponse>('/vendor/staff', { cookies }),

  vendorInviteStaff: (email: string, cookies?: string) =>
    request<{ status: string }>('/vendor/staff/invite', { method: 'POST', body: { email }, cookies }),

  vendorAcceptStaffInvite: (token: string, cookies?: string) =>
    request<{ id: string }>('/vendor/staff/accept', { method: 'POST', body: { token }, cookies }),

  vendorUpdateStaffRole: (memberId: string, role: 'OWNER' | 'STAFF', cookies?: string) =>
    request<{ id: string }>(`/vendor/staff/${memberId}/role`, { method: 'PATCH', body: { role }, cookies }),

  vendorRevokeStaff: (memberId: string, cookies?: string) =>
    request<void>(`/vendor/staff/${memberId}`, { method: 'DELETE', cookies }),

  vendorRevokeInvite: (inviteId: string, cookies?: string) =>
    request<void>(`/vendor/staff/invites/${inviteId}`, { method: 'DELETE', cookies }),

  // ── Admin – Vendors ────────────────────────────────────────────────────────

  adminListVendors: (status?: string, cookies?: string) => {
    const qs = status ? `?status=${status}` : '';
    return request<VendorResponse[]>(`/admin/vendors${qs}`, { cookies });
  },

  adminGetVendor: (id: string, cookies?: string) => request<VendorResponse>(`/admin/vendors/${id}`, { cookies }),

  adminApproveVendor: (id: string, cookies?: string) =>
    request<VendorResponse>(`/admin/vendors/${id}/approve`, { method: 'PATCH', cookies }),

  adminRejectVendor: (id: string, cookies?: string) =>
    request<VendorResponse>(`/admin/vendors/${id}/reject`, { method: 'PATCH', cookies }),

  adminSuspendVendor: (id: string, cookies?: string) =>
    request<VendorResponse>(`/admin/vendors/${id}/suspend`, { method: 'PATCH', cookies }),

  // ── Admin – Dashboard / audit log / admin accounts ──────────────────────────

  adminDashboard: (cookies?: string) => request<AdminDashboardResponse>('/admin/dashboard', { cookies }),

  adminAuditLogs: (
    params: { page?: number; limit?: number; action?: string; targetType?: string } = {},
    cookies?: string,
  ) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.action) qs.set('action', params.action);
    if (params.targetType) qs.set('targetType', params.targetType);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<AuditLogListResponse>(`/admin/audit-logs${suffix}`, { cookies });
  },

  adminListAdmins: (cookies?: string) => request<AdminAccountResponse[]>('/admin/admins', { cookies }),

  adminCreateAdmin: (email: string, cookies?: string) =>
    request<{ id: string; email: string; role: string }>('/admin/admins', { method: 'POST', body: { email }, cookies }),

  // ── Admin – Catalog imports ──────────────────────────────────────────────

  adminPreviewImport: (scope: ImportScopeInput, cookies?: string) =>
    request<ImportPreviewResponse>('/admin/catalog-imports/preview', { method: 'POST', body: scope, cookies }),

  adminTriggerImport: (scope: ImportScopeInput, cookies?: string) =>
    request<CatalogImportRunResponse>('/admin/catalog-imports/dummy-json', { method: 'POST', body: scope, cookies }),

  adminListImportRuns: (limit = 20, cookies?: string) =>
    request<CatalogImportRunResponse[]>(`/admin/catalog-imports?limit=${limit}`, { cookies }),

  // ── Reviews ──────────────────────────────────────────────────────────────

  listReviews: (slug: string, page = 1, limit = 10, cookies?: string) =>
    request<ReviewListResponse>(`/products/${slug}/reviews?page=${page}&limit=${limit}`, { cookies }),

  reviewEligibility: (slug: string, cookies?: string) =>
    request<ReviewEligibilityResponse>(`/products/${slug}/reviews/my-eligibility`, { cookies }),

  createReview: (
    slug: string,
    body: { orderItemId: string; rating: number; title?: string; body: string },
    cookies?: string,
  ) => request<ReviewResponse>(`/products/${slug}/reviews`, { method: 'POST', body, cookies }),

  adminListReviews: (page = 1, limit = 25, status?: 'PUBLISHED' | 'HIDDEN', cookies?: string) => {
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) qs.set('status', status);
    return request<ReviewListResponse>(`/admin/reviews?${qs.toString()}`, { cookies });
  },

  adminHideReview: (id: string, cookies?: string) =>
    request<ReviewResponse>(`/admin/reviews/${id}/hide`, { method: 'PATCH', cookies }),

  adminPublishReview: (id: string, cookies?: string) =>
    request<ReviewResponse>(`/admin/reviews/${id}/publish`, { method: 'PATCH', cookies }),

  // ── Wishlist ─────────────────────────────────────────────────────────────

  listWishlist: (cookies?: string) => request<WishlistItemResponse[]>('/me/wishlist', { cookies }),

  addToWishlist: (productId: string, cookies?: string) =>
    request<{ status: string }>('/me/wishlist', { method: 'POST', body: { productId }, cookies }),

  removeFromWishlist: (productId: string, cookies?: string) =>
    request<void>(`/me/wishlist/${productId}`, { method: 'DELETE', cookies }),

  // ── Addresses ────────────────────────────────────────────────────────────

  listAddresses: (cookies?: string) => request<AddressResponse[]>('/me/addresses', { cookies }),

  createAddress: (body: AddressInput, cookies?: string) =>
    request<AddressResponse>('/me/addresses', { method: 'POST', body, cookies }),

  updateAddress: (id: string, body: Partial<AddressInput>, cookies?: string) =>
    request<AddressResponse>(`/me/addresses/${id}`, { method: 'PATCH', body, cookies }),

  removeAddress: (id: string, cookies?: string) =>
    request<void>(`/me/addresses/${id}`, { method: 'DELETE', cookies }),

  setDefaultAddress: (id: string, cookies?: string) =>
    request<AddressResponse>(`/me/addresses/${id}/default`, { method: 'PATCH', cookies }),
};

// `PUT /cart/items` returns the raw upserted CartItem row (no nested
// product/vendor — that flattening is `CartService.toCartResponse()`,
// applied only to `GET /cart`'s full list). Typed separately so callers
// aren't led to expect fields this specific response doesn't carry; every
// call site invalidates and refetches the full cart anyway rather than
// relying on this return value for display.
interface CartItemFromUpsert {
  id: string;
  cartId: string;
  vendorOfferId: string;
  quantity: number;
  addedAt: string;
  updatedAt: string;
}
