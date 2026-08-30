import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { VendorStaffManager } from '@/components/vendor/vendor-staff-manager';

export const dynamic = 'force-dynamic';

export default async function VendorStaffPage() {
  const cookieHeader = (await cookies()).toString();

  try {
    const vendor = await api.vendorMe(cookieHeader);
    if (vendor.status !== 'APPROVED') redirect('/vendor');
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) redirect('/vendor');
    throw err;
  }

  const [{ user }, staff] = await Promise.all([api.me(cookieHeader), api.vendorListStaff(cookieHeader)]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Team</h1>
      <VendorStaffManager staff={staff} currentUserId={user.id} />
    </div>
  );
}
