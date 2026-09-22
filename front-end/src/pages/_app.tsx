// Polyfill for Node 22's broken global localStorage without --localstorage-file flag
if (typeof global !== "undefined" && global.localStorage && typeof global.localStorage.getItem !== "function") {
  (global.localStorage as any).getItem = () => null;
  (global.localStorage as any).setItem = () => { };
  (global.localStorage as any).removeItem = () => { };
}

import "@/styles/globals.css";
import "@rainbow-me/rainbowkit/styles.css";
import "react-toastify/dist/ReactToastify.css";
import { useState, useEffect } from "react";
import type { AppProps } from "next/app";
import Head from "next/head";
import { useRouter } from "next/router";
import { Inter, Manrope } from "next/font/google";
import { Web3Provider } from "@/context/Web3Context";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { config } from "@/config/wagmi";
import { Toaster, ToastBar, toast } from "react-hot-toast";
import { ToastContainer } from "react-toastify";
import { LuX } from "react-icons/lu";
import AuthGuard from "@/components/AuthGuard";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

const queryClient = new QueryClient();

const TOAST_OPTIONS = {
  duration: 5000,
  style: {
    background: '#0D0D0D',
    color: '#FFFFFF',
    border: '1px solid rgba(229, 169, 62, 0.2)',
    padding: '16px',
    borderRadius: '16px',
    fontSize: '14px',
    fontWeight: '600',
    maxWidth: '26rem',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(229, 169, 62, 0.05)',
  },
  success: {
    duration: 5000,
    iconTheme: {
      primary: '#E5A93E',
      secondary: '#0D0D0D',
    },
    style: {
      border: '1px solid rgba(16, 185, 129, 0.2)',
    },
  },
  error: {
    duration: 5000,
    iconTheme: {
      primary: '#EF4444',
      secondary: '#0D0D0D',
    },
    style: {
      border: '1px solid rgba(239, 68, 68, 0.2)',
    },
  },
};

import AdminLayout from "@/components/AdminLayout";

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  const pathname = router.pathname || router.asPath.split("?")[0];
  const isOwnerOrAdmin = pathname.startsWith("/owner") || pathname.startsWith("/admin");
  const isPortal = pathname === "/portal";

  useEffect(() => {
    setMounted(true);

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event?.reason;
      const message = typeof reason === 'string' ? reason : (reason?.message || reason?.shortMessage || '');
      if (
        message.includes('Failed to connect to MetaMask') ||
        message.includes('User rejected the request') ||
        message.includes('User denied transaction signature') ||
        message.includes('ConnectorNotFoundError') ||
        message.includes('ResourceUnavailableRpcError')
      ) {
        event.preventDefault();
        console.warn('[Wallet] Handled extension rejection:', message);
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  }, []);

  // Dismiss any active toast notifications when navigating between pages
  useEffect(() => {
    const handleRouteChange = () => {
      toast.dismiss();
    };
    router.events.on('routeChangeStart', handleRouteChange);
    return () => {
      router.events.off('routeChangeStart', handleRouteChange);
    };
  }, [router]);

  if (!mounted) {
    return (
      <main className={`${inter.variable} ${manrope.variable} font-sans`}>
        <div className="min-h-screen bg-white" />
      </main>
    );
  }

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme()}>
          <Web3Provider>
            <main className={`${inter.variable} ${manrope.variable} font-sans`}>
              <Head>
                <title>Trustive</title>
              </Head>
              {isOwnerOrAdmin ? (
                <AdminLayout>
                  <Component {...pageProps} />
                </AdminLayout>
              ) : isPortal ? (
                <Component {...pageProps} />
              ) : (
                <AuthGuard>
                  <Component {...pageProps} />
                </AuthGuard>
              )}
              <Toaster
                position="top-right"
                toastOptions={TOAST_OPTIONS}
              >
                {/* Every toast carries a dismiss button so a message can be cut
                    short instead of waiting for it to time out. */}
                {(t) => (
                  // position has to be passed through: a custom renderer does not
                  // inherit the Toaster's, and the enter/exit animation uses it.
                  <ToastBar toast={t} position="top-right">
                    {({ icon, message }) => (
                      <>
                        {icon}
                        {message}
                        {t.type !== 'loading' && (
                          <button
                            onClick={() => toast.dismiss(t.id)}
                            aria-label="Dismiss notification"
                            title="Dismiss"
                            className="shrink-0 ml-2 -mr-1 grid h-6 w-6 place-items-center self-start rounded-full border border-white/15 bg-white/5 text-white/70 hover:text-white hover:bg-white/15 hover:border-white/30 transition-colors cursor-pointer"
                          >
                            <LuX className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </ToastBar>
                )}
              </Toaster>
              <ToastContainer
                position="top-right"
                autoClose={4000}
                hideProgressBar={false}
                newestOnTop={true}
                closeOnClick={true}
                pauseOnHover={true}
                theme="dark"
              />
            </main>
          </Web3Provider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
