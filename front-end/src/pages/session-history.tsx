import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import AuthGuard from '@/components/AuthGuard';
import { LuHistory, LuArrowLeft } from 'react-icons/lu';
import { useWeb3 } from '@/context/Web3Context';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

interface SessionRecord {
  id?: number;
  ip: string;
  country: string;
  os: string;
  browser: string;
  login_time: string;
}

export default function SessionHistoryPage() {
  const router = useRouter();
  const { account, isConnected } = useWeb3();
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessionHistory = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('user_token');
      const url = account
        ? `${API_URL}/api/user/session-history?address=${encodeURIComponent(account)}`
        : `${API_URL}/api/user/session-history`;

      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.status && Array.isArray(data.history)) {
        setSessions(data.history);
      }
    } catch (err) {
      console.error('Session history fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('user_token');
    if (!token) {
      router.replace('/login');
      return;
    }
    fetchSessionHistory();
  }, []);

  useEffect(() => {
    if (isConnected && account) {
      fetchSessionHistory();
    }
  }, [account, isConnected]);

  return (
    <AuthGuard>
      <Layout>
        <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
          {/* Breadcrumb / Top Bar */}
          <div className="flex items-center justify-between">
            <Link
              href="/profile"
              className="inline-flex items-center gap-2 text-xs font-bold text-zinc-500 hover:text-zinc-900 transition-colors uppercase tracking-wider"
            >
              <LuArrowLeft className="w-4 h-4" />
              <span>Back to Profile</span>
            </Link>
          </div>

          {/* Recent Activity Card */}
          <div className="bg-white rounded-3xl border border-zinc-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6 sm:p-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                <LuHistory className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Recent Activity</h1>
                <p className="text-xs text-zinc-500">Monitor active and previous login sessions for your account</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-zinc-200/90 shadow-sm">
              <table className="w-full text-left border-collapse min-w-[38rem]">
                <thead>
                  <tr className="bg-[#111827] text-white text-xs sm:text-sm font-semibold">
                    <th className="px-6 py-4 text-left">IP Address</th>
                    <th className="px-6 py-4 text-left">Country</th>
                    <th className="px-6 py-4 text-left">OS</th>
                    <th className="px-6 py-4 text-left">Browser</th>
                    <th className="px-6 py-4 text-left">Login Time</th>
                  </tr>
                </thead>
                <tbody className="text-sm text-zinc-700 divide-y divide-zinc-100">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-zinc-400">
                        <div className="inline-flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
                          <span>Loading session history...</span>
                        </div>
                      </td>
                    </tr>
                  ) : sessions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-zinc-400">
                        No login history found
                      </td>
                    </tr>
                  ) : (
                    sessions.map((item, idx) => (
                      <tr key={item.id || idx} className="hover:bg-zinc-50/70 transition-colors">
                        <td className="px-6 py-4 font-medium text-zinc-800">{item.ip || '127.0.0.1'}</td>
                        <td className="px-6 py-4 text-zinc-600">{item.country || ''}</td>
                        <td className="px-6 py-4 text-zinc-700">{item.os || 'Linux x86_64'}</td>
                        <td className="px-6 py-4 text-zinc-700">{item.browser || 'Chrome'}</td>
                        <td className="px-6 py-4 text-zinc-600 font-mono text-xs sm:text-sm">{item.login_time}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Layout>
    </AuthGuard>
  );
}
