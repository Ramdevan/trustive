import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';

// Routes accessible only to unauthenticated/guest users
const GUEST_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password'];
const KYC_ROUTE = '/kyc';
const HOME_ROUTE = '/dashboard';
const LOGIN_ROUTE = '/login';

// Marks the history entry that sits directly below the app so back presses can be trapped
const PIN_BASE = 'base';
const PIN_LIVE = 'live';

interface AuthGuardProps {
  children: React.ReactNode;
}

const cleanPath = (url: string) => {
  const path = url.split('?')[0].split('#')[0];
  return path === '' ? '/' : path;
};

const getUserKycStatus = (): string => {
  try {
    const data = localStorage.getItem('user_data');
    if (!data) return 'unverified';
    const parsed = JSON.parse(data);
    return parsed.kyc_status || 'unverified';
  } catch {
    return 'unverified';
  }
};

const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes of inactivity

const isTokenExpired = (token: string): boolean => {
  try {
    const payloadBase64 = token.split('.')[1];
    if (!payloadBase64) return true;
    const base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const decoded = JSON.parse(jsonPayload);
    if (!decoded.exp) return false;
    // decoded.exp is in seconds
    return Date.now() >= decoded.exp * 1000;
  } catch {
    return true;
  }
};

const isIdleTimedOut = (): boolean => {
  try {
    const lastActivity = Number(localStorage.getItem('user_last_activity') || 0);
    if (!lastActivity) return false;
    return Date.now() - lastActivity > IDLE_TIMEOUT_MS;
  } catch {
    return false;
  }
};

const readToken = () => {
  try {
    const token = localStorage.getItem('user_token');
    if (!token) return null;
    if (isTokenExpired(token) || isIdleTimedOut()) {
      localStorage.removeItem('user_token');
      localStorage.removeItem('user_data');
      localStorage.removeItem('user_last_activity');
      return null;
    }
    return token;
  } catch {
    return null;
  }
};

const isGuestRoute = (path: string) => GUEST_ROUTES.includes(path);
// Root only ever bounces to login/dashboard, so treat it as a guest entry point
const isPublicRoute = (path: string) => isGuestRoute(path) || path === '/';

/**
 * AuthGuard component that protects route access:
 * - Redirects unauthenticated users to /login when attempting to access protected pages.
 * - Redirects authenticated users away from /login, /register and / to /dashboard.
 * - Pins a sacrificial history entry below the app so an authenticated user can never
 *   walk back past /dashboard into the login page (leaving logout as the only way out).
 */
