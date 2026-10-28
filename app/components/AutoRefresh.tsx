"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Periodic server-data refetch so background sync results appear without a manual reload. */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), Math.max(10, seconds) * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
