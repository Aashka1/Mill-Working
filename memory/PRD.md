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
