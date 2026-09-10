import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { LuMail, LuArrowLeft, LuCircleCheck } from 'react-icons/lu';

const ForgotPasswordForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email) {
      setError('Please enter your email address');
      return;
    }

    setLoading(true);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/user/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();

      if (data.status) {
        setSuccess(data.msg || 'Password reset link sent! Please check your email inbox (and spam folder).');
      } else {
        setError(data.msg || 'Failed to send reset link. Please verify your email.');
      }
    } catch (err) {
      setError('Network error. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#000000] p-4 md:p-8 relative overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0 z-0 w-full h-full">
        <Image
          src="/assets/images/login-bg.svg"
          alt="Forgot Password Background"
          fill
          priority
          className="object-cover"
        />
      </div>

      {/* Main Card */}
      <div className="w-full max-w-[70rem] grid grid-cols-1 md:grid-cols-2 rounded-[1.25rem] overflow-hidden bg-[#0f0c0b] shadow-2xl relative z-10 min-h-[auto] md:min-h-[42rem]">
        {/* Branding Section - Hidden on Mobile */}
        <div className="hidden md:flex flex-col items-center justify-center p-12 text-center space-y-10 border-r border-white/5 md:border-r-0">
          <h2 className="text-[2.25rem] font-medium text-[#FAF7F2] max-w-[26rem] leading-tight mt-0">
            Account Recovery
          </h2>

          <div className="relative max-w-[25rem] max-h-[25rem] transition-transform duration-700 flex flex-col items-center">
            <video
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-contain"
            >
              <source src="/assets/images/trustive-logo-rotate.mp4" type="video/mp4" />
            </video>
            <h1 className="text-[4rem] font-bold text-[#FAF7F2] mt-4 uppercase">Trustive</h1>
          </div>
        </div>

        {/* Form Section */}
        <div className="flex flex-col justify-center p-8 md:p-16 space-y-6 bg-[#141312] rounded-[1.25rem]">
          <div className="space-y-4 text-center">
            {/* Mobile Logo */}
            <div className="flex justify-center md:hidden mb-4">
              <Image
                src="/assets/images/logo.svg"
                alt="Logo"
                width={110}
                height={110}
                className="object-contain"
              />
            </div>
            <h1 className="text-[1.5rem] md:text-[2rem] font-normal text-[#FAF7F2]">Forgot Password</h1>
            <p className="text-[0.875rem] font-normal text-[#FAF7F2]/70 max-w-sm mx-auto">
              Enter your registered email address and we will send you a verification link to reset your password.
            </p>

            {success && (
              <div className="bg-green-500/10 border border-green-500/20 text-green-400 p-4 rounded-xl text-xs font-semibold leading-relaxed text-center flex items-center gap-3">
                <LuCircleCheck className="w-5 h-5 shrink-0 text-green-400" />
                <span>{success}</span>
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-widest text-center animate-shake">
                {error}
              </div>
            )}
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* Email */}
            <div className="space-y-2">
              <label className="block text-[1rem] font-normal text-[#FAF7F2] ml-1">Email Address</label>
              <div className="relative group">
                <LuMail className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 md:h-6 md:w-6 text-[#FAF7F2] group-focus-within:text-accent transition-colors" />
                <input
                  type="email"
                  required
                  placeholder="Enter your registered email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#0A0908] border border-white/5 rounded-[1.25rem] py-4 md:py-5 pl-14 pr-6 text-[1.125rem] md:text-[1.25rem] text-[#FAF7F2] focus:outline-none focus:border-accent/40 transition-all placeholder:text-zinc-700"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent hover:bg-accent/90 text-black font-bold py-4 md:py-5 rounded-[0.75rem] transition-all shadow-xl shadow-accent/5 active:scale-[0.98] text-[1.125rem] md:text-[1.25rem] cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Sending Verification Email...' : 'Send Reset Link'}
            </button>
          </form>

          <div className="pt-2 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-[0.875rem] md:text-[1rem] font-normal text-zinc-400 hover:text-accent transition-colors"
            >
              <LuArrowLeft className="w-4 h-4" />
              <span>Back to Login</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordForm;
