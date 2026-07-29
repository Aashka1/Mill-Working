from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import io
import jwt
import bcrypt
import secrets
import logging
from datetime import datetime, timezone, timedelta

from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, Depends
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
import uuid

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from openpyxl import Workbook

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_ALGORITHM = "HS256"

def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------- Auth utils ----------------

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "exp": datetime.now(timezone.utc) + timedelta(minutes=60), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=3600, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none", max_age=604800, path="/")

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["id"] = str(user["_id"])
        user.pop("_id", None)
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

# ---------------- Auth models ----------------

class RegisterBody(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = "staff"

class LoginBody(BaseModel):
    email: EmailStr
    password: str

# ---------------- Auth endpoints ----------------

@api_router.post("/auth/register")
async def register(body: RegisterBody, response: Response):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    role = body.role if body.role in ("admin", "staff") else "staff"
    doc = {"email": email, "password_hash": hash_password(body.password), "name": body.name,
           "role": role, "created_at": datetime.now(timezone.utc).isoformat()}
    res = await db.users.insert_one(doc)
    uid = str(res.inserted_id)
    set_auth_cookies(response, create_access_token(uid, email), create_refresh_token(uid))
    return {"id": uid, "email": email, "name": body.name, "role": role}

@api_router.post("/auth/login")
async def login(body: LoginBody, request: Request, response: Response):
    email = body.email.lower()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"
    attempt = await db.login_attempts.find_one({"identifier": identifier})
    if attempt and attempt.get("count", 0) >= 5:
        locked_until = attempt.get("locked_until")
        if locked_until and datetime.fromisoformat(locked_until) > datetime.now(timezone.utc):
            raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        count = (attempt.get("count", 0) if attempt else 0) + 1
        await db.login_attempts.update_one({"identifier": identifier},
            {"$set": {"count": count, "locked_until": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat() if count >= 5 else None}}, upsert=True)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await db.login_attempts.delete_one({"identifier": identifier})
    uid = str(user["_id"])
    set_auth_cookies(response, create_access_token(uid, email), create_refresh_token(uid))
    return {"id": uid, "email": email, "name": user["name"], "role": user["role"]}

@api_router.post("/auth/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "logged out"}

@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

@api_router.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        response.set_cookie("access_token", create_access_token(str(user["_id"]), user["email"]),
                            httponly=True, secure=True, samesite="none", max_age=3600, path="/")
        return {"message": "refreshed"}
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

@api_router.get("/users")
async def list_users(user: dict = Depends(require_admin)):
    users = await db.users.find({}, {"password_hash": 0}).to_list(1000)
    for u in users:
        u["id"] = str(u["_id"]); u.pop("_id", None)
    return users

# ---------------- Generic helpers ----------------

def clean(doc: dict) -> dict:
    doc = dict(doc)
    doc.pop("_id", None)
    return doc

def now_iso():
    return datetime.now(timezone.utc).isoformat()

async def next_invoice_number():
    count = await db.invoices.count_documents({})
    return f"INV-{datetime.now().year}-{count + 1:04d}"

# ---------------- Products / Inventory ----------------

class ProductBody(BaseModel):
    name: str
    category: str
    unit: str = "kg"
    current_stock: float = 0
    rate: float = 0
    low_stock_threshold: float = 50

@api_router.get("/products")
async def get_products(user: dict = Depends(get_current_user)):
    return [clean(p) for p in await db.products.find().sort("name", 1).to_list(1000)]

@api_router.post("/products")
async def create_product(body: ProductBody, user: dict = Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "created_at": now_iso()}
    await db.products.insert_one(doc)
    return clean(doc)

@api_router.put("/products/{pid}")
async def update_product(pid: str, body: ProductBody, user: dict = Depends(get_current_user)):
    await db.products.update_one({"id": pid}, {"$set": body.model_dump()})
    return clean(await db.products.find_one({"id": pid}))

@api_router.delete("/products/{pid}")
async def delete_product(pid: str, user: dict = Depends(require_admin)):
    await db.products.delete_one({"id": pid})
    return {"message": "deleted"}

# ---------------- Purchases ----------------

class PurchaseBody(BaseModel):
    date: str
    supplier_id: Optional[str] = None
    supplier_name: str
    product_id: str
    product_name: str
    quantity: float
    rate: float
    payment_status: str = "Paid"

@api_router.get("/purchases")
async def get_purchases(user: dict = Depends(get_current_user)):
    return [clean(p) for p in await db.purchases.find().sort("date", -1).to_list(2000)]

@api_router.post("/purchases")
async def create_purchase(body: PurchaseBody, user: dict = Depends(get_current_user)):
    total = round(body.quantity * body.rate, 2)
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "total": total, "created_at": now_iso()}
    await db.purchases.insert_one(doc)
    await db.products.update_one({"id": body.product_id}, {"$inc": {"current_stock": body.quantity}})
    return clean(doc)

@api_router.delete("/purchases/{pid}")
async def delete_purchase(pid: str, user: dict = Depends(require_admin)):
    p = await db.purchases.find_one({"id": pid})
    if p:
        await db.products.update_one({"id": p["product_id"]}, {"$inc": {"current_stock": -p["quantity"]}})
        await db.purchases.delete_one({"id": pid})
    return {"message": "deleted"}

# ---------------- Sales ----------------

class SaleBody(BaseModel):
    date: str
    customer_id: Optional[str] = None
    customer_name: str
    product_id: str
    product_name: str
    quantity: float
    price: float
    payment_status: str = "Paid"

@api_router.get("/sales")
async def get_sales(user: dict = Depends(get_current_user)):
    return [clean(s) for s in await db.sales.find().sort("date", -1).to_list(2000)]

@api_router.post("/sales")
async def create_sale(body: SaleBody, user: dict = Depends(get_current_user)):
    total = round(body.quantity * body.price, 2)
    inv = await next_invoice_number()
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "total": total, "invoice_number": inv, "created_at": now_iso()}
    await db.sales.insert_one(doc)
    await db.products.update_one({"id": body.product_id}, {"$inc": {"current_stock": -body.quantity}})
    await db.invoices.insert_one({"id": str(uuid.uuid4()), "invoice_number": inv, "type": "Sale",
        "ref_id": doc["id"], "customer_name": body.customer_name, "date": body.date,
        "total": total, "payment_status": body.payment_status, "created_at": now_iso()})
    return clean(doc)

