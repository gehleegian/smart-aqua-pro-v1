'use client';

import dynamic from 'next/dynamic';

// The app uses Firebase and browser storage on load, so it only runs in the browser.
const Layout = dynamic(() => import('./Layout'), { ssr: false });

export default function AppClient() {
  return <Layout />;
}
