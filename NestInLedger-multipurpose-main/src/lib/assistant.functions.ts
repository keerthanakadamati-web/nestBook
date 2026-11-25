import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { complaintCategories } from "@/lib/complaint-rules";

const input = z.object({ question: z.string().trim().min(1).max(1000) });

// Every page Nestbot may send people to. "committee" pages are only offered to committee roles.
export const assistantSections: { path: string; label: string; about: string; committee?: boolean }[] = [
  { path: "/dashboard", label: "Dashboard", about: "overview of dues, collections and alerts" },
  { path: "/my-flat", label: "My Flat", about: "your flat details" },
  { path: "/my-maintenance", label: "My Maintenance", about: "your monthly dues and statement" },
  { path: "/my-payments", label: "My Payments", about: "your payments and receipts download" },
  { path: "/my-tenants", label: "My Tenants", about: "your tenant details" },
  { path: "/complaints", label: "Complaints", about: "raise and track complaints" },
  { path: "/announcements", label: "Announcements", about: "notices, events and meetings" },
  { path: "/polls", label: "Polls & Voting", about: "vote in society polls" },
  { path: "/directory", label: "Emergency Directory", about: "watchman, plumber, electrician, hospital and other phone numbers" },
  { path: "/documents", label: "Documents", about: "society files: agreements, AMC contracts, bills, certificates, minutes" },
  { path: "/equipment", label: "Equipment & AMC", about: "lift, motor, generator service log and AMC dates" },
  { path: "/profile", label: "Profile", about: "your name and password" },
  { path: "/flats", label: "Flats & Residents", about: "all flats, owners, tenants and logins", committee: true },
  { path: "/maintenance", label: "Maintenance", about: "maintenance of all flats", committee: true },
  { path: "/payments", label: "Payments", about: "record and confirm payments, UPI setup", committee: true },
  { path: "/expenses", label: "Expenses", about: "society expenses and bills", committee: true },
  { path: "/fund", label: "Corporate Fund", about: "society fund balance and history", committee: true },
  { path: "/dashboard", label: "Dashboard reports (below the graph)", about: "monthly/yearly financial report PDF and CSV downloads", committee: true },
  { path: "/approvals", label: "Approvals", about: "pending approvals and history", committee: true },
  { path: "/settings", label: "Settings", about: "maintenance rate and reminder settings", committee: true },
];

export type AssistantReply = {
  answer: string;
  link: string | null;
  linkLabel?: string | null;
  complaint: { flatId: string; title: string; description: string; category: (typeof complaintCategories)[number] } | null;
};

// Read-only helper: every lookup runs as the signed-in user, so database rules decide what is visible.
export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }): Promise<AssistantReply> => {
    const sb = context.supabase;
    const roles = await sb.from("user_roles").select("role").eq("user_id", context.userId);
    const roleList = (roles.data ?? []).map((r) => r.role as string);
    const committee = roleList.some((r) => ["admin", "president", "secretary"].includes(r));
    const anyCommittee = roleList.some((r) => r !== "resident");
    const sections = assistantSections.filter((x) => !x.committee || anyCommittee);
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const [accounts, complaints, announcements, proposals, myFlats, societyRes] = await Promise.all([
      sb.from("flat_accounts").select("id, flat_number, resident_name, current_month_amount, previous_outstanding, outstanding, advance_credit, status"),
      sb.from("complaints").select("id, flat_id, title, category, status, priority, submitted_at").order("submitted_at", { ascending: false }).limit(30),
      sb.from("announcements").select("title, description, event_date, category").eq("published", true).order("event_date", { ascending: false }).limit(5),
      committee ? sb.from("change_proposals").select("module, action, status, submitted_at").eq("status", "pending").limit(30) : Promise.resolve({ data: [] }),
      sb.from("flats").select("id, flat_number").eq("resident_user_id", context.userId),
      sb.rpc("my_society"),
    ]);
    const societyName = societyRes.data?.[0]?.name?.trim() || "your apartment society";
    const directory = await sb.from("society_directory").select("name, category, phone, role_note, availability, contract_no").order("category").limit(100);
    const [files, reports] = await Promise.all([
      sb.from("society_files").select("title, category, vendor, valid_until, file_name").order("created_at", { ascending: false }).limit(80),
      anyCommittee ? sb.from("financial_reports").select("period_type, period_start, status").order("generated_at", { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
    ]);
    const facts = {
      society_name: societyName,
      app_sections: sections.map(({ path, label, about }) => ({ path, label, about })),
      documents_on_documents_page: files.data ?? [],
      financial_reports_on_reports_page: reports.data ?? [],
      today,
      roles: roleList.length ? roleList : ["owner"],
      own_flats: myFlats.data ?? [],
      flat_accounts: accounts.data ?? [],
      complaints: complaints.data ?? [],
      announcements: announcements.data ?? [],
      pending_approvals: proposals.data ?? [],
      emergency_directory: directory.data ?? [],
    };
    const { generateResponse, GatewayError } = await import("@lovable.dev/ai-gateway");
    try {
      const res = await generateResponse({
        model: "openai/gpt-6-astra",
        instructions: `You are the helper for ${societyName} apartment society app. Reply in the same language as the user (English, Telugu or Hindi), in 1-3 short simple sentences. Use only the FACTS JSON; never invent numbers. Amounts are Indian Rupees (₹). If the user describes a problem they want to report, fill "complaint" with flatId from own_flats (first one if unsure; null complaint if own_flats is empty), a short title, the description in their words, and a category from: ${complaintCategories.join(", ")}. For phone numbers of watchman, security, plumber, electrician, lift, hospital, police or any other contact, answer from emergency_directory with the name, phone number and availability; if not listed, say it is not added yet and set link to /directory. Otherwise complaint is null. You cannot change any record; for approvals, payments or announcements, point to the page. If the user asks what the app has, list the app_sections labels briefly. If they ask where to do something or how to find a page, file, document, receipt, report, photo or contact, say which section has it (name the matching document title if it is in documents_on_documents_page or financial_reports_on_reports_page; if not found, say so) and set link to that section path. "link" must be a path from app_sections or null.\nFACTS: ${JSON.stringify(facts)}`,
        input: data.question,
        text: {
          format: {
            type: "json_schema",
            name: "reply",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["answer", "link", "complaint"],
              properties: {
                answer: { type: "string" },
                link: { type: ["string", "null"] },
                complaint: {
                  anyOf: [
                    { type: "null" },
                    { type: "object", additionalProperties: false, required: ["flatId", "title", "description", "category"], properties: { flatId: { type: "string" }, title: { type: "string" }, description: { type: "string" }, category: { type: "string", enum: [...complaintCategories] } } },
                  ],
                },
              },
            },
          },
        },
      });
      let text = "";
      for (const o of res.output ?? []) if (o.type === "message") for (const c of o.content) if (c.type === "output_text") text += c.text;
      const parsed = JSON.parse(text) as AssistantReply;
      if (parsed.complaint && !(myFlats.data ?? []).some((f) => f.id === parsed.complaint?.flatId)) parsed.complaint = null;
      const sec = sections.find((x) => x.path === parsed.link);
      parsed.link = sec ? sec.path : null;
      parsed.linkLabel = sec ? sec.label : null;
      return parsed;
    } catch (error) {
      if (error instanceof GatewayError && error.httpStatus === 402) return { answer: "The helper is resting because this month's AI allowance is used up. Please try again later.", link: null, complaint: null };
      console.error(error);
      return { answer: "Sorry, I could not answer just now. Please try again.", link: null, complaint: null };
    }
  });