@api_router.delete("/sales/{sid}")
async def delete_sale(sid: str, user: dict = Depends(require_admin)):
    s = await db.sales.find_one({"id": sid})
    if s:
        await db.products.update_one({"id": s["product_id"]}, {"$inc": {"current_stock": s["quantity"]}})
        await db.sales.delete_one({"id": sid})
        await db.invoices.delete_one({"ref_id": sid})
    return {"message": "deleted"}

# ---------------- Grinding ----------------

class GrindingBody(BaseModel):
    date: str
    customer_id: Optional[str] = None
    customer_name: str
    wheat_weight: float
    charge_per_kg: float
    payment_status: str = "Pending"

@api_router.get("/grinding")
async def get_grinding(user: dict = Depends(get_current_user)):
    return [clean(g) for g in await db.grinding.find().sort("date", -1).to_list(2000)]

@api_router.post("/grinding")
async def create_grinding(body: GrindingBody, user: dict = Depends(get_current_user)):
    total = round(body.wheat_weight * body.charge_per_kg, 2)
    inv = await next_invoice_number()
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "total_charge": total, "invoice_number": inv, "created_at": now_iso()}
    await db.grinding.insert_one(doc)
    await db.invoices.insert_one({"id": str(uuid.uuid4()), "invoice_number": inv, "type": "Grinding",
        "ref_id": doc["id"], "customer_name": body.customer_name, "date": body.date,
        "total": total, "payment_status": body.payment_status, "created_at": now_iso()})
    return clean(doc)

@api_router.delete("/grinding/{gid}")
async def delete_grinding(gid: str, user: dict = Depends(require_admin)):
    await db.grinding.delete_one({"id": gid})
    await db.invoices.delete_one({"ref_id": gid})
    return {"message": "deleted"}

# ---------------- Oil Extraction ----------------

class OilBody(BaseModel):
    date: str
    customer_id: Optional[str] = None
    customer_name: str
    seed_type: str
    quantity_received: float
    oil_extracted: float
    charge: float
    payment_status: str = "Pending"

@api_router.get("/oil")
async def get_oil(user: dict = Depends(get_current_user)):
    return [clean(o) for o in await db.oil.find().sort("date", -1).to_list(2000)]

@api_router.post("/oil")
async def create_oil(body: OilBody, user: dict = Depends(get_current_user)):
    inv = await next_invoice_number()
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "total": body.charge, "invoice_number": inv, "created_at": now_iso()}
    await db.oil.insert_one(doc)
    await db.invoices.insert_one({"id": str(uuid.uuid4()), "invoice_number": inv, "type": "Oil Extraction",
        "ref_id": doc["id"], "customer_name": body.customer_name, "date": body.date,
        "total": body.charge, "payment_status": body.payment_status, "created_at": now_iso()})
    return clean(doc)

