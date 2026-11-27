import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { AcceptInviteAction } from '@/components/vendor/accept-invite-action';

export const dynamic = 'force-dynamic';

export default async function VendorStaffAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const cookieHeader = (await cookies()).toString();

  if (!token) {
    return (
      <div className="max-w-md mx-auto bg-white rounded-xl border border-gray-200 p-8 text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Invalid invite link</h1>
        <p className="text-gray-500">This invite link is missing its token. Ask the vendor owner to resend it.</p>
      </div>
    );
  }

  try {
    await api.me(cookieHeader);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect(`/login?returnTo=${encodeURIComponent(`/vendor/staff/accept?token=${token}`)}`);
    }
    throw err;
  }

  return (
    <div className="max-w-md mx-auto bg-white rounded-xl border border-gray-200 p-8 text-center">
      <h1 className="text-xl font-bold text-gray-900 mb-2">Join the team</h1>
      <p className="text-gray-500 mb-6">Accept this invite to start managing offers and orders for this vendor.</p>
      <AcceptInviteAction token={token} />
    </div>
  );
}
