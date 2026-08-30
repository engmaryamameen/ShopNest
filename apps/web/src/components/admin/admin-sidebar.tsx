'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from '@iconify/react/offline';
import { ADMIN_ICONS, AdminIconName } from './icons/admin-icons';
import { api } from '@/lib/api';

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
    <aside
      className={`shrink-0 bg-white shadow-[0_3px_4px_rgba(0,0,0,0.12)] flex flex-col h-screen sticky top-0 transition-[width] duration-200 ${
        collapsed ? 'w-[76px]' : 'w-[260px]'
      }`}
    >
      <div className="flex items-center justify-between px-5 py-5 h-16 shrink-0">
        {!collapsed && (
          <Link href="/admin" className="font-lato font-bold text-lg text-admin-ink tracking-tight">
            ShopNest
          </Link>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="text-admin-muted hover:text-admin-ink transition-colors shrink-0"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Icon icon={collapsed ? ADMIN_ICONS.sidebarExpand : ADMIN_ICONS.sidebarCollapse} width={24} height={24} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3.5 pb-4 space-y-6">
        {sections.map((section) => (
          <div key={section.title}>
            {!collapsed && (
              <p className="px-3 mb-2 text-[15px] text-admin-muted font-lato">{section.title}</p>
            )}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={`flex items-center gap-2 rounded-md px-4 py-2.5 text-[16px] font-lato transition-colors ${
                        active ? 'bg-admin-primary text-white font-bold' : 'text-admin-muted hover:bg-gray-50'
                      } ${collapsed ? 'justify-center' : ''}`}
                    >
                      <Icon
                        icon={ADMIN_ICONS[item.icon]}
                        width={22}
                        height={22}
                        color={active ? '#ffffff' : '#6A717F'}
                      />
                      {!collapsed && <span className="flex-1">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="p-3 space-y-3 shrink-0">
        <div className="flex items-center gap-3 bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.2)] px-3 py-3">
          <div className="h-10 w-10 shrink-0 rounded-full bg-admin-primary-soft text-admin-primary font-inter font-semibold text-sm flex items-center justify-center">
            {initialsFor(email)}
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="font-inter font-semibold text-sm text-gray-800 truncate">Admin</p>
                <p className="font-inter text-sm text-neutral-500 truncate">{email}</p>
              </div>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="text-admin-muted hover:text-admin-danger transition-colors shrink-0 disabled:opacity-50"
                aria-label="Log out"
              >
                <Icon icon={ADMIN_ICONS.logout} width={20} height={20} />
              </button>
            </>
          )}
        </div>

        <Link
          href="/shop"
          className={`flex items-center gap-2 rounded-md px-5 py-3 text-[15px] font-medium text-admin-ink bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] hover:shadow-md transition-shadow ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          {!collapsed && <span className="flex-1">Your Shop</span>}
          <Icon icon={ADMIN_ICONS.externalLink} width={16} height={16} />
        </Link>
      </div>
    </aside>
  );
}
