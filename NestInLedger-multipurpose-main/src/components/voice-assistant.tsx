import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Mic, MicOff, Send, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { askAssistant, type AssistantReply } from "@/lib/assistant.functions";

type Msg = { from: "you" | "helper"; text: string; reply?: AssistantReply | undefined };
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error?: string }) => void) | null };

const languages = [["en-IN", "English"], ["te-IN", "తెలుగు"], ["hi-IN", "हिन्दी"]] as const;

export function VoiceAssistant() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [lang, setLang] = useState<string>("en-IN");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ from: "helper", text: "Hi, I am Nestbot! Ask about your dues, complaints or announcements, or tell me a problem to report. On iPhone, turn off the silent switch to hear my replies." }]);
  const rec = useRef<Recognition | null>(null);
  const [voiceOn, setVoiceOn] = useState(true);

  function listen(retry = 0) {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) { setMsgs((m) => [...m, { from: "helper", text: "Voice is not supported on this browser. Please type instead." }]); return; }
    stopSpeaking();
    unlockSpeech();
    if (listening && retry === 0) { rec.current?.stop(); return; }
    try { rec.current?.stop(); } catch { /* ignore */ }
    const r = new Ctor(); r.lang = lang; r.interimResults = true; r.continuous = !isIOS();
    let said = ""; let sent = false; let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => { if (sent) return; sent = true; clearTimeout(timer); r.stop(); if (said.trim()) void send(said.trim()); };
    r.onresult = (e) => {
      // Some phones return each growing phrase as a new result; keep only the newest version of overlapping phrases.
      const parts: string[] = [];
      for (const x of Array.from(e.results)) {
        const t = (x[0]?.transcript ?? "").trim(); if (!t) continue;
        const last = parts[parts.length - 1];
        if (last && t.toLowerCase().startsWith(last.toLowerCase())) parts[parts.length - 1] = t;
        else if (last && last.toLowerCase().startsWith(t.toLowerCase())) continue;
        else parts.push(t);
      }
      said = parts.join(" ");
      setText(said);
      clearTimeout(timer); timer = setTimeout(finish, 2000);
    };
    let retrying = false;
    r.onend = () => { if (retrying) return; setListening(false); finish(); };
    r.onerror = (e) => {
      clearTimeout(timer);
      const err = e?.error;
      // Speech service sometimes drops quietly or on weak internet: try again automatically once.
      if (!said.trim() && retry < 1 && (err === "network" || err === "audio-capture" || err === "no-speech")) {
        retrying = true; sent = true;
        setTimeout(() => listen(retry + 1), 400);
        return;
      }
      setListening(false);
      const name = languages.find(([v]) => v === lang)?.[1] ?? "This language";
      const msg = e?.error === "not-allowed" || e?.error === "service-not-allowed"
        ? "Microphone is blocked. Please allow microphone and Speech Recognition for this site in your phone settings."
        : e?.error === "language-not-supported"
          ? `${name} voice typing is not available on this phone. Please type, or turn on ${name} dictation in your phone's keyboard settings.`
          : e?.error === "aborted" ? ""
            : e?.error === "network" ? "Voice needs internet. Please check your connection and tap the mic again, or type your question."
              : e?.error === "no-speech" ? "I didn't hear anything. Tap the mic, wait for \"Listening…\", then speak a little louder."
                : "Could not hear you clearly. Please tap the mic and speak again, or type your question.";
      if (msg) setMsgs((m) => [...m, { from: "helper", text: msg }]);
    };
    rec.current = r; setListening(true);
    try { r.start(); } catch { setListening(false); }
  }

  function isIOS() { return typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent) || (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
  // iPhones only allow speech that starts from a tap; speak a silent word on tap so later replies can play.
  function unlockSpeech() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; window.speechSynthesis.speak(u); } catch { /* ignore */ }
  }
  function changeLang(v: string) {
    try { rec.current?.stop(); } catch { /* ignore */ }
    rec.current = null; setListening(false); setLang(v);
  }
  function stopSpeaking() { if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel(); }
  function speak(say: string) {
    if (!voiceOn || !say || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(say);
    u.lang = lang;
    const v = window.speechSynthesis.getVoices().find((x) => x.lang === lang) ?? window.speechSynthesis.getVoices().find((x) => x.lang.startsWith(lang.slice(0, 2)));
    if (v) u.voice = v;
    // iPhone Safari can stay paused after cancel; resume before speaking.
    window.speechSynthesis.resume();
    setTimeout(() => window.speechSynthesis.speak(u), isIOS() ? 50 : 0);
  }

  async function send(q = text) {
    if (!q.trim() || busy) return;
    setText(""); setBusy(true); setMsgs((m) => [...m, { from: "you", text: q }]);
    try { const reply = await askAssistant({ data: { question: q } }); setMsgs((m) => [...m, { from: "helper", text: reply.answer, reply }]); speak(reply.answer); }
    catch { const t = "Sorry, I could not answer just now."; setMsgs((m) => [...m, { from: "helper", text: t }]); speak(t); }
    finally { setBusy(false); }
  }

  async function submitComplaint(i: number) {
    const c = msgs[i]?.reply?.complaint; if (!c) return;
    setBusy(true);
    const r = await supabase.rpc("submit_complaint", { _flat: c.flatId, _title: c.title, _description: c.description, _category: c.category, _request: crypto.randomUUID() });
    setBusy(false);
    setMsgs((m) => m.map((x, j) => (j === i ? { ...x, reply: { ...x.reply!, complaint: null } } : x)).concat({ from: "helper", text: r.error ? `Could not submit: ${r.error.message}` : "Your complaint is submitted. The committee has been told.", reply: r.error ? undefined : { answer: "", link: "/complaints", complaint: null } }));
    window.dispatchEvent(new Event("complaints-changed"));
  }

  if (!open) return <Button className="fixed bottom-5 right-5 z-40 size-14 rounded-full shadow-lg" aria-label="Open Nestbot" onClick={() => setOpen(true)}><Sparkles className="size-6" /></Button>;
  return <div className="fixed bottom-4 right-4 z-40 flex h-[min(560px,80vh)] w-[min(380px,calc(100vw-2rem))] flex-col rounded-xl border border-border bg-card shadow-2xl">
    <div className="flex items-center justify-between border-b border-border p-3"><p className="font-semibold">Nestbot</p><div className="flex items-center gap-2"><select aria-label="Voice language" className="rounded-md border border-input bg-card px-2 py-1 text-xs" value={lang} onChange={(e) => changeLang(e.target.value)}>{languages.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><Button variant="ghost" size="icon" aria-label={voiceOn ? "Mute voice replies" : "Turn on voice replies"} onClick={() => { if (voiceOn) stopSpeaking(); else unlockSpeech(); setVoiceOn(!voiceOn); }}>{voiceOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}</Button><Button variant="ghost" size="icon" aria-label="Close Nestbot" onClick={() => { stopSpeaking(); setOpen(false); }}><X className="size-4" /></Button></div></div>
    <div className="flex-1 space-y-3 overflow-y-auto p-3 text-sm">{msgs.map((m, i) => <div key={i} className={m.from === "you" ? "ml-8 rounded-lg bg-primary p-2 text-primary-foreground" : "mr-8 rounded-lg bg-muted p-2"}>
      {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
      {m.reply?.link && <Button asChild size="sm" className="mt-2"><Link to={m.reply.link} onClick={() => setOpen(false)}>Go to {m.reply.linkLabel ?? "page"} →</Link></Button>}
      {m.reply?.complaint && <div className="mt-2 rounded-md border border-border bg-card p-2"><p className="font-medium">{m.reply.complaint.title}</p><p className="text-xs text-muted-foreground">{m.reply.complaint.category}</p><p className="mt-1 text-xs">{m.reply.complaint.description}</p><Button size="sm" className="mt-2" disabled={busy} onClick={() => submitComplaint(i)}>Submit complaint</Button></div>}
    </div>)}{busy && <p className="text-muted-foreground">Thinking…</p>}</div>
    <form className="flex gap-2 border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); unlockSpeech(); void send(); }}>
      <Button type="button" variant={listening ? "destructive" : "outline"} size="icon" aria-label={listening ? "Stop listening" : "Speak"} onClick={() => listen()}>{listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}</Button>
      <input className="min-w-0 flex-1 rounded-lg border border-input bg-card px-3 text-sm" placeholder={listening ? "Listening…" : "Type or tap the mic"} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
      <Button type="submit" size="icon" aria-label="Send" disabled={busy || !text.trim()}><Send className="size-4" /></Button>
    </form>
  </div>;
}
