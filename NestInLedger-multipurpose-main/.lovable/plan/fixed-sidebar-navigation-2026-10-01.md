# Fixed Sidebar Navigation

## Scope
Add one shared navigation shell around every signed-in page. Keep all page content, data, login rules, and existing actions unchanged.

## What will change
- Add a fixed left sidebar using the existing Modern Professional colors and typography.
- Show `LABANYA ENCLAVE` at the top and use simple icons with labels.
- On desktop, keep the sidebar fixed on the left with an icon-width collapsed state.
- On mobile, replace it with a hamburger button that opens and closes the navigation drawer.
- Highlight the current working page.
- Keep Logout as a working action at the bottom.

## Navigation behavior
- Committee accounts see the full requested list: Dashboard, Owners, Flats, Tenants, Announcements, Maintenance, Payments, Expenses, Complaints, Documents, Reports, Profile, and Logout.
- Owner accounts see only items relevant to their account: Dashboard, Maintenance, Payments, Profile, and Logout.
- Dashboard opens the existing committee dashboard for committee accounts and the existing My Flats screen for owners.
- Expenses opens the existing Monthly Expenses screen for committee accounts.
- Requested items without an existing page remain visible but disabled; no placeholder pages or new features will be created.
- Existing Corporate Fund access remains where it is today, because it was not requested as a sidebar item.

## Existing screens
- Wrap Dashboard, My Flats, Expenses, and Corporate Fund in the shared signed-in layout.
- Remove only duplicated page-level sign-out controls and back-to-dashboard buttons where the sidebar provides the same action.
- Do not alter forms, tables, payments, receipts, tenant editing, account linking, or any other page behavior.

## Technical details
- Build the shell in the existing authenticated layout so all signed-in routes inherit it.
- Use the existing sidebar, button, tooltip, and icon components.
- Preserve route guards and role checks; role lookup only controls which navigation labels are shown.
- Ensure sidebar width uses explicit CSS variable syntax so the fixed panel never overlaps content.
- Verify desktop and mobile layouts, menu open/close behavior, active states, disabled states, Logout, and all existing route content.
