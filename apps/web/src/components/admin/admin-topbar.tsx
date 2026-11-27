'use client';

import { usePathname } from 'next/navigation';
import { SidebarToggleIcon } from './icons/sidebar-toggle-icon';
import { FavoriteIcon } from './icons/favorite-icon';
import { BellIcon, HistoryIcon } from './icons/toolbar-icons';
import { AdminPageSearch } from './admin-page-search';
import { adminPageTitle } from './admin-pages';
import Link from 'next/link';
import styles from './admin-topbar.module.css';
import authStyles from '@/components/auth/auth.module.css';

const toolbarControl = 'relative grid size-10 shrink-0 place-items-center border-0 bg-transparent p-0 text-[#232b34] hover:text-[#0077b6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0077b6] disabled:cursor-wait disabled:opacity-50 [&>svg]:size-7';
const activeControl = 'text-[#0077b6] after:absolute after:bottom-0.5 after:h-1 after:w-1 after:rounded-full after:bg-current';

export function AdminTopbar({ collapsed, onToggleSidebar, favorite, onToggleFavorite, storageError, onRetryFavorites, favoriteDisabled, isSuperAdmin, demoEnabled, activityOpen, onToggleActivity, onOpenActivity }: { collapsed: boolean; onToggleSidebar: () => void; favorite: boolean; onToggleFavorite: () => void; storageError: boolean; onRetryFavorites: () => void; favoriteDisabled: boolean; isSuperAdmin: boolean; demoEnabled: boolean; activityOpen: boolean; onToggleActivity: () => void; onOpenActivity: () => void }) {
  const pathname = usePathname();
  const title = adminPageTitle(pathname);

  return (
    <header className={styles.header} data-admin-header>
      <div className={`flex items-center ${styles.navControls}`}>
        <button type="button" className={`${toolbarControl} ${collapsed ? activeControl : ""}`} onClick={onToggleSidebar} aria-controls="admin-sidebar"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed}>
        <SidebarToggleIcon />
      </button>
      <button type="button" className={toolbarControl} onClick={onToggleFavorite} disabled={favoriteDisabled} aria-pressed={favorite} aria-label={favorite ? 'Remove page from favorites' : 'Add page to favorites'}>
        <FavoriteIcon active={favorite} />
      </button>
      </div>
      <Link href="/admin" aria-label="ShopNest admin home" className={`${authStyles.authWordmark} ${styles.mobileBrand} !hidden shrink-0 whitespace-nowrap !text-[24px] no-underline focus-visible:outline-2 focus-visible:outline-[#0077b6] max-[900px]:!block max-[360px]:!text-[20px]`}>Shop<span>Nest</span></Link>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <Link href="/admin">Dashboard</Link><span aria-hidden="true">/</span><span aria-current="page">{pathname === '/admin' ? 'Home' : title}</span>
      </nav>
      <h1 className={styles.srOnly}>{title}</h1>
      {storageError && <span role="alert" className={styles.error}>Couldn’t load or update favorites. <button type="button" onClick={onRetryFavorites}>Try again</button></span>}
      <div className={styles.tools}>
        <AdminPageSearch isSuperAdmin={isSuperAdmin} demoEnabled={demoEnabled} />
        <Link href="/admin/audit-log" className={`max-[900px]:hidden ${toolbarControl} ${pathname === "/admin/audit-log" ? activeControl : ""}`} aria-current={pathname === "/admin/audit-log" ? "page" : undefined} aria-label="View activity history" title="Activity history"><HistoryIcon /></Link>
        <button type="button" className={`${toolbarControl} ${styles.notification}`} onClick={onOpenActivity} aria-label="View notifications" aria-controls="admin-activity-panel" aria-expanded={activityOpen}><BellIcon /></button>
        <button type="button" className={`${toolbarControl} ${styles.activityToggle} ${activityOpen ? activeControl : ""}`} onClick={onToggleActivity} aria-label={activityOpen ? 'Hide activity panel' : 'Show activity panel'} aria-controls="admin-activity-panel" aria-expanded={activityOpen}><SidebarToggleIcon /></button>
      </div>
    </header>
  );
}
