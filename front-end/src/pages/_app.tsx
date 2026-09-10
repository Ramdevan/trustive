// Polyfill for Node 22's broken global localStorage without --localstorage-file flag
if (typeof global !== "undefined" && global.localStorage && typeof global.localStorage.getItem !== "function") {
  (global.localStorage as any).getItem = () => null;
  (global.localStorage as any).setItem = () => { };
  (global.localStorage as any).removeItem = () => { };
}

import "@/styles/globals.css";
import "@rainbow-me/rainbowkit/styles.css";
import { useState, useEffect } from "react";
import type { AppProps } from "next/app";
import Head from "next/head";
import { Space_Grotesk } from "next/font/google";
import { Web3Provider } from "@/context/Web3Context";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { config } from "@/config/wagmi";
import { Toaster, ToastBar, toast } from "react-hot-toast";
import { LuX } from "react-icons/lu";
import AuthGuard from "@/components/AuthGuard";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

const queryClient = new QueryClient();

export default function App({ Component, pageProps }: AppProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <main className={`${spaceGrotesk.variable} font-sans`}>
        <div className="min-h-screen bg-black" />
      </main>
    );
  }

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme()}>
          <Web3Provider>
            <main className={`${spaceGrotesk.variable} font-sans`}>
              <Head>
                <title>Trustive</title>
              </Head>
              <AuthGuard>
                <Component {...pageProps} />
              </AuthGuard>
              <Toaster
                position="top-right"
                toastOptions={{
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
                    iconTheme: {
                      primary: '#E5A93E',
                      secondary: '#0D0D0D',
                    },
                    style: {
                      border: '1px solid rgba(16, 185, 129, 0.2)',
                    }
                  },
                  error: {
                    iconTheme: {
                      primary: '#EF4444',
                      secondary: '#0D0D0D',
                    },
                    style: {
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                    }
                  }
                }}
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
            </main>
          </Web3Provider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
