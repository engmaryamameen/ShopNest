// Centralized icon set for the admin shell — every icon used across the
// sidebar/topbar/dashboard imports from here, not ad hoc per component, so
// there's one place to see (and change) the whole icon vocabulary. Offline
// icon data (@iconify-icons/*), rendered via @iconify/react/offline — no
// runtime network calls to Iconify's API.
import home from '@iconify-icons/mingcute/home-4-fill';
import productList from '@iconify-icons/fluent-mdl2/product-list';
import cart from '@iconify-icons/mdi/cart-outline';
import categoryGrid from '@iconify-icons/mdi/view-grid-outline';
import reviews from '@iconify-icons/material-symbols/reviews-outline';
import cloudImport from '@iconify-icons/mdi/database-import-outline';
import undoVariant from '@iconify-icons/mdi/undo-variant';
import tagMultiple from '@iconify-icons/mdi/tag-multiple-outline';
import store from '@iconify-icons/mdi/store-outline';
import accountGroup from '@iconify-icons/mdi/account-group-outline';
import shieldAccount from '@iconify-icons/mdi/shield-account-outline';
import history from '@iconify-icons/mdi/history';
import menuClose from '@iconify-icons/material-symbols/menu-open';
import menuOpen from '@iconify-icons/material-symbols/menu';
import logout from '@iconify-icons/mdi/logout';
import openInNew from '@iconify-icons/mdi/open-in-new';
import chevronDown from '@iconify-icons/mdi/chevron-down';
import trendingUp from '@iconify-icons/mdi/trending-up';
import trendingDown from '@iconify-icons/mdi/trending-down';

export const ADMIN_ICONS = {
  dashboard: home,
  orders: cart,
  products: productList,
  categories: categoryGrid,
  reviews: reviews,
  imports: cloudImport,
  returns: undoVariant,
  promotions: tagMultiple,
  vendors: store,
  users: accountGroup,
  admins: shieldAccount,
  auditLog: history,
  sidebarCollapse: menuClose,
  sidebarExpand: menuOpen,
  logout: logout,
  externalLink: openInNew,
  chevronDown: chevronDown,
  trendingUp: trendingUp,
  trendingDown: trendingDown,
} as const;

export type AdminIconName = keyof typeof ADMIN_ICONS;
