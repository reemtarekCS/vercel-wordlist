'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '../lib/auth';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const s = getSession();
    if (s) router.replace('/shared');
    else router.replace('/login');
  }, [router]);
  return <div />;
}
