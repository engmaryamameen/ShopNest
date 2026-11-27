'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  const [isMobile, setIsMobile] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const drawer = useRef<HTMLDivElement>(null);
  const activityDrawer = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [storageError, setStorageError] = useState(false);
  const [favoritesLoading, setFavoritesLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [favoritesAttempt, setFavoritesAttempt] = useState(0);
  const [activityOpen, setActivityOpen] = useState(false);
  const pathname = usePathname();
  const storageKey = `shopnest.admin.favorites:${email}`;

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const sync = () => { setIsMobile(media.matches); setMobileNavOpen(false); if (media.matches) setActivityOpen(false); };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);


  useEffect(() => {
    if (!isMobile || (!mobileNavOpen && !activityOpen)) return;
    const activeDrawer = mobileNavOpen ? drawer.current : activityDrawer.current;
    const root = document.documentElement;
    const oldOverflow = root.style.overflow;
    const oldGutter = root.style.scrollbarGutter;
    root.style.scrollbarGutter = 'stable';
    root.style.overflow = 'hidden';
    requestAnimationFrame(() => activeDrawer?.querySelector<HTMLElement>('button, a[href]')?.focus({ preventScroll: true }));
    function keyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); setMobileNavOpen(false); setActivityOpen(false); return; }
      if (event.key !== 'Tab' || !activeDrawer) return;
      const items = Array.from(activeDrawer.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])')).filter((item) => item.getClientRects().length > 0);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('keydown', keyboard); root.style.overflow = oldOverflow; root.style.scrollbarGutter = oldGutter; returnFocus.current?.focus({ preventScroll: true }); };
  }, [isMobile, mobileNavOpen, activityOpen]);

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
    <div ref={drawer} role={isMobile && mobileNavOpen ? 'dialog' : undefined} aria-label={isMobile && mobileNavOpen ? 'Admin navigation' : undefined} aria-modal={isMobile && mobileNavOpen ? true : undefined} aria-hidden={isMobile && !mobileNavOpen ? true : undefined} inert={isMobile && !mobileNavOpen ? true : undefined} onClick={(event) => { if (isMobile && (event.target as HTMLElement).closest('a[href]')) setMobileNavOpen(false); }} className={`max-[900px]:fixed max-[900px]:inset-y-0 max-[900px]:left-0 max-[900px]:z-50 max-[900px]:transition-transform max-[900px]:duration-300 max-[900px]:ease-in-out motion-reduce:transition-none ${mobileNavOpen ? 'max-[900px]:translate-x-0' : 'max-[900px]:-translate-x-full'}`}>
      {isMobile && <button type="button" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" className="absolute right-3 top-4 z-10 grid size-10 place-items-center rounded text-xl text-slate-600 focus-visible:outline-2 focus-visible:outline-[#0077b6]">×</button>}
      <AdminSidebar email={email} isSuperAdmin={isSuperAdmin} demoEnabled={demoEnabled} collapsed={isMobile ? false : collapsed} favorites={favorites} />
    </div>
    <div className="flex-1 min-w-0 flex flex-col" inert={isMobile && (mobileNavOpen || activityOpen) ? true : undefined}>
      <AdminTopbar collapsed={isMobile ? !mobileNavOpen : collapsed} onToggleSidebar={() => { if (isMobile) { returnFocus.current = document.activeElement as HTMLElement; setActivityOpen(false); setMobileNavOpen((value) => !value); } else setCollapsed((value) => !value); }} favorite={favorites.includes(pathname)} onToggleFavorite={toggleFavorite} storageError={storageError} onRetryFavorites={() => setFavoritesAttempt((value) => value + 1)} favoriteDisabled={favoritesLoading || saving || storageError} isSuperAdmin={isSuperAdmin} demoEnabled={demoEnabled} activityOpen={activityOpen} onToggleActivity={() => { returnFocus.current = document.activeElement as HTMLElement; setMobileNavOpen(false); setActivityOpen((value) => !value); }} onOpenActivity={() => { returnFocus.current = document.activeElement as HTMLElement; setMobileNavOpen(false); setActivityOpen(true); }} />
      <main className={styles.content}>{children}</main>
    </div>
    <button type="button" aria-label="Close sidebar" aria-hidden={!(isMobile && (mobileNavOpen || activityOpen))} tabIndex={-1} onClick={() => { setMobileNavOpen(false); setActivityOpen(false); }} className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 motion-reduce:transition-none min-[901px]:hidden ${isMobile && (mobileNavOpen || activityOpen) ? 'opacity-100' : 'pointer-events-none opacity-0'}`} />
    <div
      ref={activityDrawer}
      role={isMobile && activityOpen ? 'dialog' : undefined}
      aria-label={isMobile && activityOpen ? 'Notifications and activity' : undefined}
      aria-modal={isMobile && activityOpen ? true : undefined}
      aria-hidden={!activityOpen}
      inert={!activityOpen}
      className={`fixed right-0 top-[68px] bottom-0 z-30 max-[900px]:top-0 max-[900px]:z-50 w-[min(280px,calc(100vw-16px))] overflow-hidden shadow-[-12px_0_32px_rgb(15_23_42_/_12%)] transition-transform duration-300 ease-in-out motion-reduce:transition-none min-[1101px]:static min-[1101px]:z-auto min-[1101px]:h-auto min-[1101px]:shrink-0 min-[1101px]:shadow-none min-[1101px]:transition-[width] ${activityOpen ? 'translate-x-0 min-[1101px]:w-[280px]' : 'pointer-events-none translate-x-full min-[1101px]:w-0 min-[1101px]:translate-x-0'}`}
    >
      <div className={`h-full w-[min(280px,calc(100vw-16px))] transition-transform duration-300 ease-in-out motion-reduce:transition-none ${activityOpen ? 'translate-x-0' : 'min-[1101px]:translate-x-full'}`}>
        {isMobile && <button type="button" onClick={() => setActivityOpen(false)} aria-label="Close activity panel" className="absolute right-3 top-3 z-10 grid size-10 place-items-center rounded text-xl text-slate-600 focus-visible:outline-2 focus-visible:outline-[#0077b6]">×</button>}
        <AdminActivityPanel />
      </div>
    </div>
  </div>;
}
