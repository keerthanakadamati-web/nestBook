import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Maximize, Wallet, ShieldCheck, Receipt, MessageSquare, Bot, Bell, FileText, Users, Vote, PhoneCall, Smartphone, CheckCircle2, Building2, LifeBuoy } from "lucide-react";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "NestInLedger — Smart Apartment Management | Presentation" },
      { name: "description", content: "See how NestInLedger runs maintenance, payments, approvals, complaints and reports for apartment societies." },
      { property: "og:title", content: "NestInLedger — Smart Apartment Management" },
      { property: "og:description", content: "A quick tour of every NestInLedger feature for apartment committees and residents." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Deck,
});

function Frame({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return (
    <div className={`w-[1920px] h-[1080px] relative overflow-hidden px-[120px] py-[100px] ${dark ? "bg-primary text-primary-foreground" : "bg-background text-foreground"}`}>
      <div className="absolute -right-40 -top-40 w-[700px] h-[700px] rounded-full bg-accent/20 blur-3xl" />
      <div className="relative h-full flex flex-col">{children}</div>
      <div className="absolute bottom-10 left-[120px] text-[22px] font-semibold tracking-[0.15em] uppercase opacity-60">NestInLedger</div>
    </div>
  );
}
function Kicker({ children }: { children: ReactNode }) { return <div className="text-[24px] font-bold uppercase tracking-[0.14em] text-accent mb-6">{children}</div>; }
function Title({ children }: { children: ReactNode }) { return <h2 className="text-[80px] font-extrabold leading-[1.05] tracking-tight mb-12">{children}</h2>; }
function Card({ icon: I, title, text }: { icon: typeof Wallet; title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-border bg-card text-card-foreground p-10 shadow-lg">
      <div className="w-20 h-20 rounded-2xl bg-accent/15 text-accent flex items-center justify-center mb-6"><I size={44} /></div>
      <div className="text-[36px] font-bold mb-3">{title}</div>
      <div className="text-[28px] leading-snug text-muted-foreground">{text}</div>
    </div>
  );
}
function Grid({ items }: { items: [typeof Wallet, string, string][] }) {
  return <div className="grid grid-cols-3 gap-10">{items.map(([i, t, x]) => <Card key={t} icon={i} title={t} text={x} />)}</div>;
}

const slides: { title: string; el: ReactNode }[] = [
  { title: "Welcome", el: (
    <Frame dark>
      <div className="m-auto text-center">
        <div className="mx-auto mb-10 w-32 h-32 rounded-3xl bg-accent text-accent-foreground flex items-center justify-center"><Building2 size={72} /></div>
        <h1 className="text-[120px] font-extrabold tracking-tight leading-none">NestInLedger</h1>
        <p className="text-[44px] mt-8 opacity-90">Your apartment society — run simply, clearly and honestly.</p>
        <p className="text-[30px] mt-6 opacity-70">Maintenance · Payments · Complaints · Reports · All in one app</p>
      </div>
    </Frame>) },
  { title: "The problem", el: (
    <Frame>
      <Kicker>Why societies need this</Kicker>
      <Title>Running a society today is messy</Title>
      <Grid items={[[Wallet, "Lost cash records", "Notebooks and Excel sheets make dues hard to track."], [MessageSquare, "WhatsApp chaos", "Complaints and notices get buried in group chats."], [ShieldCheck, "No transparency", "Residents can't easily see where money is spent."]]} />
    </Frame>) },
  { title: "Maintenance & payments", el: (
    <Frame>
      <Kicker>Money made simple</Kicker>
      <Title>Maintenance & Payments</Title>
      <Grid items={[[Wallet, "Monthly bills", "Each flat's dues are created automatically every month."], [Smartphone, "Pay by UPI or cash", "Residents pay online; committee records cash in one tap."], [Receipt, "Instant receipts", "A clear, printable receipt for every payment."]]} />
    </Frame>) },
  { title: "Approvals", el: (
    <Frame>
      <Kicker>Trust built in</Kicker>
      <Title>Every rupee is approved</Title>
      <Grid items={[[CheckCircle2, "Treasurer confirms", "Collected maintenance is checked by the Treasurer."], [ShieldCheck, "President approves", "Expenses need President approval — Secretary as backup."], [FileText, "Full history", "Every change is saved and can never be secretly edited."]]} />
    </Frame>) },
  { title: "Residents", el: (
    <Frame>
      <Kicker>For every resident</Kicker>
      <Title>Residents see only their own flat</Title>
      <Grid items={[[Users, "My flat", "Own dues, payments and tenants — private and secure."], [MessageSquare, "Complaints", "Raise issues with photos and follow every step."], [Bell, "Reminders", "Email and phone alerts until dues are paid."]]} />
    </Frame>) },
  { title: "Community", el: (
    <Frame>
      <Kicker>Community features</Kicker>
      <Title>A connected society</Title>
      <Grid items={[[Vote, "Polls & voting", "Decide together with simple online votes."], [PhoneCall, "Emergency directory", "Plumbers, electricians and emergency numbers in one place."]]} />
    </Frame>) },
  { title: "Reports", el: (
    <Frame>
      <Kicker>Clear accounts</Kicker>
      <Title>Reports anyone can understand</Title>
      <Grid items={[[FileText, "PDF & Excel", "Monthly and yearly reports with charts."], [ShieldCheck, "Locked once approved", "Approved reports can never be changed."], [Wallet, "Corporate fund", "See the society's savings at a glance."]]} />
    </Frame>) },
  { title: "Nestbot", el: (
    <Frame>
      <Kicker>Smart helper</Kicker>
      <Title>Meet Nestbot — just ask</Title>
      <Grid items={[[Bot, "Talk or type", "Ask in English, Telugu or Hindi."], [FileText, "Finds anything", "Takes you straight to the right page or document."], [LifeBuoy, "Tech support", "Committee can raise help requests with screenshots."]]} />
    </Frame>) },
  { title: "Get started", el: (
    <Frame dark>
      <div className="m-auto text-center">
        <h2 className="text-[100px] font-extrabold tracking-tight">Ready to simplify your society?</h2>
        <p className="text-[40px] mt-8 opacity-90">Works on any phone · Install like an app · Your data stays yours</p>
        <p className="text-[44px] mt-14 font-bold text-accent">nestinledger.com</p>
      </div>
    </Frame>) },
];

function Deck() {
  const [i, setI] = useState(0);
  const [scale, setScale] = useState(0.3);
  const box = useRef<HTMLDivElement>(null);
  const touch = useRef<number | null>(null);
  const go = useCallback((d: number) => setI((v) => Math.max(0, Math.min(slides.length - 1, v + d))), []);

  useEffect(() => {
    const n = Number(new URLSearchParams(window.location.search).get("slide"));
    if (n >= 1 && n <= slides.length) setI(n - 1);
  }, []);
  useEffect(() => {
    const u = new URL(window.location.href); u.searchParams.set("slide", String(i + 1));
    window.history.replaceState(null, "", u);
    document.title = `${i + 1}/${slides.length} — ${slides[i]!.title} | NestInLedger`;
  }, [i]);
  useEffect(() => {
    const fit = () => { const el = box.current; if (el) setScale(Math.min(el.clientWidth / 1920, el.clientHeight / 1080)); };
    fit(); const ro = new ResizeObserver(fit); if (box.current) ro.observe(box.current);
    const key = (e: KeyboardEvent) => {
      if (["ArrowRight", " ", "PageDown"].includes(e.key)) { e.preventDefault(); go(1); }
      if (["ArrowLeft", "PageUp"].includes(e.key)) go(-1);
    };
    window.addEventListener("keydown", key);
    return () => { ro.disconnect(); window.removeEventListener("keydown", key); };
  }, [go]);

  return (
    <div className="h-dvh flex flex-col bg-muted">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
        <Link to="/" className="font-bold text-primary">NestInLedger</Link>
        <div className="flex items-center gap-2 text-sm">
          <button aria-label="Previous slide" onClick={() => go(-1)} className="p-2 rounded-md hover:bg-muted"><ChevronLeft size={18} /></button>
          <span>{i + 1} / {slides.length}</span>
          <button aria-label="Next slide" onClick={() => go(1)} className="p-2 rounded-md hover:bg-muted"><ChevronRight size={18} /></button>
          <button aria-label="Full screen" onClick={() => document.documentElement.requestFullscreen?.()} className="p-2 rounded-md hover:bg-muted"><Maximize size={18} /></button>
        </div>
      </div>
      <div ref={box} className="flex-1 relative overflow-hidden"
        onTouchStart={(e) => { touch.current = e.touches[0]!.clientX; }}
        onTouchEnd={(e) => { if (touch.current == null) return; const dx = e.changedTouches[0]!.clientX - touch.current; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); touch.current = null; }}>
        <div className="absolute left-1/2 top-1/2 w-[1920px] h-[1080px] -ml-[960px] -mt-[540px] shadow-2xl" style={{ transform: `scale(${scale})` }}>
          {slides[i]!.el}
        </div>
      </div>
      <div className="flex justify-center gap-2 py-3">
        {slides.map((s, n) => <button key={s.title} aria-label={`Go to slide ${n + 1}`} onClick={() => setI(n)} className={`h-2 rounded-full transition-all ${n === i ? "w-8 bg-primary" : "w-2 bg-border"}`} />)}
      </div>
    </div>
  );
}
