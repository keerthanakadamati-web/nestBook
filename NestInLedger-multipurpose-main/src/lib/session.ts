import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { primaryRole, type Role } from "@/lib/permissions";
export type { Role } from "@/lib/permissions";

type SessionInfo = { userId: string | null; email: string | null; role: Role; name: string | null; societyName: string | null };

// One shared lookup per signed-in user, reused across page switches.
// Display only: the database still checks permissions on every request.
let cached: { key: string | null; promise: Promise<SessionInfo> } | null = null;
let last: SessionInfo | null = null;

async function fetchInfo(): Promise<SessionInfo> {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return { userId: null, email: null, role: null, name: null, societyName: null };
  const [roles, profile, society] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", user.id),
    supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
    supabase.rpc("my_society"),
  ]);
  return {
    userId: user.id,
    email: user.email ?? null,
    role: primaryRole(roles.data ?? []),
    name: profile.data?.full_name?.trim() || null,
    societyName: society.data?.[0]?.name ?? null,
  };
}

export function loadSessionInfo(): Promise<SessionInfo> {
  if (!cached) {
    const promise = fetchInfo().then((info) => { last = info; return info; });
    cached = { key: null, promise };
    promise.catch(() => { cached = null; });
  }
  return cached.promise;
}

export function clearSessionCache() { cached = null; last = null; }

if (typeof window !== "undefined") {
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
      if (event === "SIGNED_IN" && last?.userId) return;
      clearSessionCache();
    }
  });
}

export function useSessionRole() {
  const [info, setInfo] = useState<SessionInfo | null>(last);

  useEffect(() => {
    let active = true;
    loadSessionInfo().then((i) => { if (active) setInfo(i); });
    return () => { active = false; };
  }, []);

  return {
    loading: info === null,
    userId: info?.userId ?? null,
    email: info?.email ?? null,
    role: info?.role ?? null,
    name: info?.name ?? null,
    societyName: info?.societyName ?? null,
  };
}

export async function signOutEverything() {
  const { disableThisDevice } = await import("@/lib/push-client");
  await disableThisDevice().catch(() => undefined);
  clearSessionCache();
  await supabase.auth.signOut();
}
