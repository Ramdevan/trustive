import { useEffect } from "react";
import { useRouter } from "next/router";

export default function OwnerIndex() {
    const router = useRouter();
    useEffect(() => {
        router.replace("/owner/dashboard");
    }, [router]);
    return null;
}
