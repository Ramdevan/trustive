import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { LuMail, LuLock, LuCheck, LuEye, LuEyeOff } from 'react-icons/lu';

const LoginForm: React.FC = () => {
  const router = useRouter();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const [require2FA, setRequire2FA] = React.useState(false);
  const [twoFaCode, setTwoFaCode] = React.useState("");

  const [success, setSuccess] = React.useState<string | null>(null);

  // Redirect if already logged in
  React.useEffect(() => {
    const token = localStorage.getItem('user_token');
    if (token) {
      router.replace('/dashboard');
    }
  }, [router]);

  React.useEffect(() => {
    if (router.query.registered === 'true') {
      setSuccess("Registration successful! Please sign in with your email and password.");
      setError(null);
    } else if (router.query.verified === 'true') {
      setSuccess("Email verified successfully! You can now log in.");
      setError(null);
    } else if (router.query.verified === 'error') {
      setError("The email verification link is invalid or has expired.");
      setSuccess(null);
    }
  }, [router.query]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

      const res = await fetch(`${API_URL}/api/user/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email, 
          password,
          twoFaCode: require2FA ? twoFaCode : undefined
        })
      });
      const data = await res.json();

      if (data.status) {
        if (data.require2FA) {
          setRequire2FA(true);
          setLoading(false);
        } else {
          localStorage.setItem("user_token", data.data.token);
          localStorage.setItem("user_data", JSON.stringify(data.data.user));
          localStorage.setItem("user_last_activity", Date.now().toString());
          try {
            Object.keys(localStorage).forEach((key) => {
              if (key.startsWith('wagmi.') || key.startsWith('rk-') || key.startsWith('wc@') || key === 'walletconnect') {
                localStorage.removeItem(key);
              }
            });
          } catch (e) { }
          window.location.replace('/dashboard');
        }
      } else {
        setError(data.msg || "Invalid credentials");
      }
    } catch (err) {
      setError("Network error. Please try again.");
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
          alt="Login Background"
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
            Own a token backed by real world assets
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
        <div className="flex flex-col justify-center p-8 md:p-16 space-y-6 bg-white shadow-[0_10px_40px_rgba(0,0,0,0.06)] border border-zinc-200/80 rounded-[1.25rem]">
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
            <h1 className="text-[1.5rem] md:text-[2rem] font-bold text-zinc-900">Happy to see you again!</h1>
            <p className="text-[0.875rem] font-medium text-zinc-500">Sign in to continue your journey</p>
            {success && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest text-center">
                {success}
              </div>
            )}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest text-center animate-pulse">
                {error}
              </div>
            )}
          </div>

          <form className="space-y-4" onSubmit={handleLogin}>
            {!require2FA ? (
              <>
                {/* Email */}
                <div className="space-y-2">
                  <label className="block text-[1rem] font-medium text-zinc-700 ml-1">Email</label>
                  <div className="relative group">
                    <LuMail className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 md:h-6 md:w-6 text-zinc-400 group-focus-within:text-[#212E73] transition-colors" />
                    <input
                      type="email"
                      required
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-[1.25rem] py-4 md:py-5 pl-14 pr-6 text-[1.125rem] md:text-[1.25rem] text-zinc-900 focus:outline-none focus:border-[#212E73] focus:ring-2 focus:ring-[#212E73]/10 transition-all placeholder:text-zinc-400 font-medium"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <label className="block text-[1rem] font-medium text-zinc-700 ml-1">Password</label>
                  <div className="relative group">
                    <LuLock className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 md:h-6 md:w-6 text-zinc-400 group-focus-within:text-[#212E73] transition-colors" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-[1.25rem] py-4 md:py-5 pl-14 pr-14 text-[1.125rem] md:text-[1.25rem] text-zinc-900 focus:outline-none focus:border-[#212E73] focus:ring-2 focus:ring-[#212E73]/10 transition-all placeholder:text-zinc-400 font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(prev => !prev)}
                      className="absolute right-5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 transition-colors p-1 focus:outline-none cursor-pointer"
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <LuEyeOff className="h-5 w-5 md:h-6 md:w-6" />
                      ) : (
                        <LuEye className="h-5 w-5 md:h-6 md:w-6" />
                      )}
                    </button>
                  </div>
                  <div className="flex justify-end pr-1">
                    <Link href="/forgot-password" className="text-[0.875rem] md:text-[1rem] font-medium text-[#212E73] hover:underline transition-colors cursor-pointer">
                      Forget Password?
                    </Link>
                  </div>
                </div>

                <label className="flex items-center gap-3 ml-1 mt-6 md:mt-10 cursor-pointer group/check w-fit">
                  <div className="relative flex items-center">
                    <input type="checkbox" className="peer appearance-none w-5 h-5 md:w-6 md:h-6 border border-zinc-300 rounded-md checked:bg-[#212E73] checked:border-[#212E73] transition-all cursor-pointer" />
                    <LuCheck className="absolute left-0.5 md:left-1 top-0.5 md:top-1 h-3.5 w-3.5 md:h-4 md:w-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none stroke-[3]" />
                  </div>
                  <span className="text-[0.875rem] md:text-[1rem] font-medium text-zinc-600 select-none group-hover/check:text-zinc-900 transition-colors">Remember Password</span>
                </label>
              </>
            ) : (
              <div className="space-y-6 pt-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-4">
                  <label className="block text-center text-[1.25rem] font-bold text-[#212E73] uppercase tracking-[4px]">Verification Code</label>
                  <p className="text-center text-zinc-500 text-sm font-medium uppercase tracking-widest">Enter the 6-digit code from your app</p>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    autoFocus
                    placeholder="000000"
                    value={twoFaCode}
                    onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, ""))}
                    className="w-full bg-zinc-50 border-2 border-zinc-300 rounded-[1.25rem] py-6 text-zinc-900 text-center text-3xl font-black tracking-[1.5rem] focus:outline-none focus:border-[#212E73] transition-all placeholder:text-zinc-300"
                  />
                </div>
                <button 
                    type="button" 
                    onClick={() => setRequire2FA(false)}
                    className="w-full text-zinc-500 hover:text-zinc-900 transition-colors text-xs font-bold uppercase tracking-widest"
                >
                    Back to Login
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#212E73] hover:bg-[#16225B] text-white font-bold py-4 md:py-5 rounded-[0.75rem] transition-all shadow-xl shadow-[#212E73]/20 active:scale-[0.98] text-[1.125rem] md:text-[1.25rem] cursor-pointer disabled:opacity-50"
            >
              {loading ? "Authenticating..." : "Login"}
            </button>
          </form>

          <p className="text-center text-[0.875rem] md:text-[1rem] font-normal text-zinc-600">
            Don't have an account? <Link href="/register" className="text-[#212E73] font-bold hover:underline">Sign up</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;
