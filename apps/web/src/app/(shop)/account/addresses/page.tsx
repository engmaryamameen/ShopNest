import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { AddressBook } from '@/components/shop/address-book';

export const dynamic = 'force-dynamic';

export default async function AddressesPage() {
  const cookieHeader = (await cookies()).toString();

  let addresses;
  try {
    addresses = await api.listAddresses(cookieHeader);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect('/login?returnTo=/account/addresses');
    }
    throw err;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Addresses</h1>
      <p className="text-gray-500 mb-8">Manage your saved shipping addresses.</p>
      <AddressBook addresses={addresses} />
    </div>
  );
}
