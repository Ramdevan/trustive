import React, { useEffect, useState, useRef } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { LuShieldCheck, LuLogOut, LuRefreshCw, LuCircleCheck, LuCircleAlert } from 'react-icons/lu';

declare global {
  interface Window {
    snsWebSdk?: {
      init: (accessToken: string, tokenRefreshCallback: () => Promise<string>) => any;
    };
  }
}

export default function KycPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [isDevFallback, setIsDevFallback] = useState(false);
  const [devMessage, setDevMessage] = useState<string | null>(null);
  const [user, setUser] = useState<{ id?: number; name?: string; email?: string } | null>(null);
  const sdkInitialized = useRef(false);

  // Fetch token and user profile
  const fetchToken = async (): Promise<string | null> => {
    const token = localStorage.getItem('user_token');
    if (!token) {
      router.replace('/login');
      return null;
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3007';
      const res = await fetch(`${apiUrl}/api/user/sumsub-token`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();

      if (data.status) {
        if (data.kyc_status === 'verified') {
          // User already verified: update cache and navigate straight to dashboard
          try {
            const cached = JSON.parse(localStorage.getItem('user_data') || '{}');
            cached.kyc_status = 'verified';
            localStorage.setItem('user_data', JSON.stringify(cached));
          } catch { }
          window.location.replace('/dashboard');
          return null;
        }

        if (data.isDevFallback) {
          setIsDevFallback(true);
          setDevMessage(data.msg || 'Sumsub API keys are in preview/development mode.');
        }

        return data.token;
      } else {
        setError(data.msg || 'Failed to initialize verification session.');
        return null;
      }
    } catch (err: any) {
      setError('Unable to communicate with verification service.');
      return null;
    }
  };

  const handleKycSuccess = async () => {
    setIsVerified(true);

    // 1. Immediately notify the backend database to mark KYC verified
    try {
      const token = localStorage.getItem('user_token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3007';
      await fetch(`${apiUrl}/api/user/confirm-kyc-success`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
    } catch (e) {
      console.error('Failed to notify backend of KYC verification:', e);
    }

    // 2. Update local cached user data
    try {
      const cached = JSON.parse(localStorage.getItem('user_data') || '{}');
      cached.kyc_status = 'verified';
      localStorage.setItem('user_data', JSON.stringify(cached));
    } catch { }

    setTimeout(() => {
      window.location.replace('/dashboard');
    }, 1200);
  };

  const handleSimulateApproval = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('user_token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3007';
      const res = await fetch(`${apiUrl}/api/user/test-verify-kyc`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (data.status) {
        handleKycSuccess();
      } else {
        setError(data.msg || 'Simulation failed');
      }
    } catch (err: any) {
      setError(err.message || 'Error simulating verification');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user_token');
    localStorage.removeItem('user_data');
    localStorage.removeItem('user_last_activity');
    router.replace('/login');
  };

  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('user_data') || '{}');
      setUser(cached);
      if (cached.kyc_status === 'verified') {
        router.replace('/dashboard');
        return;
      }
    } catch { }

    let scriptElement: HTMLScriptElement | null = null;

    const initializeSumsubSdk = async () => {
      setLoading(true);
      setError(null);

      const accessToken = await fetchToken();
      if (!accessToken) {
        setLoading(false);
        return;
      }

      // If in dev fallback, don't try to load the live Sumsub SDK with a mock token
      if (accessToken.startsWith('mock-sumsub-token-')) {
        setLoading(false);
        return;
      }

      // Inject Sumsub WebSDK script if not present
      if (!window.snsWebSdk) {
        scriptElement = document.createElement('script');
        scriptElement.src = 'https://static.sumsub.com/idensic/static/sns-websdk-builder.js';
        scriptElement.async = true;
        scriptElement.onload = () => {
          launchSdk(accessToken);
        };
        scriptElement.onerror = () => {
          setError('Failed to load Sumsub WebSDK script. Please check your internet connection.');
          setLoading(false);
        };
        document.body.appendChild(scriptElement);
      } else {
        launchSdk(accessToken);
      }
    };

    const launchSdk = (token: string) => {
      if (!window.snsWebSdk || sdkInitialized.current) return;
      sdkInitialized.current = true;

      try {
        const cachedUser = JSON.parse(localStorage.getItem('user_data') || '{}');
        const snsWebSdkInstance = window.snsWebSdk.init(
          token,
          async () => {
            const freshToken = await fetchToken();
            return freshToken || token;
          }
        )
        .withConf({
          lang: 'en',
          email: cachedUser.email || '',
          externalUserId: cachedUser.id?.toString() || 'user'
        })
        .on('idCheck.onApplicantStatusChanged', (payload: any) => {
          const isApproved =
            (payload?.reviewStatus === 'completed' && payload?.reviewResult?.reviewAnswer === 'GREEN') ||
            payload?.reviewAnswer === 'GREEN' ||
            payload?.reviewResult?.reviewAnswer === 'GREEN';
          if (isApproved) {
            handleKycSuccess();
          }
        })
        .on('idCheck.onApplicantSubmitted', async () => {
          // Check with backend if applicant was approved
          try {
            const token = localStorage.getItem('user_token');
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3007';
            const res = await fetch(`${apiUrl}/api/user/kyc-status`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            const st = await res.json();
            if (st.kyc_status === 'verified') {
              handleKycSuccess();
            }
          } catch { }
        })
        .on('idCheck.onError', (error: any) => {
          console.warn('Sumsub SDK error:', error);
        })
        .build();

        snsWebSdkInstance.launch('#sumsub-websdk-container');
        setLoading(false);
      } catch (err: any) {
        console.error('Failed to launch Sumsub SDK:', err);
        setError('Error initializing Sumsub verification module.');
        setLoading(false);
      }
    };

    initializeSumsubSdk();

    return () => {
      if (scriptElement && scriptElement.parentNode) {
        scriptElement.parentNode.removeChild(scriptElement);
      }
    };
  }, []);

  return (
    <>
      <Head>
        <title>Identity Verification (KYC) | Trustive</title>
        <meta name="description" content="Complete your Sumsub identity verification to access Trustive platform." />
      </Head>

      <div className="min-h-screen bg-[#000000] text-zinc-900 relative flex flex-col justify-between overflow-x-hidden">
        {/* Background Overlay */}
        <div className="absolute inset-0 z-0 opacity-40">
          <Image
            src="/assets/images/login-bg.svg"
            alt="Background"
            fill
            priority
            className="object-cover"
          />
        </div>

        {/* Top Header */}
        <header className="relative z-10 w-full max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/assets/images/logo.svg"
              alt="Trustive"
              width={130}
              height={36}
              className="object-contain"
            />
          </div>

          <div className="flex items-center gap-4">
            {user?.email && (
              <span className="text-zinc-400 text-xs md:text-sm font-medium hidden sm:inline">
                {user.email}
              </span>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              <LuLogOut className="w-3.5 h-3.5" />
              <span>Log out</span>
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="relative z-10 w-full max-w-4xl mx-auto px-4 py-8 flex-1 flex flex-col items-center justify-center">
          <div className="w-full bg-white rounded-[2rem] border border-zinc-200 shadow-[0_20px_60px_rgba(0,0,0,0.15)] overflow-hidden">
            
            {/* Banner / Title Header */}
            <div className="p-8 md:p-10 border-b border-zinc-100 bg-gradient-to-b from-zinc-50/80 to-white text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#212E73]/10 text-[#212E73] mb-4 shadow-sm">
                <LuShieldCheck className="w-8 h-8" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 tracking-tight">
                Identity Verification
              </h1>
              <p className="text-sm md:text-base text-zinc-500 max-w-md mx-auto mt-2 font-medium">
                To comply with international regulations and ensure asset security, please verify your identity via Sumsub.
              </p>
            </div>

            {/* Verification Content */}
            <div className="p-6 md:p-10">
              {isVerified ? (
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in zoom-in-95">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                    <LuCircleCheck className="w-10 h-10" />
                  </div>
                  <h2 className="text-xl font-bold text-zinc-900">Verification Approved!</h2>
                  <p className="text-sm text-zinc-500 font-medium">
                    Your KYC has been confirmed. Redirecting to your dashboard...
                  </p>
                </div>
              ) : error ? (
                <div className="p-6 rounded-2xl bg-red-50 border border-red-200 text-center space-y-4">
                  <div className="inline-flex p-3 rounded-full bg-red-100 text-red-600">
                    <LuCircleAlert className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-red-900">Verification Session Error</h3>
                  <p className="text-sm text-red-700 font-medium">{error}</p>
                  <button
                    onClick={() => {
                      sdkInitialized.current = false;
                      window.location.reload();
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#212E73] hover:bg-[#16225B] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    <LuRefreshCw className="w-4 h-4" />
                    Retry Verification
                  </button>
                </div>
              ) : isDevFallback ? (
                <div className="p-6 md:p-8 rounded-2xl bg-zinc-50 border border-zinc-200 text-center space-y-6">
                  <div className="space-y-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-bold uppercase tracking-wider">
                      Sumsub Integration Active
                    </span>
                    <h3 className="text-lg font-bold text-zinc-900">Development / Sandbox Notice</h3>
                    <p className="text-xs md:text-sm text-zinc-600 max-w-lg mx-auto font-medium">
                      {devMessage || 'Your backend Sumsub service is running. Add your production/sandbox credentials to back-end/.env to render the live Sumsub WebSDK.'}
                    </p>
                  </div>

                  <div className="p-4 bg-white rounded-xl border border-zinc-200 text-left text-xs font-mono text-zinc-700 space-y-1">
                    <p><strong className="text-zinc-900">Status:</strong> Connected to Trustive Backend</p>
                    <p><strong className="text-zinc-900">Level Name:</strong> basic-kyc-level</p>
                    <p><strong className="text-zinc-900">User ID:</strong> {user?.id || '—'}</p>
                    <p><strong className="text-zinc-900">Webhook Route:</strong> POST /api/user/webhooks/sumsub</p>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={handleSimulateApproval}
                      disabled={loading}
                      className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold uppercase tracking-wider shadow-lg shadow-emerald-600/20 transition-all cursor-pointer flex items-center justify-center gap-2 mx-auto disabled:opacity-50"
                    >
                      <LuCircleCheck className="w-5 h-5" />
                      {loading ? 'Confirming...' : 'Simulate & Approve KYC (Test Mode)'}
                    </button>
                    <p className="text-[11px] text-zinc-400 mt-2 font-medium">
                      Clicking will mark your account verified in the database and proceed to the dashboard.
                    </p>
                  </div>
                </div>
              ) : (
                <div>
                  {loading && (
                    <div className="py-16 text-center space-y-3">
                      <div className="animate-spin w-10 h-10 border-4 border-[#212E73] border-t-transparent rounded-full mx-auto" />
                      <p className="text-sm font-bold uppercase tracking-wider text-zinc-500">
                        Initializing Sumsub Verification SDK...
                      </p>
                    </div>
                  )}
                  {/* Sumsub WebSDK Container */}
                  <div id="sumsub-websdk-container" className="min-h-[400px] w-full" />
                </div>
              )}
            </div>

            {/* Footer Notice */}
            <div className="px-8 py-4 bg-zinc-50 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-zinc-400 font-medium">
              <span>Trustive Security & Regulatory Compliance</span>
              <span>Encrypted & Verified via Sumsub</span>
            </div>
          </div>
        </main>

        <footer className="relative z-10 py-6 text-center text-xs text-zinc-500 font-medium">
          &copy; {new Date().getFullYear()} Trustive. All rights reserved.
        </footer>
      </div>
    </>
  );
}
