'use client';

import { Suspense, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useUserStore } from '@/store/user.store';
import { validateReturnTo } from '@/lib/validate-return-to';

/** Inner form — isolated so useSearchParams() gets its own Suspense boundary. */
function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const setUser = useUserStore((s) => s.setUser);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const result = await api.login({ email, password });
        setUser({
          id: result.user.id,
          email: result.user.email,
          role: result.user.role as 'CUSTOMER' | 'ADMIN',
        });
        const returnTo = validateReturnTo(params.get('returnTo'));
        router.push(returnTo);
        router.refresh();
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('An unexpected error occurred');
        }
      }
    });
  }

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <Image src="/login.avif" alt="ShopNest logo" width={64} height={64} className="mx-auto mb-4 rounded-xl" />
        <h2 className="text-3xl font-bold text-gray-900">Welcome back</h2>
        <p className="mt-2 text-gray-600">Sign in to your account</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="••••••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-indigo-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-600">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-indigo-600 font-medium hover:text-indigo-700">
          Create one
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex">
      {/* Left panel — hero image */}
      <div className="hidden lg:flex lg:w-1/2 relative">
        <Image
          src="/login-bg.jpg"
          alt="ShopNest store interior"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-indigo-900/60 flex items-center justify-center">
          <div className="text-white text-center px-8">
            <h1 className="text-5xl font-bold mb-4">ShopNest</h1>
            <p className="text-xl text-indigo-200">Your modern e-commerce experience</p>
          </div>
        </div>
      </div>

      {/* Right panel — form (wrapped in Suspense for useSearchParams) */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <Suspense fallback={<div className="w-full max-w-md text-center text-gray-400">Loading…</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