@api_router.delete("/oil/{oid}")
async def delete_oil(oid: str, user: dict = Depends(require_admin)):
    await db.oil.delete_one({"id": oid})
    await db.invoices.delete_one({"ref_id": oid})
    return {"message": "deleted"}

# ---------------- Expenses ----------------

class ExpenseBody(BaseModel):
    date: str
    category: str
    description: str = ""
    amount: float

@api_router.get("/expenses")
async def get_expenses(user: dict = Depends(get_current_user)):
    return [clean(e) for e in await db.expenses.find().sort("date", -1).to_list(2000)]

@api_router.post("/expenses")
async def create_expense(body: ExpenseBody, user: dict = Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "created_at": now_iso()}
    await db.expenses.insert_one(doc)
    return clean(doc)

@api_router.delete("/expenses/{eid}")
async def delete_expense(eid: str, user: dict = Depends(get_current_user)):
    await db.expenses.delete_one({"id": eid})
    return {"message": "deleted"}

# ---------------- Customers ----------------

class CustomerBody(BaseModel):
    name: str
    phone: str = ""
    address: str = ""

@api_router.get("/customers")
async def get_customers(user: dict = Depends(get_current_user)):
    customers = [clean(c) for c in await db.customers.find().sort("name", 1).to_list(2000)]
    for c in customers:
        pending = 0.0
        for coll, field in [("sales", "total"), ("grinding", "total_charge"), ("oil", "total")]:
            docs = await db[coll].find({"customer_name": c["name"], "payment_status": "Pending"}).to_list(1000)
            pending += sum(d.get(field, 0) for d in docs)
        c["outstanding"] = round(pending, 2)
    return customers

@api_router.post("/customers")
async def create_customer(body: CustomerBody, user: dict = Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "created_at": now_iso()}
    await db.customers.insert_one(doc)
    return clean(doc)

@api_router.put("/customers/{cid}")
async def update_customer(cid: str, body: CustomerBody, user: dict = Depends(get_current_user)):
    await db.customers.update_one({"id": cid}, {"$set": body.model_dump()})
    return clean(await db.customers.find_one({"id": cid}))

@api_router.get("/customers/{cid}/history")
async def customer_history(cid: str, user: dict = Depends(get_current_user)):
    c = await db.customers.find_one({"id": cid})
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    name = c["name"]
    return {
        "sales": [clean(x) for x in await db.sales.find({"customer_name": name}).to_list(1000)],
        "grinding": [clean(x) for x in await db.grinding.find({"customer_name": name}).to_list(1000)],
        "oil": [clean(x) for x in await db.oil.find({"customer_name": name}).to_list(1000)],
    }

@api_router.delete("/customers/{cid}")
async def delete_customer(cid: str, user: dict = Depends(require_admin)):
    await db.customers.delete_one({"id": cid})
    return {"message": "deleted"}

# ---------------- Suppliers ----------------

class SupplierBody(BaseModel):
    name: str
    phone: str = ""
    address: str = ""

@api_router.get("/suppliers")
async def get_suppliers(user: dict = Depends(get_current_user)):
    suppliers = [clean(s) for s in await db.suppliers.find().sort("name", 1).to_list(2000)]
    for s in suppliers:
        docs = await db.purchases.find({"supplier_name": s["name"], "payment_status": "Pending"}).to_list(1000)
        s["outstanding"] = round(sum(d.get("total", 0) for d in docs), 2)
    return suppliers

@api_router.post("/suppliers")
async def create_supplier(body: SupplierBody, user: dict = Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "created_at": now_iso()}
    await db.suppliers.insert_one(doc)
    return clean(doc)

@api_router.put("/suppliers/{sid}")
async def update_supplier(sid: str, body: SupplierBody, user: dict = Depends(get_current_user)):
    await db.suppliers.update_one({"id": sid}, {"$set": body.model_dump()})
    return clean(await db.suppliers.find_one({"id": sid}))

@api_router.delete("/suppliers/{sid}")
async def delete_supplier(sid: str, user: dict = Depends(require_admin)):
    await db.suppliers.delete_one({"id": sid})
    return {"message": "deleted"}

# ---------------- Invoices ----------------

@api_router.get("/invoices")
async def get_invoices(user: dict = Depends(get_current_user)):
    return [clean(i) for i in await db.invoices.find().sort("created_at", -1).to_list(2000)]

