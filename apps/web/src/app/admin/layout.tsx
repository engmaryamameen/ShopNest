import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { AdminTopbar } from '@/components/admin/admin-topbar';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  let email = '';
  let isSuperAdmin = false;
  try {
    const result = (await api.me(cookieHeader)) as { user: { role: string; email: string } };
    if (result.user.role !== 'ADMIN' && result.user.role !== 'SUPER_ADMIN') redirect('/shop');
    isSuperAdmin = result.user.role === 'SUPER_ADMIN';
    email = result.user.email;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect('/login?returnTo=/admin');
    }
    // Next.js redirects are thrown control-flow exceptions and must propagate.
    if (err && typeof err === 'object' && 'digest' in err && String(err.digest).startsWith('NEXT_REDIRECT')) throw err;
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-2xl font-bold">Admin temporarily unavailable</h1>
        <p className="mt-3">We could not connect to the service. Check your connection and try again.</p>
        <a className="mt-4 inline-block underline" href="/admin">Try again</a>
      </main>
    );
  }

  return (
    <div className="min-h-screen flex bg-[#F9FAFB] font-lato">
      <AdminSidebar email={email} isSuperAdmin={isSuperAdmin} demoEnabled={process.env.NODE_ENV === 'development' && process.env.DEMO_CATALOG_ENABLED === 'true'} />
      <div className="flex-1 min-w-0 flex flex-col">
        <AdminTopbar />
        <main className="flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
