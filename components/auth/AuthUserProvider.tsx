"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type AuthUserProfile = {
  id: string;
  email: string;
  avatarUrl: string | null;
  plan: string;
  locale: string | null;
};

type AuthUserContextValue = {
  ready: boolean;
  user: AuthUserProfile | null;
  refresh: () => Promise<AuthUserProfile | null>;
};

const AUTH_USER_FALLBACK: AuthUserContextValue = {
  ready: true,
  user: null,
  refresh: async () => null,
};
const AuthUserContext = createContext<AuthUserContextValue>(AUTH_USER_FALLBACK);
const USER_FETCH_TTL_MS = 30_000;

export function AuthUserProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUserProfile | null>(null);
  const readyRef = useRef(false);
  const userRef = useRef<AuthUserProfile | null>(null);
  const fetchedAtRef = useRef(0);
  const inFlightRef = useRef<Promise<AuthUserProfile | null> | null>(null);
  const requestVersionRef = useRef(0);

  const loadUser = useCallback(async (force = false): Promise<AuthUserProfile | null> => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      readyRef.current = true;
      userRef.current = null;
      setReady(true);
      setUser(null);
      return null;
    }

    if (!force && readyRef.current && Date.now() - fetchedAtRef.current < USER_FETCH_TTL_MS) {
      return userRef.current;
    }
    if (inFlightRef.current) {
      return force
        ? inFlightRef.current.then(() => loadUser(true))
        : inFlightRef.current;
    }

    const requestVersion = requestVersionRef.current;
    const request = fetch("/api/auth/user", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load the authenticated user.");
        const data = (await response.json()) as { user?: AuthUserProfile | null };
        return data.user ?? null;
      })
      .then((nextUser) => {
        if (requestVersion === requestVersionRef.current) {
          fetchedAtRef.current = Date.now();
          readyRef.current = true;
          userRef.current = nextUser;
          setUser(nextUser);
          setReady(true);
        }
        return nextUser;
      })
      .catch(() => {
        if (requestVersion === requestVersionRef.current) {
          readyRef.current = true;
          setReady(true);
        }
        return null;
      })
      .finally(() => {
        inFlightRef.current = null;
      });

    inFlightRef.current = request;
    return request;
  }, []);

  const refresh = useCallback(() => loadUser(true), [loadUser]);

  useEffect(() => {
    void loadUser();

    let cancelled = false;
    let stopAuthListener: () => void = () => undefined;

    import("@/lib/supabase-client")
      .then(({ createSupabaseBrowserClient }) => {
        if (cancelled) return;
        const supabase = createSupabaseBrowserClient();
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
          if (event === "INITIAL_SESSION") return;
          if (event === "SIGNED_OUT") {
            requestVersionRef.current += 1;
            fetchedAtRef.current = Date.now();
            readyRef.current = true;
            userRef.current = null;
            setUser(null);
            setReady(true);
            return;
          }
          void loadUser(true);
        });
        stopAuthListener = () => subscription.unsubscribe();
      })
      .catch(() => undefined);

    function onAvatarChange() {
      void loadUser(true);
    }
    function onVisibilityChange() {
      if (document.visibilityState === "visible") void loadUser();
    }
    function onWindowFocus() {
      void loadUser();
    }

    window.addEventListener("finfold-avatar-change", onAvatarChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onWindowFocus);

    return () => {
      cancelled = true;
      stopAuthListener();
      window.removeEventListener("finfold-avatar-change", onAvatarChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onWindowFocus);
    };
  }, [loadUser]);

  const value = useMemo(() => ({ ready, user, refresh }), [ready, refresh, user]);
  return <AuthUserContext.Provider value={value}>{children}</AuthUserContext.Provider>;
}

export function useAuthUser(): AuthUserContextValue {
  return useContext(AuthUserContext);
}