async def build_invoice_data(ref_id: str):
    sale = await db.sales.find_one({"id": ref_id})
    if sale:
        return {"type": "Sale", "invoice_number": sale["invoice_number"], "date": sale["date"],
                "customer_name": sale["customer_name"], "payment_status": sale["payment_status"],
                "items": [{"desc": sale["product_name"], "qty": f'{sale["quantity"]} kg',
                           "rate": sale["price"], "amount": sale["total"]}], "total": sale["total"]}
    g = await db.grinding.find_one({"id": ref_id})
    if g:
        return {"type": "Grinding Service", "invoice_number": g["invoice_number"], "date": g["date"],
                "customer_name": g["customer_name"], "payment_status": g["payment_status"],
                "items": [{"desc": f'Wheat Grinding ({g["wheat_weight"]} kg)', "qty": f'{g["wheat_weight"]} kg',
                           "rate": g["charge_per_kg"], "amount": g["total_charge"]}], "total": g["total_charge"]}
    o = await db.oil.find_one({"id": ref_id})
    if o:
        return {"type": "Oil Extraction Service", "invoice_number": o["invoice_number"], "date": o["date"],
                "customer_name": o["customer_name"], "payment_status": o["payment_status"],
                "items": [{"desc": f'{o["seed_type"]} Oil Extraction ({o["oil_extracted"]} L extracted)',
                           "qty": f'{o["quantity_received"]} kg', "rate": o["charge"], "amount": o["charge"]}],
                "total": o["charge"]}
    return None

@api_router.get("/invoices/{ref_id}/pdf")
async def invoice_pdf(ref_id: str, request: Request):
    await get_current_user(request)
    data = await build_invoice_data(ref_id)
    if not data:
        raise HTTPException(status_code=404, detail="Invoice not found")
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20*mm)
    styles = getSampleStyleSheet()
    title = ParagraphStyle("t", parent=styles["Title"], textColor=colors.HexColor("#B8860B"))
    elements = [Paragraph("AgriMill Hub", title),
                Paragraph("Wheat Grinding &amp; Oil Extraction Services", styles["Normal"]),
                Spacer(1, 12),
                Paragraph(f"<b>Invoice:</b> {data['invoice_number']} &nbsp;&nbsp; <b>Type:</b> {data['type']}", styles["Normal"]),
                Paragraph(f"<b>Date:</b> {data['date']} &nbsp;&nbsp; <b>Status:</b> {data['payment_status']}", styles["Normal"]),
                Paragraph(f"<b>Customer:</b> {data['customer_name']}", styles["Normal"]),
                Spacer(1, 16)]
    rows = [["Description", "Quantity", "Rate (Rs)", "Amount (Rs)"]]
    for it in data["items"]:
        rows.append([it["desc"], it["qty"], f'{it["rate"]:.2f}', f'{it["amount"]:.2f}'])
    rows.append(["", "", "Total", f'Rs {data["total"]:.2f}'])
    tbl = Table(rows, colWidths=[80*mm, 30*mm, 35*mm, 35*mm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#B8860B")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#F5EEDC")),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
    ]))
    elements.append(tbl)
    elements.append(Spacer(1, 24))
    elements.append(Paragraph("Thank you for your business!", styles["Italic"]))
    doc.build(elements)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{data["invoice_number"]}.pdf"'})

# ---------------- Reports / Export ----------------

