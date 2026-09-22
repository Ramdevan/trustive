import { useEffect } from "react";
import { useRouter } from "next/router";

export default function OwnerProfileRedirect() {
    const router = useRouter();
    useEffect(() => {
        router.replace("/owner/security-profile");
    }, [router]);
    return null;
}
