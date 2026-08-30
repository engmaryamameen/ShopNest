import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { api } from '@/lib/api';
import { AdminAccountManager } from '@/components/admin/admin-account-manager';

export const dynamic = 'force-dynamic';

export default async function AdminAdminsPage() {
  const cookieHeader = (await cookies()).toString();

  // Page-level guard, not just a hidden nav link: /admin/layout.tsx only
  // requires ADMIN-or-above to reach /admin/* at all — this specific page
  // is SUPER_ADMIN-only, and the API independently enforces this too, but a
  // plain ADMIN should never even see a broken/empty page here.
  const { user } = await api.me(cookieHeader);
  if (user.role !== 'SUPER_ADMIN') redirect('/admin');

  const admins = await api.adminListAdmins(cookieHeader);

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin accounts</h1>
      <p className="text-gray-500 mb-8">Super-admin only — create and review platform admin access.</p>
      <AdminAccountManager admins={admins} currentUserId={user.id} />
    </div>
  );
}
