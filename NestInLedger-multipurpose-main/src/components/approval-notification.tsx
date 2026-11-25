import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSessionRole } from "@/lib/session";

export function ApprovalNotification() {
  const { role } = useSessionRole();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (role !== "president" && role !== "secretary") return;
    let active = true;
    const refresh = async () => {
      const { count: n } = await supabase.from("change_proposals").select("id", { count: "exact", head: true }).eq("status", "pending");
      if (active) setCount(n ?? 0);
    };
    void refresh();
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("approvals-changed", refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("approvals-changed", refresh); };
  }, [role]);
  if (!count || (role !== "president" && role !== "secretary")) return null;
  return <Link to="/approvals" className="flex items-center gap-3 border-b border-border bg-accent px-5 py-3 text-sm text-accent-foreground"><Bell className="size-4 shrink-0" /><span>{count} {count === 1 ? "change" : "changes"} {role === "president" ? "need your approval" : "waiting for President approval"}</span></Link>;
}