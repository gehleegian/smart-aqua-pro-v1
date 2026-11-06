'use client';

import { useEffect } from 'react';
import { savePendingInvite } from '../../../services/orgContext';

export default function InviteLanding({ token }: { token: string }) {
  useEffect(() => {
    if (/^[A-Za-z0-9_-]{20,200}$/.test(token)) savePendingInvite(token);
    window.location.replace('/');
  }, [token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-center text-slate-200">
      <p>Opening your SmartAqua Pro invite… Log in or sign up with the invited email to accept it.</p>
    </main>
  );
}
