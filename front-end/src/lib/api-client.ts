import { toast } from "react-toastify";

const API_BASE =
    process.env.NEXT_PUBLIC_ADMIN_API_URL ||
    (process.env.NEXT_PUBLIC_API_URL
        ? `${process.env.NEXT_PUBLIC_API_URL}/api/admin`
        : "http://localhost:3007/api/admin");

export async function apiRequest(endpoint: string, options: RequestInit = {}) {
    const token = typeof window !== "undefined" ? localStorage.getItem("admin_token") : null;

    const headers = {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        ...options.headers,
    };

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers,
        });

        if (response.status === 401) {
            handleUnauthorized();
            throw new Error("Session expired. Please login again.");
        }

        const data = await response.json();
        return data;
    } catch (error: any) {
        console.error("Admin API Request Error:", error);
        throw error;
    }
}

function handleUnauthorized() {
    if (typeof window !== "undefined") {
        localStorage.removeItem("admin_token");
        if (!(window as any)._authToastShown) {
            (window as any)._authToastShown = true;
            toast.error("Session expired. Logging out...", {
                onClose: () => {
                    (window as any)._authToastShown = false;
                    window.dispatchEvent(new Event("unauthorized"));
                }
            });

            setTimeout(() => {
                window.dispatchEvent(new Event("unauthorized"));
            }, 3000);
        }
    }
}
