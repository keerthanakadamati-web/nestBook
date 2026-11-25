import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export function ProfileNameForm({ userId, initialName }: { userId: string; initialName: string | null }) {
  const [name, setName] = useState(initialName ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const { error } = await supabase
      .from("profiles")
      .upsert({ user_id: userId, full_name: name.trim() }, { onConflict: "user_id" });
    setMessage(error ? "Could not save the name. Please try again." : "Name saved.");
    setBusy(false);
  }

  return (
    <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={save}>
      <label className="grid gap-1 text-sm">
        <span className="text-muted-foreground">Display name</span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name not set"
          aria-label="Display name"
          className="w-64"
        />
      </label>
      <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save name"}</Button>
      {message && <p className="w-full text-sm">{message}</p>}
    </form>
  );
}