@api_router.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    products = await db.products.find().to_list(1000)
    sales = await db.sales.find().to_list(5000)
    purchases = await db.purchases.find().to_list(5000)
    grinding = await db.grinding.find().to_list(5000)
    oil = await db.oil.find().to_list(5000)
    expenses = await db.expenses.find().to_list(5000)

    today = datetime.now().strftime("%Y-%m-%d")
    month = datetime.now().strftime("%Y-%m")

    total_sales = sum(s.get("total", 0) for s in sales)
    total_purchases = sum(p.get("total", 0) for p in purchases)
    grinding_income = sum(g.get("total_charge", 0) for g in grinding)
    oil_income = sum(o.get("total", 0) for o in oil)
    total_expenses = sum(e.get("amount", 0) for e in expenses)
    service_income = grinding_income + oil_income
    total_income = total_sales + service_income
    profit = total_income - total_purchases - total_expenses

    def day_sum(items, field):
        return sum(i.get(field, 0) for i in items if str(i.get("date", "")).startswith(today))
    def month_sum(items, field):
        return sum(i.get(field, 0) for i in items if str(i.get("date", "")).startswith(month))

    daily_income = day_sum(sales, "total") + day_sum(grinding, "total_charge") + day_sum(oil, "total")
    monthly_income = month_sum(sales, "total") + month_sum(grinding, "total_charge") + month_sum(oil, "total")

    pending_customer = 0.0
    for coll, field in [(sales, "total"), (grinding, "total_charge"), (oil, "total")]:
        pending_customer += sum(d.get(field, 0) for d in coll if d.get("payment_status") == "Pending")
    supplier_dues = sum(p.get("total", 0) for p in purchases if p.get("payment_status") == "Pending")

    low_stock = [{"name": p["name"], "stock": p.get("current_stock", 0), "threshold": p.get("low_stock_threshold", 0), "unit": p.get("unit", "kg")}
                 for p in products if p.get("current_stock", 0) <= p.get("low_stock_threshold", 0)]

    # last 6 months income vs expense
    trend = []
    for i in range(5, -1, -1):
        d = (datetime.now().replace(day=1) - timedelta(days=i * 30))
        m = d.strftime("%Y-%m")
        label = d.strftime("%b")
        inc = month_income_for(sales, "total", m) + month_income_for(grinding, "total_charge", m) + month_income_for(oil, "total", m)
        exp = month_income_for(expenses, "amount", m) + month_income_for(purchases, "total", m)
        trend.append({"month": label, "income": round(inc, 2), "expense": round(exp, 2)})

    return {
        "total_income": round(total_income, 2),
        "total_sales": round(total_sales, 2),
        "total_purchases": round(total_purchases, 2),
        "service_income": round(service_income, 2),
        "grinding_orders": len(grinding),
        "oil_orders": len(oil),
        "total_expenses": round(total_expenses, 2),
        "profit": round(profit, 2),
        "daily_income": round(daily_income, 2),
        "monthly_income": round(monthly_income, 2),
        "pending_customer": round(pending_customer, 2),
        "supplier_dues": round(supplier_dues, 2),
        "inventory_count": len(products),
        "total_stock": round(sum(p.get("current_stock", 0) for p in products), 2),
        "low_stock": low_stock,
        "trend": trend,
        "revenue_breakdown": [
            {"name": "Product Sales", "value": round(total_sales, 2)},
            {"name": "Grinding", "value": round(grinding_income, 2)},
            {"name": "Oil Extraction", "value": round(oil_income, 2)},
        ],
    }

def month_income_for(items, field, m):
    return sum(i.get(field, 0) for i in items if str(i.get("date", "")).startswith(m))

@api_router.get("/notifications")
async def notifications(user: dict = Depends(get_current_user)):
    notes = []
    for p in await db.products.find().to_list(1000):
        if p.get("current_stock", 0) <= p.get("low_stock_threshold", 0):
            notes.append({"type": "low_stock", "level": "warning",
                          "message": f'Low stock: {p["name"]} ({p.get("current_stock",0)} {p.get("unit","kg")} left)'})
    for coll, field, label in [("sales", "total", "sale"), ("grinding", "total_charge", "grinding"), ("oil", "total", "oil extraction")]:
        docs = await db[coll].find({"payment_status": "Pending"}).to_list(1000)
        for d in docs:
            notes.append({"type": "pending_payment", "level": "info",
                          "message": f'Pending payment from {d.get("customer_name","?")} - Rs {d.get(field,0):.0f} ({label})'})
    for p in await db.purchases.find({"payment_status": "Pending"}).to_list(1000):
        notes.append({"type": "supplier_due", "level": "info",
                      "message": f'Supplier due: {p.get("supplier_name","?")} - Rs {p.get("total",0):.0f}'})
    return notes

@api_router.get("/export/{kind}")
async def export_excel(kind: str, request: Request):
    await get_current_user(request)
    coll_map = {"sales": "sales", "purchases": "purchases", "grinding": "grinding",
                "oil": "oil", "expenses": "expenses"}
    if kind not in coll_map:
        raise HTTPException(status_code=404, detail="Unknown report")
    docs = [clean(d) for d in await db[coll_map[kind]].find().to_list(5000)]
    wb = Workbook()
    ws = wb.active
    ws.title = kind
    if docs:
        headers = [k for k in docs[0].keys() if k not in ("created_at",)]
        ws.append(headers)
        for d in docs:
            ws.append([d.get(h, "") for h in headers])
    else:
        ws.append(["No data"])
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{kind}_report.xlsx"'})

# ---------------- Startup ----------------

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@agrimill.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({"email": admin_email, "password_hash": hash_password(admin_password),
            "name": "Admin", "role": "admin", "created_at": now_iso()})
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})
    # seed staff test user
    if await db.users.find_one({"email": "staff@agrimill.com"}) is None:
        await db.users.insert_one({"email": "staff@agrimill.com", "password_hash": hash_password("staff123"),
            "name": "Staff Member", "role": "staff", "created_at": now_iso()})

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000"), "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
