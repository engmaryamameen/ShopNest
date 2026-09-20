'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Re-fetches the runs table every few seconds while a run is queued or
 * running, so progress shows up without the admin manually reloading —
 * renders nothing itself. Stops as soon as the server-rendered page it
 * refreshes reports nothing in flight. */
export function RunsAutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(interval);
  }, [active, router]);

  return null;
}
