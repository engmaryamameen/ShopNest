/**
 * Response shapes returned by the API.
 *
 * Request bodies are typed from `@shopnest/api-client`'s generated OpenAPI
 * schemas (`packages/api-client/src/types.ts`, committed + CI-verified
 * against the live Swagger spec). Response bodies are hand-typed here
 * instead, because the controllers this client talks to return raw Prisma
 * models with no `@ApiResponse({ type })` annotation — `openapi-typescript`
 * has nothing to generate a response schema from. These interfaces are kept
 * in sync by hand against the actual mapper shapes in `catalog.service.ts`
 * (`toProductCard`/`toProductDetail`) / `cart.service.ts`
 * (`toCartResponse`) / `orders.service.ts` (`ORDER_INCLUDE`) — real types,
 * not `unknown`, even though the source isn't (yet) the generated client.
 */

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

export interface CategoryResponse {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  position: number;
  isActive: boolean;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrandResponse {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
}

export interface ProductCategoryRef {
  id?: string;
  name: string;
  slug: string;
}

export interface ProductBrandRef {
  id: string;
  name: string;
  slug: string;
}

/** `GET /products`, `GET /admin/products`, `GET /products/:id` — the
 * "buy box" (lowest-priced active offer) flattened onto the product, plus
 * the id of that specific offer so the storefront can actually add it to
 * a cart. */
export interface ProductCardResponse {
  id: string;
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  category: ProductCategoryRef | null;
  brand: ProductBrandRef | null;
  publishStatus: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
  offerId: string | null;
  priceCents: number;
  compareAtPriceCents: number | null;
  stockQuantity: number;
  imageUrl: string | null;
  ratingAverage: number;
  ratingCount: number;
}

export interface ProductVendorOfferResponse {
  id: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  stockQuantity: number;
  condition: 'NEW' | 'USED' | 'REFURBISHED';
  vendor: { id: string; name: string; slug: string };
}

/** `GET /products/:slug` (and the admin create/update responses) — every
 * active offer, not just the buy-box winner, plus specs/images. */
export interface ProductDetailResponse {
  id: string;
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  category: ProductCategoryRef | null;
  brand: ProductBrandRef | null;
  createdAt: string;
  updatedAt: string;
  images: Array<{ url: string; altText: string | null }>;
  imageUrl: string | null;
  ratingAverage: number;
  ratingCount: number;
  attributes: Array<{ name: string; slug: string; value: string }>;
  offerId: string | null;
  priceCents: number;
  compareAtPriceCents: number | null;
  stockQuantity: number;
  offers: ProductVendorOfferResponse[];
}

export interface ProductListResponse {
  items: ProductCardResponse[];
  total: number;
  page: number;
  limit: number;
}

export interface CartItemVendorRef {
  id: string;
  name: string;
  slug: string;
}

export interface CartItemProductRef {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
}

export interface CartItemResponse {
  id: string;
  vendorOfferId: string;
  quantity: number;
  addedAt: string;
  updatedAt: string;
  priceCents: number;
  stockQuantity: number;
  offerStatus: 'DRAFT' | 'ACTIVE' | 'INACTIVE';
  vendor: CartItemVendorRef;
  product: CartItemProductRef;
}

export interface CartAppliedPromotion {
  code: string;
  discountPreviewCents: number;
}

export interface CartResponse {
  id: string;
  userId: string;
  updatedAt: string;
  items: CartItemResponse[];
  appliedPromotion: CartAppliedPromotion | null;
}

// Shorter aliases for the shapes `use-cart.ts` and its consumers work with
// day to day — same types, `Response` suffix dropped since these aren't
// raw-fetch call sites.
export type Cart = CartResponse;
export type CartItem = CartItemResponse;

export type ReturnStatus = 'REQUESTED' | 'REJECTED' | 'REFUNDED';
export type ReturnReason = 'DEFECTIVE' | 'NOT_AS_DESCRIBED' | 'NO_LONGER_NEEDED' | 'WRONG_ITEM' | 'OTHER';

export interface ReturnRequestResponse {
  id: string;
  orderItemId: string;
  userId: string;
  reason: ReturnReason;
  note: string | null;
  status: ReturnStatus;
  decidedByUserId: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
  orderItem?: OrderItemResponse;
  user?: { id: string; email: string };
}

export interface OrderItemResponse {
  id: string;
  orderId: string;
  vendorOrderId: string | null;
  vendorOfferId: string | null;
  quantity: number;
  unitPriceCents: number;
  productName: string;
  productSlug: string;
  vendorName: string | null;
  /** Only present on GET /orders/:id — a minimal projection, not the full ReturnRequestResponse. */
  returnRequest?: { id: string; status: ReturnStatus } | null;
}

export interface OrderStatusHistoryResponse {
  id: string;
  orderId: string;
  vendorOrderId: string | null;
  changedById: string;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  createdAt: string;
}

export interface VendorOrderResponse {
  id: string;
  vendorId: string;
  status: OrderStatus;
  subtotalCents: number;
  discountCents: number;
  vendor: { id: string; name: string; slug: string };
}

export type UserRole = 'CUSTOMER' | 'VENDOR' | 'ADMIN' | 'SUPER_ADMIN';
export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

export interface UserSummary {
  id: string;
  email: string;
  role: UserRole;
  status: AccountStatus;
  emailVerifiedAt: string | null;
  createdAt: string;
}

export interface OrderResponse {
  id: string;
  userId: string;
  status: OrderStatus;
  totalCents: number;
  discountCents: number;
  paymentRef: string | null;
  currency: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  items: OrderItemResponse[];
  statusHistory: OrderStatusHistoryResponse[];
  vendorOrders: VendorOrderResponse[];
  user?: { id: string; email: string };
}

// ── Vendor ───────────────────────────────────────────────────────────────

export type VendorApplicationStatus = 'PENDING' | 'APPROVED' | 'SUSPENDED' | 'REJECTED';

export interface VendorResponse {
  id: string;
  name: string;
  slug: string;
  status: VendorApplicationStatus;
  description: string | null;
  logoUrl: string | null;
  contactEmail: string;
  commissionRateBps: number | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  approvedByUserId: string | null;
  members?: Array<{ id: string; role: 'OWNER' | 'STAFF'; user: { id: string; email: string } }>;
}

export interface VendorOfferResponse {
  id: string;
  vendorId: string;
  productId: string;
  variantId: string | null;
  vendorSku: string;
  condition: 'NEW' | 'USED' | 'REFURBISHED';
  priceCents: number;
  compareAtPriceCents: number | null;
  stockQuantity: number;
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
  product?: { id: string; name: string; slug: string };
  variant?: { id: string; sku: string | null } | null;
}

export interface InventoryAdjustmentResponse {
  id: string;
  vendorOfferId: string;
  delta: number;
  reason: 'RESTOCK' | 'SALE' | 'RETURN' | 'CORRECTION' | 'IMPORT_INITIAL';
  reference: string | null;
  actorUserId: string | null;
  createdAt: string;
}

export interface VendorFulfilmentResponse {
  id: string;
  orderId: string;
  vendorId: string;
  status: OrderStatus;
  subtotalCents: number;
  createdAt: string;
  updatedAt: string;
  items: OrderItemResponse[];
  order: { id: string; createdAt: string; currency: string; user: { id: string; email: string } };
  statusHistory?: OrderStatusHistoryResponse[];
}

export interface VendorAnalyticsResponse {
  totalRevenueCents: number;
  totalOrders: number;
  ordersAwaitingFulfilment: number;
  ordersByStatus: Partial<Record<OrderStatus, number>>;
  offersByStatus: Record<string, number>;
}

export interface VendorMemberResponse {
  id: string;
  vendorId: string;
  role: 'OWNER' | 'STAFF';
  createdAt: string;
  user: { id: string; email: string };
}

export interface VendorStaffInviteResponse {
  id: string;
  email: string;
  role: 'OWNER' | 'STAFF';
  createdAt: string;
  expiresAt: string;
}

export interface VendorStaffListResponse {
  members: VendorMemberResponse[];
  pendingInvites: VendorStaffInviteResponse[];
}

// ── Admin ────────────────────────────────────────────────────────────────

export interface AdminDashboardResponse {
  users: { total: number; customers: number; vendorsRole: number; admins: number };
  vendors: { pending: number; approved: number; suspended: number; rejected: number };
  products: { draft: number; published: number; archived: number };
  orders: { byStatus: Partial<Record<OrderStatus, number>>; totalRevenueCents: number };
  pendingVendorApplications: number;
  recentAuditLogs: AuditLogResponse[];
}

export interface AuditLogResponse {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  createdAt: string;
  actor: { id: string; email: string } | null;
}

export interface AuditLogListResponse {
  items: AuditLogResponse[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminAccountResponse {
  id: string;
  email: string;
  role: UserRole;
  status: AccountStatus;
  emailVerifiedAt: string | null;
  createdAt: string;
}

export interface ImportPreviewResponse {
  discoveredCount: number;
  scopedCount: number;
  skippedCount: number;
  wouldCreateCount: number;
  wouldUpdateCount: number;
  wouldBeUnchangedCount: number;
  sample: Array<{ externalId: string; name: string; categoryName: string; action: 'create' | 'update' | 'unchanged' }>;
}

export interface CatalogImportRunResponse {
  id: string;
  source: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  discoveredCount: number;
  scopedCount: number;
  processedCount: number;
  skippedCount: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  errorMessage: string | null;
  categoryScope: string[];
  maxRecords: number | null;
  minImageCount: number | null;
  startedAt: string;
  completedAt: string | null;
}

export interface ImportScopeInput {
  categoryScope?: string[];
  maxRecords?: number;
  minImageCount?: number;
}

// ── Reviews ──────────────────────────────────────────────────────────────

export interface ReviewResponse {
  id: string;
  productId: string;
  userId: string;
  orderItemId: string;
  rating: number;
  title: string | null;
  body: string;
  status: 'PUBLISHED' | 'HIDDEN';
  createdAt: string;
  updatedAt: string;
  user?: { id: string; email: string };
  product?: { id: string; name: string; slug: string };
}

export interface ReviewListResponse {
  items: ReviewResponse[];
  total: number;
  page: number;
  limit: number;
}

export interface ReviewEligibilityResponse {
  eligible: boolean;
  orderItemId: string | null;
}

// ── Wishlist ─────────────────────────────────────────────────────────────

export type WishlistItemResponse = ProductCardResponse;

// ── Addresses ────────────────────────────────────────────────────────────

export interface AddressResponse {
  id: string;
  label: string | null;
  fullName: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postalCode: string;
  country: string;
  phone: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AddressInput {
  label?: string;
  fullName: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
  phone?: string;
}

// ── Promotions & returns ─────────────────────────────────────────────────

export type PromotionType = 'PERCENT' | 'FIXED_AMOUNT';
export type PromotionScope = 'PLATFORM' | 'VENDOR';

export interface PromotionResponse {
  id: string;
  code: string;
  type: PromotionType;
  value: number;
  scope: PromotionScope;
  vendorId: string | null;
  startsAt: string;
  endsAt: string;
  maxRedemptions: number | null;
  maxRedemptionsPerUser: number | null;
  minSubtotalCents: number | null;
  isActive: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}
