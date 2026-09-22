import React from "react";

export function UsdtIcon({ className = "w-5 h-5" }: { className?: string }) {
    return (
        <svg viewBox="0 0 32 32" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="16" fill="#26A17B" />
            <path
                d="M17.5 12.8V10.5H23V7.5H9V10.5H14.5V12.8C10.7 13.1 7.8 14.3 7.8 15.8C7.8 17.3 10.7 18.5 14.5 18.8V25.5H17.5V18.8C21.3 18.5 24.2 17.3 24.2 15.8C24.2 14.3 21.3 13.1 17.5 12.8ZM16 17.4C12.4 17.4 9.5 16.3 9.5 15.8C9.5 15.3 12.4 14.2 16 14.2C19.6 14.2 22.5 15.3 22.5 15.8C22.5 16.3 19.6 17.4 16 17.4Z"
                fill="white"
            />
        </svg>
    );
}

export function UsdcIcon({ className = "w-5 h-5" }: { className?: string }) {
    return (
        <svg viewBox="0 0 32 32" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="16" fill="#2775CA" />
            <path
                d="M16 6.5C10.75 6.5 6.5 10.75 6.5 16C6.5 21.25 10.75 25.5 16 25.5C21.25 25.5 25.5 21.25 25.5 16C25.5 10.75 21.25 6.5 16 6.5ZM16 23.5C11.86 23.5 8.5 20.14 8.5 16C8.5 11.86 11.86 8.5 16 8.5C20.14 8.5 23.5 11.86 23.5 16C23.5 20.14 20.14 23.5 16 23.5Z"
                fill="white"
                fillOpacity="0.35"
            />
            <path
                d="M19.5 17.8C19.5 16.3 18.5 15.7 16.3 15.4C14.7 15.1 14.3 14.8 14.3 14.1C14.3 13.5 14.9 13 16 13C17 13 17.6 13.3 17.8 14.1H19.3C19 12.8 18 12 16.8 11.8V10H15.2V11.8C13.8 12 12.8 12.9 12.8 14.1C12.8 15.6 13.8 16.2 16 16.5C17.5 16.8 18 17.1 18 17.8C18 18.5 17.3 19 16.2 19C14.9 19 14.2 18.4 14 17.5H12.4C12.6 18.9 13.7 19.8 15.2 20.1V22H16.8V20.1C18.3 19.9 19.5 19 19.5 17.8Z"
                fill="white"
            />
        </svg>
    );
}

export function TrustiveIcon({ className = "w-5 h-5" }: { className?: string }) {
    return (
        <svg viewBox="0 0 32 32" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="16" fill="#E5B258" />
            <path
                d="M11 8H17.5C19.9853 8 22 10.0147 22 12.5C22 14.9853 19.9853 17 17.5 17H14V24H11V8ZM14 11V14H17.5C18.3284 14 19 13.3284 19 12.5C19 11.6716 18.3284 11 17.5 11H14Z"
                fill="#0A0908"
            />
        </svg>
    );
}

export function BnbIcon({ className = "w-5 h-5" }: { className?: string }) {
    return (
        <svg viewBox="0 0 32 32" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="16" fill="#F3BA2F" />
            <path
                d="M12.116 14.404L16 10.52l3.886 3.886 2.26-2.26L16 6 9.856 12.144l2.26 2.26zm-6.116 1.596l2.26-2.26 2.26 2.26-2.26 2.26-2.26-2.26zm6.116 1.596L16 21.48l3.886-3.886 2.26 2.262L16 26l-6.144-6.144 2.26-2.26zm7.768-1.596l2.26-2.26 2.26 2.26-2.26 2.26-2.26-2.26zm-5.508 0L16 14.38l1.624 1.62-1.624 1.624-1.624-1.624z"
                fill="white"
            />
        </svg>
    );
}

export function CryptoIcon({ coin, className = "w-5 h-5" }: { coin: string; className?: string }) {
    const symbol = (coin || "").toUpperCase().trim();
    if (symbol === "BNB" || symbol.includes("BNB") || symbol.includes("BINANCE")) {
        return <BnbIcon className={className} />;
    }
    if (symbol === "USDT" || symbol.includes("USDT") || symbol.includes("TETHER")) {
        return <UsdtIcon className={className} />;
    }
    if (symbol === "USDC" || symbol.includes("USDC")) {
        return <UsdcIcon className={className} />;
    }
    if (symbol === "TRSIV" || symbol.includes("TRSIV") || symbol === "TRUSTIVE" || symbol.includes("TRUSTIVE") || symbol.includes("PTC")) {
        return <TrustiveIcon className={className} />;
    }
    return <BnbIcon className={className} />;
}
