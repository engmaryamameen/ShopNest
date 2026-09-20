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
    if (result.user.role !== 'ADMIN' && result.user.role !== 'SUPER_ADMIN') {
      redirect('/shop');
    }
    isSuperAdmin = result.user.role === 'SUPER_ADMIN';
    email = result.user.email;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect('/login?returnTo=/admin');
    }
    throw err;
  }

  return (
    <div className="min-h-screen flex bg-[#F9FAFB] font-lato">
      <AdminSidebar email={email} isSuperAdmin={isSuperAdmin} />
      <div className="flex-1 min-w-0 flex flex-col">
        <AdminTopbar />
        <main className="flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
