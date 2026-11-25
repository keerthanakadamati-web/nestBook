// Rules for the shared flat registration form (mirrored by the database).
export type Registration = {
  flat_number: string; floor: string; owner_name: string; mobile: string; owner_email: string;
  occupancy: "owner" | "rented"; tenant_name: string; tenant_phone: string;
  parking_slot: string; vehicle_type: string; vehicle_numbers: string;
  house_tax_number: string; aadhaar_number: string;
};
const MOBILE = /^[6-9]\d{9}$/;
export function validateRegistration(v: Registration): string | null {
  if (!v.flat_number.trim()) return "Please enter your flat number.";
  if (!v.owner_name.trim()) return "Please enter the owner name.";
  if (!MOBILE.test(v.mobile.trim())) return "Please enter a valid 10-digit mobile number.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.owner_email.trim())) return "Please enter a valid email address.";
  if (!/^\d{12}$/.test(v.aadhaar_number.replace(/\s/g, ""))) return "Aadhaar number must be 12 digits.";
  if (v.occupancy === "rented") {
    if (!v.tenant_name.trim()) return "Please enter the tenant name.";
    if (v.tenant_phone.trim() && !MOBILE.test(v.tenant_phone.trim())) return "Please enter a valid tenant mobile number.";
  }
  return null;
}
export const maskAadhaar = (a: string) => `XXXX XXXX ${a.slice(-4)}`;
export function whatsappInvite(societyName: string, link: string) {
  const text = [
    `🏢 *${societyName} – Flat Details*`,
    "",
    "Dear Residents,",
    "Please fill your flat details for our society portal. It takes only 2 minutes and no login is needed.",
    "",
    `👉 ${link}`,
    "",
    "Your details are private and seen only by the committee.",
    "",
    "Thank you,",
    "Managing Committee",
  ].join("\n");
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
