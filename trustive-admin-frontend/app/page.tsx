"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // For now, redirect to login if not authenticated, or dashboard if authenticated
    // We'll add better logic later
    const adminToken = localStorage.getItem("admin_token");
    router.push(adminToken ? "/admin/dashboard" : "/admin/login");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background text-white">
      <div className="animate-pulse">Redirecting to Secure Gateway...</div>
    </div>
  );
}
