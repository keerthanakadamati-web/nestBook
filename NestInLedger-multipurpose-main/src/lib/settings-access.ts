import type { Role } from "@/lib/permissions";

export function settingsDestination(role: Role): "/settings" | "/profile" {
  return role === "resident" ? "/profile" : "/settings";
}

export function settingsSections(role: Role, hasConfiguration: boolean) {
  return {
    profile: true,
    roles: role === "admin" || (!hasConfiguration && (role === "president" || role === "secretary")),
    acknowledgments: role === "admin",
    recurring: role === "treasurer",
    apartment: hasConfiguration && (role === "president" || role === "secretary"),
  };
}