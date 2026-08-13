/**
 * Response shapes returned by the API.
 *
 * Request bodies are typed from `@shopnest/api-client`'s generated OpenAPI
 * schemas (`packages/api-client/src/types.ts`, committed + CI-verified
 * against the live Swagger spec). Response bodies are hand-typed here
 * instead, because the controllers this client talks to return raw Prisma
 * models with no `@ApiResponse({ type })` annotation — `openapi-typescript`
 * has nothing to generate a response schema from (verified: every read
 * endpoint's generated `responses` entry is `Record<string, never>`). These
 * interfaces are kept in sync by hand against the actual Prisma `select`/
 * `include` shapes in `catalog.service.ts` / `cart.service.ts` /
 * `orders.service.ts` — real types, not `unknown`, even though the source
 * isn't (yet) the generated client. Closing that gap properly means adding
 * response DTOs on the API side, which is deferred to the Phase 2 catalog
 * remodel since these exact shapes (Product in particular) are being
 * restructured there anyway — annotating the current, soon-to-change shape
 * now would be throwaway work.
 */

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

export interface CategoryResponse {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductCategoryRef {
  name: string;
  slug: string;
}

export interface ProductResponse {
  id: string;
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  stockQuantity: number;
  imageUrl: string | null;
  categoryId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  category: ProductCategoryRef | null;
}

export interface ProductListResponse {
  items: ProductResponse[];
  total: number;
  page: number;
  limit: number;
}

export interface CartItemProductRef {
  id: string;
  name: string;
  slug: string;
  priceCents: number;
  imageUrl: string | null;
  stockQuantity: number;
  isActive: boolean;
}

export interface CartItemResponse {
  id: string;
  cartId: string;
  productId: string;
  quantity: number;
  addedAt: string;
  updatedAt: string;
  product: CartItemProductRef;
}

export interface CartResponse {
  id: string;
  userId: string;
  updatedAt: string;
  items: CartItemResponse[];
}

export interface OrderItemResponse {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
  productName: string;
  productSlug: string;
}

export interface OrderStatusHistoryResponse {
  id: string;
  orderId: string;
  changedById: string;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  createdAt: string;
}

export type UserRole = 'CUSTOMER' | 'ADMIN';
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
  currency: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  items: OrderItemResponse[];
  statusHistory: OrderStatusHistoryResponse[];
  user?: { id: string; email: string };
}
