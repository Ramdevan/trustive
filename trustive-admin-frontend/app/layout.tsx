// Polyfill for Node 22's broken global localStorage without --localstorage-file flag
if (typeof global !== "undefined" && global.localStorage && typeof global.localStorage.getItem !== "function") {
  (global.localStorage as any).getItem = () => null;
  (global.localStorage as any).setItem = () => { };
  (global.localStorage as any).removeItem = () => { };
}

import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import AdminLayout from "@/components/AdminLayout";
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Toaster } from 'react-hot-toast';

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Trustive Administrator Panel",
  description: "Administrative dashboard for Trustive ICO and Staking platform",
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
      { url: "/images/logo.png", type: "image/png" },
      { url: "/favicon.ico" }
    ],
    apple: "/images/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <Providers>
          <AdminLayout>
            {children}
          </AdminLayout>
          <ToastContainer
            theme="dark"
            position="top-right"
            autoClose={4000}
            hideProgressBar={false}
            newestOnTop
            closeOnClick
            pauseOnHover
          />
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
