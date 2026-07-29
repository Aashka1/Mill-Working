# AgriMill

Mill management system — inventory, sales, grinding, oil extraction, production,
costing, maintenance, expenses, customers, suppliers, invoices and reports.

- **Frontend** — React 19 (CRA + craco), Tailwind, shadcn/ui
- **Backend** — FastAPI, JWT auth in HttpOnly cookies, PDF (reportlab) and Excel
  (openpyxl) export
- **Database** — MongoDB

## Deploying

See **[DEPLOY.md](DEPLOY.md)** — free on MongoDB Atlas + Render, one service.

## Running locally

```bash
cp backend/.env.example backend/.env     # fill in MONGO_URL and JWT_SECRET

cd backend && pip install -r requirements.txt && uvicorn server:app --reload
cd frontend && yarn install && yarn start
```

The frontend runs on <http://localhost:3000> and talks to the backend on
<http://localhost:8000> via `REACT_APP_BACKEND_URL`.
