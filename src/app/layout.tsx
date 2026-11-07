import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SmartAqua Pro',
  // PWA: on iPhone, web push only works for an app added to the Home Screen.
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: 'SmartAqua', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }, { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: { url: '/icons/apple-touch-icon.png', sizes: '180x180' },
  },
};

export const viewport: Viewport = { themeColor: '#0f766e' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
