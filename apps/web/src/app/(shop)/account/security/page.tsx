import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { RevokeSessionButton } from '@/components/shop/revoke-session-button';
import { ResendVerificationButton } from '@/components/shop/resend-verification-button';

export const dynamic = 'force-dynamic';

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function AccountSecurityPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  let sessions;
  let me;
  try {
    [sessions, me] = await Promise.all([api.listSessions(cookieHeader), api.me(cookieHeader)]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect('/login?returnTo=/account/security');
    }
    throw err;
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Security</h1>
      <p className="text-gray-500 mb-8">Manage your email verification and active sessions.</p>

      {!me.user.emailVerifiedAt && (
        <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-amber-900">Your email address isn&apos;t verified yet</p>
            <p className="text-sm text-amber-700 mt-0.5">
              Check {me.user.email} for a verification link, or request a new one.
            </p>
          </div>
          <ResendVerificationButton email={me.user.email} />
        </div>
      )}

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Active sessions</h2>
        <p className="text-sm text-gray-500 mb-4">
          Every device currently signed in to your account. Revoking a session immediately signs
          that device out.
        </p>

        <div className="space-y-3">
          {sessions.length === 0 && (
            <p className="text-sm text-gray-500">No active sessions.</p>
          )}

          {sessions.map((session) => (
            <div
              key={session.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900 truncate">
                    {session.label ?? 'Unknown device'}
                  </p>
                  {session.isCurrent && (
                    <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                      This device
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  Last active {formatWhen(session.lastSeenAt)}
                  {session.ipAddress ? ` · ${session.ipAddress}` : ''}
                </p>
              </div>

              <RevokeSessionButton sessionId={session.id} isCurrent={session.isCurrent} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
