import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSessionRole } from "@/lib/session";

export function ComplaintNotification() {
  const { role, userId } = useSessionRole();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!userId || role === "treasurer") return;
    let active = true;
    const refresh = async () => {
      const result = await supabase.from("complaint_notifications").select("id", { count: "exact", head: true }).is("read_at", null);
      if (active) setCount(result.count ?? 0);
    };
    void refresh();
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("complaints-changed", refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("complaints-changed", refresh); };
  }, [role, userId]);
  if (!count || role === "treasurer") return null;
  return <Link to="/complaints" className="flex items-center gap-3 border-b border-border bg-accent px-5 py-3 text-sm text-accent-foreground"><Bell className="size-4 shrink-0" /><span>{count} new complaint {count === 1 ? "update" : "updates"}</span></Link>;
}