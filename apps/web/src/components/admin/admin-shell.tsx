'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AdminSidebar } from './admin-sidebar';
import { AdminTopbar } from './admin-topbar';
import { AdminActivityPanel } from './admin-activity-panel';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import styles from '@/app/admin/state.module.css';

export function AdminShell({ children, email, isSuperAdmin, demoEnabled }: {
  children: ReactNode;
  email: string;
  isSuperAdmin: boolean;
  demoEnabled: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [storageError, setStorageError] = useState(false);
  const [favoritesLoading, setFavoritesLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [favoritesAttempt, setFavoritesAttempt] = useState(0);
  const [activityOpen, setActivityOpen] = useState(false);
  const pathname = usePathname();
  const storageKey = `shopnest.admin.favorites:${email}`;

  useEffect(() => {
    if (window.matchMedia('(max-width: 700px)').matches) setCollapsed(true);
    setActivityOpen(window.matchMedia('(min-width: 1101px)').matches);
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      setFavoritesLoading(true);
      try {
        let saved = await api.adminFavorites();
        let legacy: unknown = null;
        try { legacy = JSON.parse(localStorage.getItem(storageKey) ?? '[]'); } catch { /* Ignore invalid local preferences. */ }
        if (Array.isArray(legacy)) {
          const paths = legacy.filter((item): item is string => typeof item === 'string' && item.length <= 255 && /^\/admin(?:\/[a-zA-Z0-9-]+)*$/.test(item));
          for (const path of paths) {
            if (!saved.includes(path)) { await api.addAdminFavorite(path); saved = [...saved, path]; }
          }
          try { localStorage.removeItem(storageKey); } catch { /* The server copy is already saved. */ }
        }
        if (active) { setFavorites(saved); setStorageError(false); }
      } catch { if (active) setStorageError(true); }
      finally { if (active) setFavoritesLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [storageKey, favoritesAttempt]);

  async function toggleFavorite() {
    if (saving || favoritesLoading) return;
    const removing = favorites.includes(pathname);
    setSaving(true);
    try {
      if (removing) await api.removeAdminFavorite(pathname);
      else await api.addAdminFavorite(pathname);
      setFavorites((current) => removing ? current.filter((item) => item !== pathname) : [...current, pathname]);
      setStorageError(false);
    } catch { setStorageError(true); }
    finally { setSaving(false); }
  }

  return <div className="min-h-screen flex bg-white font-lato">
    <AdminSidebar email={email} isSuperAdmin={isSuperAdmin} demoEnabled={demoEnabled} collapsed={collapsed} favorites={favorites} />
    <div className="flex-1 min-w-0 flex flex-col">
      <AdminTopbar collapsed={collapsed} onToggleSidebar={() => setCollapsed((value) => !value)} favorite={favorites.includes(pathname)} onToggleFavorite={toggleFavorite} storageError={storageError} onRetryFavorites={() => setFavoritesAttempt((value) => value + 1)} favoriteDisabled={favoritesLoading || saving || storageError} isSuperAdmin={isSuperAdmin} demoEnabled={demoEnabled} activityOpen={activityOpen} onToggleActivity={() => setActivityOpen((value) => !value)} onOpenActivity={() => setActivityOpen(true)} />
      <main className={styles.content}>{children}</main>
    </div>
    <div
      aria-hidden={!activityOpen}
      inert={!activityOpen}
      className={`fixed right-0 top-[68px] bottom-0 z-30 w-[min(280px,calc(100vw-16px))] overflow-hidden shadow-[-12px_0_32px_rgb(15_23_42_/_12%)] transition-transform duration-300 ease-in-out motion-reduce:transition-none min-[1101px]:static min-[1101px]:z-auto min-[1101px]:h-auto min-[1101px]:shrink-0 min-[1101px]:shadow-none min-[1101px]:transition-[width] ${activityOpen ? 'translate-x-0 min-[1101px]:w-[280px]' : 'pointer-events-none translate-x-full min-[1101px]:w-0 min-[1101px]:translate-x-0'}`}
    >
      <div className={`h-full w-[min(280px,calc(100vw-16px))] transition-transform duration-300 ease-in-out motion-reduce:transition-none ${activityOpen ? 'translate-x-0' : 'min-[1101px]:translate-x-full'}`}>
        <AdminActivityPanel />
      </div>
    </div>
  </div>;
}
