import type { Metadata } from 'next';
import '@fontsource/poppins/300.css';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import '@fontsource/lato/100.css';
import '@fontsource/lato/300.css';
import '@fontsource/lato/400.css';
import '@fontsource/lato/700.css';
import '@fontsource/lato/900.css';
import '@fontsource/lato/100-italic.css';
import '@fontsource/lato/300-italic.css';
import '@fontsource/lato/400-italic.css';
import '@fontsource/lato/700-italic.css';
import '@fontsource/lato/900-italic.css';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/playwrite-au-sa';
import '@fontsource-variable/inter';
import '@fontsource-variable/nunito';
import '@fontsource-variable/plus-jakarta-sans';

import './globals.css';

import { Providers } from './providers';

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
    <html lang="en">
      <body className="min-h-screen bg-gray-50 font-lato antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}