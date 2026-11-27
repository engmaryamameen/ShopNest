'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from '@iconify/react/offline';
import { ADMIN_ICONS, AdminIconName } from './icons/admin-icons';
import { api } from '@/lib/api';
import styles from './admin-sidebar.module.css';
import { adminPageTitle } from './admin-pages';

type NavItem = { label: string; href: string; icon: AdminIconName };
type NavSection = { title: string; items: NavItem[] };

function buildSections(isSuperAdmin: boolean, demoEnabled: boolean): NavSection[] {
  return [
    { title: 'Main menu', items: [
      { label: 'Dashboard', href: '/admin', icon: 'dashboard' },
      { label: 'Your shop', href: '/shop', icon: 'externalLink' },
    ] },
    {
      title: 'Catalog',
      items: [
        { label: 'Products', href: '/admin/products', icon: 'products' },
        { label: 'Categories', href: '/admin/categories', icon: 'categories' },
        { label: 'Reviews', href: '/admin/reviews', icon: 'reviews' },
        { label: 'Imports', href: '/admin/imports', icon: 'imports' },
        ...(demoEnabled ? [{ label: 'Demo data', href: '/admin/demo-data', icon: 'products' as AdminIconName }] : []),
      ],
    },
    {
      title: 'Commerce',
      items: [
        { label: 'Orders', href: '/admin/orders', icon: 'orders' },
        { label: 'Returns', href: '/admin/returns', icon: 'returns' },
        { label: 'Promotions', href: '/admin/promotions', icon: 'promotions' },
      ],
    },
    {
      title: 'Admin',
      items: [
        { label: 'Vendors', href: '/admin/vendors', icon: 'vendors' },
        { label: 'Users', href: '/admin/users', icon: 'users' },
        ...(isSuperAdmin ? [{ label: 'Admins', href: '/admin/admins', icon: 'admins' as AdminIconName }] : []),
        { label: 'Audit Log', href: '/admin/audit-log', icon: 'auditLog' },
      ],
    },
  ];
}

function initialsFor(email: string): string {
  const name = email.split('@')[0];
  const parts = name.split(/[._-]/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}

export function AdminSidebar({ email, isSuperAdmin, demoEnabled, collapsed, favorites }: { email: string; isSuperAdmin: boolean; demoEnabled: boolean; collapsed: boolean; favorites: string[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const sections = buildSections(isSuperAdmin, demoEnabled);

  function isActive(href: string) {
    return href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
  }

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError(false);
    try {
      await api.logout();
      router.push('/login');
      router.refresh();
    } catch {
      setLogoutError(true);
      setLoggingOut(false);
    }
  }

  return (
    <aside id="admin-sidebar" className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
      <div className={styles.header}>
        <div className={styles.account} title={collapsed ? email : undefined}>
          <span className={styles.avatar} aria-hidden="true">{initialsFor(email)}</span>
          {!collapsed && <div className={styles.accountDetails}><strong>Admin</strong><span>{email}</span></div>}
          {collapsed && <span className={styles.srOnly}>{email}</span>}
        </div>
      </div>
      <nav className={styles.navigation} aria-label="Admin navigation">
        {favorites.length > 0 && <section className={styles.section} aria-label="Favorites">
          {!collapsed && <p className={styles.sectionTitle}>Favorites</p>}
          <ul className={styles.list}>{favorites.map((href) => <li key={href}>
            <Link href={href} className={`${styles.navLink} ${pathname === href ? styles.active : ''}`} title={adminPageTitle(href)} aria-label={collapsed ? adminPageTitle(href) : undefined}>
              <span className={styles.favoriteStar} aria-hidden="true">★</span>{!collapsed && <span>{adminPageTitle(href)}</span>}
            </Link>
          </li>)}</ul>
        </section>}
        {sections.map((section) => (
          <section key={section.title} className={styles.section} aria-label={section.title}>
            {!collapsed && <p className={styles.sectionTitle}>{section.title}</p>}
            <ul className={styles.list}>
              {section.items.map((item) => {
                const active = isActive(item.href);
                return <li key={item.href}>
                  <Link href={item.href} title={collapsed ? item.label : undefined}
                    aria-label={collapsed ? item.label : undefined} aria-current={active ? 'page' : undefined}
                    className={`${styles.navLink} ${active ? styles.active : ''}`}>
                    <Icon icon={ADMIN_ICONS[item.icon]} width={20} height={20} />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                </li>;
              })}
            </ul>
          </section>
        ))}
        <div className={styles.signOut}>
          <button type="button" onClick={handleLogout} disabled={loggingOut} className={styles.navButton}
            aria-label={loggingOut ? 'Signing out' : 'Log out'} title={collapsed ? 'Log out' : undefined}>
            <Icon icon={ADMIN_ICONS.logout} width={20} height={20} />
            {!collapsed && <span>{loggingOut ? 'Signing out…' : 'Log out'}</span>}
          </button>
          {logoutError && <p className={styles.logoutError} role="alert">Couldn’t sign out. Try again.</p>}
        </div>
      </nav>
    </aside>
  );
}
