"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function StakingRedirect() {
    const router = useRouter();
    useEffect(() => {
        router.replace("/admin/staking-transactions");
    }, [router]);

    return null;
}