const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const redirectingTo = useRef<string | null>(null);
  const pinned = useRef(false);

  const redirect = useCallback(
    (target: string) => {
      setAuthorized(false);
      if (redirectingTo.current === target) return;
      redirectingTo.current = target;
      // router.replace keeps the stack flat: the blocked entry is overwritten, not stacked on
      router
        .replace(target)
        .catch(() => { })
        .finally(() => {
          redirectingTo.current = null;
        });
    },
    [router]
  );

  /**
   * Duplicates the current history entry once per document load. The lower copy is flagged
   * as the "base": popping onto it means the user is trying to leave the authenticated app,
   * which handlePopState turns back into /dashboard instead of letting the browser unload
   * the page into the previous (login) document.
   */
  const pinHistory = useCallback(() => {
    if (pinned.current) return;
    pinned.current = true;

    const state = window.history.state || {};
    if (state.__trustivePin) return;

    window.history.replaceState({ ...state, __trustivePin: PIN_BASE }, '', window.location.href);
    window.history.pushState({ ...state, __trustivePin: PIN_LIVE }, '', window.location.href);
  }, []);

  const evaluateAuth = useCallback(
    (urlPath?: string) => {
      if (typeof window === 'undefined') return;

      const path = cleanPath(urlPath ?? (router.isReady ? router.asPath : window.location.pathname));
      const token = readToken();

      if (token) {
        const kycStatus = getUserKycStatus();
        const isVerified = kycStatus === 'verified';

        if (!isVerified) {
          // User is authenticated but KYC is not verified
          if (path === KYC_ROUTE) {
            setAuthorized(true);
            pinHistory();
          } else {
            redirect(KYC_ROUTE);
          }
        } else {
          // User is authenticated and KYC is verified
          if (path === KYC_ROUTE || isPublicRoute(path)) {
            redirect(HOME_ROUTE);
          } else {
            setAuthorized(true);
            pinHistory();
          }
        }
      } else {
        if (isGuestRoute(path)) {
          setAuthorized(true);
        } else {
          redirect(LOGIN_ROUTE);
        }
      }
    },
    [router, redirect, pinHistory]
  );

  useEffect(() => {
    evaluateAuth();

    const handleRouteChange = (url: string) => {
      evaluateAuth(url);
    };

    const handlePopState = () => {
      const token = readToken();
      const path = cleanPath(window.location.pathname);
      const poppedToBase = window.history.state?.__trustivePin === PIN_BASE;

      if (!token) {
        // Logged out: let the normal guard decide, protected entries bounce to /login
        evaluateAuth(path);
        return;
      }

      const kycStatus = getUserKycStatus();
      const isVerified = kycStatus === 'verified';
      const targetHome = isVerified ? HOME_ROUTE : KYC_ROUTE;

      if (poppedToBase || isPublicRoute(path) || (!isVerified && path !== KYC_ROUTE)) {
        setAuthorized(false);
        // Push a fresh entry (this also drops the forward entries, killing the
        // "back to login then forward into dashboard" bypass) and re-pin below it
        window.history.pushState({ __trustivePin: PIN_LIVE }, '', targetHome);
        router
          .replace(targetHome)
          .catch(() => { })
          .finally(() => evaluateAuth(targetHome));
        return;
      }

      // Ordinary in-app back/forward between protected pages stays allowed
      evaluateAuth(path);
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      // Page restored from bfcache: re-check, the token may have been cleared elsewhere
      if (event.persisted) {
        evaluateAuth();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        evaluateAuth();
      }
    };

    // Record user movement/activity
    let lastRecordedActivity = 0;
    const recordActivity = () => {
      const now = Date.now();
      // Throttle localStorage writes to once every 2 seconds
      if (now - lastRecordedActivity > 2000) {
        lastRecordedActivity = now;
        try {
          if (localStorage.getItem('user_token')) {
            localStorage.setItem('user_last_activity', now.toString());
          }
        } catch { }
      }
    };

    // Initialize last_activity if user has a token but no timestamp yet
    if (typeof window !== 'undefined' && localStorage.getItem('user_token') && !localStorage.getItem('user_last_activity')) {
      localStorage.setItem('user_last_activity', Date.now().toString());
    }

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click', 'wheel'];
    activityEvents.forEach((evt) => {
      window.addEventListener(evt, recordActivity, { passive: true });
    });

    // Check periodically for idle timeout (10 min of no movement) or token expiration
    const expiryInterval = setInterval(() => {
      const token = readToken();
      const currentPath = cleanPath(window.location.pathname);
      if (!token && !isGuestRoute(currentPath)) {
        evaluateAuth(currentPath);
      }
    }, 2500);

    router.events.on('routeChangeStart', handleRouteChange);
    router.events.on('routeChangeComplete', handleRouteChange);
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(expiryInterval);
      activityEvents.forEach((evt) => {
        window.removeEventListener(evt, recordActivity);
      });
      router.events.off('routeChangeStart', handleRouteChange);
      router.events.off('routeChangeComplete', handleRouteChange);
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [router, evaluateAuth]);

  // While checking auth or redirecting, do not render children to prevent content flash
  if (!authorized) {
    return null;
  }

  return <>{children}</>;
};

export default AuthGuard;
