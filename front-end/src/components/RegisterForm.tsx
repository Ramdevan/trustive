import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { LuMail, LuLock, LuCheck, LuUser, LuEye, LuEyeOff } from 'react-icons/lu';

const RegisterForm: React.FC = () => {
  const router = useRouter();

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [acceptedTerms, setAcceptedTerms] = React.useState(false);

  // Redirect if already logged in
  React.useEffect(() => {
    const token = localStorage.getItem('user_token');
    if (token) {
      router.replace('/dashboard');
    }
  }, [router]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!name || !name.trim()) {
      setError("Username is required");
      return;
    }

    if (!password) {
      setError("Password is required");
      return;
    }

    if (password.length < 8 || password.length > 15) {
      setError("Password must be between 8 and 15 characters long.");
      return;
    }

    if (!/[A-Z]/.test(password)) {
      setError("Password must contain at least one capital letter (A-Z).");
      return;
    }

    if (!/[0-9]/.test(password)) {
      setError("Password must contain at least one number (0-9).");
      return;
    }

    if (!/[!@#$%^&*(),.?":{}|<>\-_+=\[\]\\/~`]/.test(password)) {
      setError("Password must contain at least one special character.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    if (!acceptedTerms) {
      setError("You must accept the terms and conditions to create an account.");
      return;
    }

    setLoading(true);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

      const res = await fetch(`${API_URL}/api/user/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();

      if (data.status) {
        if (data.requireVerification) {
          // Email verification required - show success message and redirect to login
          setSuccess(data.msg || "Signup successful! Please check your email to verify your account.");
          setTimeout(() => {
            router.replace('/login');
          }, 4000);
        } else if (data.data?.token) {
          localStorage.setItem("user_token", data.data.token);
          localStorage.setItem("user_data", JSON.stringify(data.data.user));
          localStorage.setItem("user_last_activity", Date.now().toString());
          window.location.replace('/dashboard');
        }
      } else {
        setError(data.msg || "Registration failed");
      }
    } catch (err) {
      setError("Network error. Please try again.");
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
          alt="Register Background"
          fill
          priority
          className="object-cover"
        />
      </div>

      {/* Main Card */}
      <div className="w-full max-w-[70rem] grid grid-cols-1 md:grid-cols-2 rounded-[1.25rem] overflow-hidden bg-[#0f0c0b] shadow-2xl relative z-10 min-h-[auto] md:min-h-[42rem]">

        {/* Branding Section - Hidden on Mobile */}
        <div className="hidden md:flex flex-col items-center justify-center p-12 text-center space-y-10 border-r border-white/5 md:border-r-0">
          <h2 className="text-[2.25rem] font-medium text-[#FAF7F2] max-w-[26rem] leading-tight mt-4">
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
            <h1 className="text-[1.5rem] md:text-[2rem] font-normal text-[#FAF7F2]">Create New Account</h1>
            <p className="text-[0.875rem] font-normal text-[#FAF7F2]">Sign up to explore, play, and earn</p>
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest text-center">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-green-500/10 border border-green-500/20 text-green-400 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest text-center">
                {success}
              </div>
            )}
          </div>

          <form className="space-y-4" onSubmit={handleRegister}>
            {/* Name */}
            <div className="space-y-2">
              <label className="block text-[1rem] font-normal text-[#FAF7F2] ml-1">Username</label>
              <div className="relative group">
                <LuUser className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 md:h-6 md:w-6 text-[#FAF7F2] group-focus-within:text-accent transition-colors" />
                <input
                  type="text"
                  required
                  placeholder="Enter your username"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#0A0908] border border-white/5 rounded-[1.25rem] py-4 md:py-5 pl-14 pr-6 text-[1.125rem] md:text-[1.25rem] text-[#FAF7F2] focus:outline-none focus:border-accent/40 transition-all placeholder:text-zinc-700"
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <label className="block text-[1rem] font-normal text-[#FAF7F2] ml-1">Email</label>
              <div className="relative group">
                <LuMail className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 md:h-6 md:w-6 text-[#FAF7F2] group-focus-within:text-accent transition-colors" />
                <input
                  type="email"
                  required
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#0A0908] border border-white/5 rounded-[1.25rem] py-4 md:py-5 pl-14 pr-6 text-[1.125rem] md:text-[1.25rem] text-[#FAF7F2] focus:outline-none focus:border-accent/40 transition-all placeholder:text-zinc-700"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label className="block text-[1rem] font-normal text-[#FAF7F2] ml-1">Password</label>
              <div className="relative group">
                <LuLock className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 md:h-6 md:w-6 text-[#FAF7F2] group-focus-within:text-accent transition-colors" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#0A0908] border border-white/5 rounded-[1.25rem] py-4 md:py-5 pl-14 pr-14 text-[1.125rem] md:text-[1.25rem] text-[#FAF7F2] focus:outline-none focus:border-accent/40 transition-all placeholder:text-zinc-700"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors p-1 focus:outline-none cursor-pointer"
                  title={showPassword ? "Hide password" : "Show password"}
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
              <label className="block text-[1rem] font-normal text-[#FAF7F2] ml-1">Confirm Password</label>
              <div className="relative group">
                <LuLock className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 md:h-6 md:w-6 text-[#FAF7F2] group-focus-within:text-accent transition-colors" />
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`w-full bg-[#0A0908] border rounded-[1.25rem] py-4 md:py-5 pl-14 pr-14 text-[1.125rem] md:text-[1.25rem] text-[#FAF7F2] focus:outline-none transition-all placeholder:text-zinc-700 ${
                    isPasswordMismatch
                      ? "border-red-500/50 focus:border-red-500"
                      : "border-white/5 focus:border-accent/40"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(prev => !prev)}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors p-1 focus:outline-none cursor-pointer"
                  title={showConfirmPassword ? "Hide password" : "Show password"}
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

            <label className="flex items-center gap-3 ml-1 mt-6 cursor-pointer group/check w-fit">
              <div className="relative flex items-center">
                <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} className="peer appearance-none w-5 h-5 md:w-6 md:h-6 border border-[#FAF7F2] rounded-md checked:bg-accent checked:border-accent transition-all cursor-pointer" />
                <LuCheck className="absolute left-0.5 md:left-1 top-0.5 md:top-1 h-3.5 w-3.5 md:h-4 md:w-4 text-black opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none stroke-[3]" />
              </div>
              <span className="text-[0.875rem] md:text-[1rem] font-normal text-[#FAF7F2] select-none group-hover/check:text-accent transition-colors">
                Accept <span className="underline underline-offset-4 decoration-accent/30 hover:decoration-accent">terms and conditions</span>
              </span>
            </label>

            <button
              type="submit"
              disabled={loading || !acceptedTerms || isPasswordMismatch}
              className={`w-full font-bold py-4 md:py-5 rounded-[0.75rem] transition-all shadow-xl shadow-accent/5 active:scale-[0.98] text-[1.125rem] md:text-[1.25rem] ${acceptedTerms && !isPasswordMismatch ? 'bg-accent hover:bg-accent/90 text-black cursor-pointer' : 'bg-accent/30 text-black/50 cursor-not-allowed'} disabled:opacity-50`}
            >
              {loading ? "Creating Account..." : "Create Account"}
            </button>
          </form>

          <p className="text-center text-[0.875rem] md:text-[1rem] font-normal text-[#FAF7F2]">
            Already have an account? <Link href="/login" className="text-[#E5A93E] font-normal hover:underline underline-offset-6 decoration-[#E5A93E]">Login</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterForm;
