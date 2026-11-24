'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from '@iconify/react/offline';
import { ADMIN_ICONS, AdminIconName } from './icons/admin-icons';
import { api } from '@/lib/api';
import styles from './admin-sidebar.module.css';

type NavItem = { label: string; href: string; icon: AdminIconName };
type NavSection = { title: string; items: NavItem[] };

function buildSections(isSuperAdmin: boolean): NavSection[] {
  return [
    { title: 'Main menu', items: [{ label: 'Dashboard', href: '/admin', icon: 'dashboard' }] },
    {
      title: 'Catalog',
      items: [
        { label: 'Products', href: '/admin/products', icon: 'products' },
        { label: 'Categories', href: '/admin/categories', icon: 'categories' },
        { label: 'Reviews', href: '/admin/reviews', icon: 'reviews' },
        { label: 'Imports', href: '/admin/imports', icon: 'imports' },
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

export function AdminSidebar({ email, isSuperAdmin }: { email: string; isSuperAdmin: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const sections = buildSections(isSuperAdmin);

  useEffect(() => {
    if (window.matchMedia('(max-width: 700px)').matches) setCollapsed(true);
  }, []);

  function isActive(href: string) {
    return href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
  }

  function handleLogout() {
    setLoggingOut(true);
    api
      .logout()
      .catch(() => undefined)
      .finally(() => {
        router.push('/login');
        router.refresh();
      });
  }

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
      <div className={styles.header}>
        {!collapsed && <Link href="/admin" className={styles.brand}>ShopNest <span>Admin</span></Link>}
        <button type="button" onClick={() => setCollapsed((c) => !c)} className={styles.iconButton}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed}>
          <Icon icon={collapsed ? ADMIN_ICONS.sidebarExpand : ADMIN_ICONS.sidebarCollapse} width={20} height={20} />
        </button>
      </div>
      <nav className={styles.navigation} aria-label="Admin navigation">
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
      </nav>
      <div className={styles.footer}>
        <div className={styles.account}>
          <span className={styles.avatar} aria-hidden="true">{initialsFor(email)}</span>
          {!collapsed && <div className={styles.accountDetails}><strong>Admin</strong><span>{email}</span></div>}
          <button type="button" onClick={handleLogout} disabled={loggingOut} className={styles.iconButton} aria-label="Log out">
            <Icon icon={ADMIN_ICONS.logout} width={20} height={20} />
          </button>
        </div>
        <Link href="/shop" className={styles.shopLink} aria-label={collapsed ? 'Your shop' : undefined} title={collapsed ? 'Your shop' : undefined}>
          <Icon icon={ADMIN_ICONS.externalLink} width={18} height={18} />{!collapsed && <span>Your shop</span>}
        </Link>
      </div>
    </aside>
  );
}
