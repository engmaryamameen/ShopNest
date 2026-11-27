import { cookies } from 'next/headers';
import { api, ApiError } from '@/lib/api';
import { VendorApplyForm } from '@/components/vendor/vendor-apply-form';
import { VendorDashboard } from '@/components/vendor/vendor-dashboard';

export const dynamic = 'force-dynamic';

const STATUS_COPY: Record<string, { title: string; body: string }> = {
  PENDING: {
    title: 'Application under review',
    body: "Thanks for applying! An admin is reviewing your application. You'll be able to list products as soon as it's approved.",
  },
  REJECTED: {
    title: 'Application not approved',
    body: 'Your vendor application was not approved. Contact support if you believe this was a mistake.',
  },
  SUSPENDED: {
    title: 'Account suspended',
    body: 'Your vendor account is currently suspended and cannot list or fulfil orders. Contact support for details.',
  },
};

export default async function VendorHomePage() {
  const cookieHeader = (await cookies()).toString();

  try {
    const vendor = await api.vendorMe(cookieHeader);

    if (vendor.status !== 'APPROVED') {
      const copy = STATUS_COPY[vendor.status];
      return (
        <div className="max-w-xl bg-white rounded-xl border border-gray-200 p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{copy.title}</h1>
          <p className="text-gray-500">{copy.body}</p>
        </div>
      );
    }

    const analytics = await api.vendorAnalytics(cookieHeader);
    return <VendorDashboard vendor={vendor} analytics={analytics} />;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return <VendorApplyForm />;
    }
    throw err;
  }
}
