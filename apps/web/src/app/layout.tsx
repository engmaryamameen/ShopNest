import type { Metadata } from 'next';
import {
  Lato,
  Plus_Jakarta_Sans,
  Poppins,
} from 'next/font/google';

import './globals.css';

import { Providers } from './providers';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta',
  display: 'swap',
});

const lato = Lato({
  subsets: ['latin'],
  weight: ['100', '300', '400', '700', '900'],
  style: ['normal', 'italic'],
  variable: '--font-lato',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ShopNest — Modern E-Commerce',
  description: 'A production-grade TypeScript e-commerce platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`
        ${poppins.variable}
        ${plusJakartaSans.variable}
        ${lato.variable}
      `}
    >
      <body className="min-h-screen bg-gray-50 font-lato antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}