# AgriMill Hub — Wheat & Oil Mill Management

## Original Problem Statement
Modern web app for a wheat grinding / oil extraction business to replace manual registers: inventory, sales, grinding & oil services, expenses, customers, suppliers, billing (PDF), reports & notifications. Currency ₹, units kg. JWT auth with Admin/Staff roles. Warm earthy theme, dark/light mode.

## Architecture
- Backend: FastAPI + MongoDB (motor). All routes under `/api`. JWT httpOnly cookie auth (bcrypt, brute-force lockout, admin/staff RBAC). PDF invoices via reportlab, Excel export via openpyxl.
- Frontend: React 19 + React Router, TailwindCSS + shadcn/ui, Recharts, Sonner, lucide-react. AuthContext + ThemeContext.

## User Personas
- Admin: full control incl. deletes and user management.
- Staff: day-to-day data entry (create/read/update), cannot delete records.

## Core Requirements (static)
Inventory (products + purchases, auto stock), Sales (auto stock deduct + invoice), Wheat Grinding (customer-owned, no inventory impact), Oil Extraction (customer-owned), Expenses w/ daily/weekly/monthly summaries, Customers (history + outstanding), Suppliers (dues), Invoices (PDF), Dashboard/Reports, Search/Filters, Notifications.

## Implemented (2026-07-29)
- Full JWT auth (admin@agrimill.com/admin123, staff@agrimill.com/staff123), RBAC deletes admin-only.
- Inventory: products CRUD, purchases increment stock, low-stock alerts.
- Sales: total calc, stock deduction, auto invoice number + PDF, Excel export.
- Grinding & Oil services: separate from inventory, invoices + Excel export.
- Expenses: categories + daily/weekly/monthly summary cards + Excel export.
- Customers/Suppliers: profiles, outstanding balance aggregation, customer transaction history.
- Invoices page + per-record PDF download.
- Dashboard: income/profit/pending/stock cards, 6-month income-vs-expense bar chart, revenue pie, low-stock & dues panels.
- Notifications bell (low stock, pending payments, supplier dues).
- Dark/light theme toggle, responsive sidebar layout, global search per module.
- Tested: backend 21/21 pass; frontend all critical E2E flows pass.

## Backlog
- P1: Upcoming maintenance schedule reminders (notification type not yet implemented).
- P2: Cloud backup, edit (not just delete) for sales/services, DialogDescription a11y, month-accurate trend arithmetic, staff-restricted UI hints.

## Next Tasks
- Add maintenance schedule module for reminders.
- Add edit capability to transactional records.

## Update (2026-07-29) — ERP Expansion (Ledgers, Cash Book, Reports, Audit, Theme)
- New theme: Forest Green primary (#2E7D32), Golden Wheat secondary (#D4A017), Inter font, #F8F9FA light / #121212 dark.
- Seeded flour types: Fine/Medium/Coarse/Multigrain Atta, Besan, Makka Atta, Bajra Atta, Sattu + Packing Bags — each priced & sellable.
- Customer & Supplier ledgers with partial payments (`/api/payments`, `/customers|suppliers/{id}/ledger`); outstanding = debits − credits; Paid transactions & Mark-Paid auto-credit.
- Daily Cash Book (`/api/cashbook`): opening + received − supplier paid − expenses = closing (starting cash in Settings).
- Reports page: sales today/month/year, revenue-by-product bar chart, top & least sellers, profit; Cash Book card.
- Audit Log (`/api/audit`) capturing stock changes, sales, purchases, production, payments — shown in Settings.
- Settings page: configurable grinding loss % and starting cash.
- Grinding status cell is click-to-pay (pending→paid).
- Tested: backend 11/11 iteration-4 pass (100%), frontend 100%.

## Update (2026-07-29) — Mill Production & Advanced Logic
- Renamed brand to **Gangotri Flour & Oil Mill**; theme shifted to yellow-orange primary with olive-green accents on white.
- Default products auto-seeded: Wheat Crop, Atta, Wheat Bran, Sattu, Mustard Seeds, Mustard Oil, Mustard Oil Cake (with weighted-avg cost_per_unit).
- **Production** module: converts raw stock into finished goods + by-products (Wheat Crop→Atta+Bran, Mustard Seeds→Oil+Cake), decrements input / increments outputs, allocates production cost from purchase price.
- **Grinding** enhanced: washed toggle + configurable loss % (settings: washed 2.5% / unwashed 5%), auto atta output & loss, payment method Cash or Grain (shop-retained atta added to inventory).
- **Oil extraction** enhanced: oil cake output, payment Cash / retain Oil / retain Cake (retained added to shop inventory).
- **Exchange** module: customer trades wheat crop for atta (Wheat Crop +=, Atta -=, with stock guard).
- **Mark-as-Paid** one-tap on sales/grinding/oil; **Edit** for sales/grinding/oil (reverse+reapply inventory).
- **Daily Summary** (daybook) card on dashboard: income billed, collected, pending, expenses, net cash, orders.
- Tested: 28/28 backend pass, 100% of frontend flows.
