import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { LuLock, LuEye, LuEyeOff, LuCircleCheck, LuArrowLeft, LuTriangleAlert } from 'react-icons/lu';

const ResetPasswordForm: React.FC = () => {
  const router = useRouter();
  const { token } = router.query;

  const [verifyingToken, setVerifyingToken] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenEmail, setTokenEmail] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;

    const verifyToken = async () => {
      if (!token || typeof token !== 'string') {
        setTokenValid(false);
        setError('Password reset token is missing or invalid.');
        setVerifyingToken(false);
        return;
      }

      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
        const res = await fetch(`${API_URL}/api/user/verify-reset-token?token=${encodeURIComponent(token)}`);
        const data = await res.json();

        if (data.status) {
          setTokenValid(true);
          setTokenEmail(data.email || null);
        } else {
          setTokenValid(false);
          setError(data.msg || 'The password reset link is invalid or has expired.');
        }
      } catch (err) {
        setTokenValid(false);
        setError('Network error while verifying reset link.');
      } finally {
        setVerifyingToken(false);
      }
    };

    verifyToken();
  }, [router.isReady, token]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!password) {
      setError('New password is required');
      return;
    }

    if (password.length < 8 || password.length > 15) {
      setError('Password must be between 8 and 15 characters long.');
      return;
    }

    if (!/[A-Z]/.test(password)) {
      setError('Password must contain at least one capital letter (A-Z).');
      return;
    }

    if (!/[0-9]/.test(password)) {
      setError('Password must contain at least one number (0-9).');
      return;
    }

    if (!/[!@#$%^&*(),.?":{}|<>\-_+=\[\]\\/~`]/.test(password)) {
      setError('Password must contain at least one special character.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setLoading(true);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/user/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          newPassword: password,
        }),
      });

      const data = await res.json();

      if (data.status) {
        setSuccess(data.msg || 'Password reset successfully! Redirecting to login...');
        setTimeout(() => {
          router.replace('/login');
        }, 2500);
      } else {
        setError(data.msg || 'Failed to reset password. Please try again.');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const isPasswordMismatch = Boolean(confirmPassword && password && confirmPassword !== password);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#000000] p-4 md:p-8 relative overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0 z-0 w-full h-full">
        <Image
          src="/assets/images/login-bg.svg"
          alt="Reset Password Background"
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
            Secure Your Account
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
          {verifyingToken ? (
            <div className="text-center py-12 space-y-4">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent mx-auto" />
              <p className="text-sm font-medium text-accent uppercase tracking-widest">Verifying reset link...</p>
            </div>
          ) : !tokenValid ? (
            <div className="space-y-6 text-center py-6">
              <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto border border-red-500/20">
                <LuTriangleAlert className="w-8 h-8 text-red-500" />
              </div>
              <div className="space-y-2">
                <h1 className="text-[1.5rem] font-bold text-white uppercase tracking-tight">Invalid or Expired Link</h1>
                <p className="text-[0.875rem] text-zinc-400 max-w-sm mx-auto">
                  {error || 'This password reset link is invalid or has already expired. Reset links are valid for 1 hour.'}
                </p>
              </div>
              <div className="space-y-3 pt-2">
                <Link
                  href="/forgot-password"
                  className="block w-full py-4 bg-accent hover:bg-accent/90 text-black font-bold text-sm uppercase rounded-xl transition-all shadow-lg text-center"
                >
                  Request New Reset Link
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
                >
                  <LuArrowLeft className="w-4 h-4" />
                  <span>Back to Login</span>
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-3 text-center">
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
                <h1 className="text-[1.5rem] md:text-[2rem] font-normal text-[#FAF7F2]">Create New Password</h1>
                <p className="text-[0.875rem] font-normal text-[#FAF7F2]/70">
                  {tokenEmail ? `Reset password for ${tokenEmail}` : 'Enter your new strong password below'}
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

              <form className="space-y-4" onSubmit={handleResetPassword}>
                {/* New Password */}
                <div className="space-y-2">
                  <label className="block text-[1rem] font-normal text-[#FAF7F2] ml-1">New Password</label>
                  <div className="relative group">
                    <LuLock className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 md:h-6 md:w-6 text-[#FAF7F2] group-focus-within:text-accent transition-colors" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="Enter new password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-[#0A0908] border border-white/5 rounded-[1.25rem] py-4 md:py-5 pl-14 pr-14 text-[1.125rem] md:text-[1.25rem] text-[#FAF7F2] focus:outline-none focus:border-accent/40 transition-all placeholder:text-zinc-700"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors p-1 focus:outline-none cursor-pointer"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <LuEyeOff className="h-5 w-5 md:h-6 md:w-6" />
                      ) : (
                        <LuEye className="h-5 w-5 md:h-6 md:w-6" />
                      )}
                    </button>
                  </div>
                  <p className="text-[0.75rem] text-zinc-500 px-2 leading-relaxed">
                    8–15 characters, at least 1 uppercase letter, 1 number, and 1 special character.
                  </p>
                </div>

                {/* Confirm Password */}
                <div className="space-y-2">
                  <label className="block text-[1rem] font-normal text-[#FAF7F2] ml-1">Confirm New Password</label>
                  <div className="relative group">
                    <LuLock className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 md:h-6 md:w-6 text-[#FAF7F2] group-focus-within:text-accent transition-colors" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={`w-full bg-[#0A0908] border rounded-[1.25rem] py-4 md:py-5 pl-14 pr-14 text-[1.125rem] md:text-[1.25rem] text-[#FAF7F2] focus:outline-none transition-all placeholder:text-zinc-700 ${
                        isPasswordMismatch
                          ? 'border-red-500/50 focus:border-red-500'
                          : 'border-white/5 focus:border-accent/40'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      className="absolute right-5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors p-1 focus:outline-none cursor-pointer"
                      title={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? (
                        <LuEyeOff className="h-5 w-5 md:h-6 md:w-6" />
                      ) : (
                        <LuEye className="h-5 w-5 md:h-6 md:w-6" />
                      )}
                    </button>
                  </div>
                  {isPasswordMismatch && (
                    <p className="text-xs text-red-400 font-medium px-2">Passwords do not match</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || Boolean(success)}
                  className="w-full bg-accent hover:bg-accent/90 text-black font-bold py-4 md:py-5 rounded-[0.75rem] transition-all shadow-xl shadow-accent/5 active:scale-[0.98] text-[1.125rem] md:text-[1.25rem] cursor-pointer disabled:opacity-50 mt-2"
                >
                  {loading ? 'Updating Password...' : 'Save New Password'}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordForm;
