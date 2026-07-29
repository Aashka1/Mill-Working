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
    cost_per_unit: float = 0
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
    old = await db.products.find_one({"id": pid})
    await db.products.update_one({"id": pid}, {"$set": body.model_dump()})
    if old and old.get("current_stock") != body.current_stock:
        await log_audit(user, "Changed stock", f"{body.name}: {old.get('current_stock')} → {body.current_stock} {body.unit}")
    return clean(await db.products.find_one({"id": pid}))

@api_router.delete("/products/{pid}")
async def delete_product(pid: str, user: dict = Depends(require_admin)):
    p = await db.products.find_one({"id": pid})
    await db.products.delete_one({"id": pid})
    await log_audit(user, "Deleted product", (p or {}).get("name", pid))
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
    await add_stock_with_cost(body.product_id, body.quantity, total)
    if body.payment_status == "Paid":
        await add_credit("supplier", body.supplier_name, total, body.date, doc["id"], f"Purchase {body.product_name}")
    await log_audit(user, "Created purchase", f"{body.supplier_name} · {body.product_name} {body.quantity}kg · Rs {total}")
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
    if body.payment_status == "Paid":
        await add_credit("customer", body.customer_name, total, body.date, doc["id"], f"Cash sale {inv}")
    await log_audit(user, "Created sale", f"{body.customer_name} · {body.product_name} {body.quantity}kg · Rs {total}")
    return clean(doc)

@api_router.delete("/sales/{sid}")
async def delete_sale(sid: str, user: dict = Depends(require_admin)):
    s = await db.sales.find_one({"id": sid})
    if s:
        await db.products.update_one({"id": s["product_id"]}, {"$inc": {"current_stock": s["quantity"]}})
        await db.sales.delete_one({"id": sid})
        await db.invoices.delete_one({"ref_id": sid})
        await db.payments.delete_many({"ref_id": sid})
    return {"message": "deleted"}

# ---------------- Grinding ----------------

class GrindingBody(BaseModel):
    date: str
    customer_id: Optional[str] = None
    customer_name: str
    wheat_weight: float
    washed: bool = True
    loss_percent: float = 2.5
    charge_per_kg: float = 0
    payment_method: str = "Cash"
    grain_fee_kg: float = 0
    payment_status: str = "Pending"

@api_router.get("/grinding")
async def get_grinding(user: dict = Depends(get_current_user)):
    return [clean(g) for g in await db.grinding.find().sort("date", -1).to_list(2000)]

@api_router.post("/grinding")
async def create_grinding(body: GrindingBody, user: dict = Depends(get_current_user)):
    doc = await build_grinding_doc(body)
    await db.grinding.insert_one(doc)
    await apply_grinding_effects(doc, 1)
    await db.invoices.insert_one({"id": str(uuid.uuid4()), "invoice_number": doc["invoice_number"], "type": "Grinding",
        "ref_id": doc["id"], "customer_name": doc["customer_name"], "date": doc["date"],
        "total": doc["total_charge"], "payment_status": doc["payment_status"], "created_at": now_iso()})
    if doc["payment_status"] == "Paid" and doc["total_charge"] > 0:
        await add_credit("customer", doc["customer_name"], doc["total_charge"], doc["date"], doc["id"], f"Grinding {doc['invoice_number']}")
    return clean(doc)

@api_router.delete("/grinding/{gid}")
async def delete_grinding(gid: str, user: dict = Depends(require_admin)):
    g = await db.grinding.find_one({"id": gid})
    if g:
        await apply_grinding_effects(g, -1)
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
    oil_cake_produced: float = 0
    charge: float = 0
    payment_method: str = "Cash"
    retained_oil: float = 0
    retained_cake: float = 0
    payment_status: str = "Pending"

@api_router.get("/oil")
async def get_oil(user: dict = Depends(get_current_user)):
    return [clean(o) for o in await db.oil.find().sort("date", -1).to_list(2000)]

@api_router.post("/oil")
async def create_oil(body: OilBody, user: dict = Depends(get_current_user)):
    doc = await build_oil_doc(body)
    await db.oil.insert_one(doc)
    await apply_oil_effects(doc, 1)
    await db.invoices.insert_one({"id": str(uuid.uuid4()), "invoice_number": doc["invoice_number"], "type": "Oil Extraction",
        "ref_id": doc["id"], "customer_name": doc["customer_name"], "date": doc["date"],
        "total": doc["total"], "payment_status": doc["payment_status"], "created_at": now_iso()})
    if doc["payment_status"] == "Paid" and doc["total"] > 0:
        await add_credit("customer", doc["customer_name"], doc["total"], doc["date"], doc["id"], f"Oil {doc['invoice_number']}")
    return clean(doc)

@api_router.delete("/oil/{oid}")
async def delete_oil(oid: str, user: dict = Depends(require_admin)):
    o = await db.oil.find_one({"id": oid})
    if o:
        await apply_oil_effects(o, -1)
        await db.oil.delete_one({"id": oid})
        await db.invoices.delete_one({"ref_id": oid})
        await db.payments.delete_many({"ref_id": oid})
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
async def delete_expense(eid: str, user: dict = Depends(require_admin)):
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
        debit = 0.0
        for coll, field in [("sales", "total"), ("grinding", "total_charge"), ("oil", "total")]:
            docs = await db[coll].find({"customer_name": c["name"]}).to_list(2000)
            debit += sum(d.get(field, 0) for d in docs)
        credit = sum(p.get("amount", 0) for p in await db.payments.find({"party_type": "customer", "party_name": c["name"]}).to_list(2000))
        c["outstanding"] = round(debit - credit, 2)
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
        docs = await db.purchases.find({"supplier_name": s["name"]}).to_list(2000)
        debit = sum(d.get("total", 0) for d in docs)
        credit = sum(p.get("amount", 0) for p in await db.payments.find({"party_type": "supplier", "party_name": s["name"]}).to_list(2000))
        s["outstanding"] = round(debit - credit, 2)
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
    elements = [Paragraph("Gangotri Flour &amp; Oil Mill", title),
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
    today_str = datetime.now().strftime("%Y-%m-%d")
    soon = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
    for m in await db.maintenance.find().to_list(1000):
        nd = m.get("next_due_date", "")
        if nd and nd <= soon:
            overdue = nd < today_str
            notes.append({"type": "maintenance", "level": "warning" if overdue else "info",
                          "message": f'{"OVERDUE" if overdue else "Upcoming"} maintenance: {m.get("machine","?")} — {m.get("task","service")} (due {nd})'})
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
    await seed_products()
    await get_settings_doc()

# ==================== Mill Production & Advanced Logic ====================

DEFAULT_PRODUCTS = [
    {"name": "Wheat Crop", "category": "Wheat Crop", "unit": "kg", "low_stock_threshold": 100},
    {"name": "Atta", "category": "Flour", "unit": "kg", "low_stock_threshold": 50},
    {"name": "Fine Atta", "category": "Flour", "unit": "kg", "low_stock_threshold": 50},
    {"name": "Medium Atta", "category": "Flour", "unit": "kg", "low_stock_threshold": 50},
    {"name": "Coarse Atta", "category": "Flour", "unit": "kg", "low_stock_threshold": 50},
    {"name": "Multigrain Atta", "category": "Flour", "unit": "kg", "low_stock_threshold": 30},
    {"name": "Besan", "category": "Flour", "unit": "kg", "low_stock_threshold": 30},
    {"name": "Makka Atta", "category": "Flour", "unit": "kg", "low_stock_threshold": 30},
    {"name": "Bajra Atta", "category": "Flour", "unit": "kg", "low_stock_threshold": 30},
    {"name": "Sattu", "category": "Flour", "unit": "kg", "low_stock_threshold": 20},
    {"name": "Wheat Bran", "category": "Bran", "unit": "kg", "low_stock_threshold": 30},
    {"name": "Mustard Seeds", "category": "Oil Seeds", "unit": "kg", "low_stock_threshold": 100},
    {"name": "Mustard Oil", "category": "Edible Oil", "unit": "litre", "low_stock_threshold": 20},
    {"name": "Mustard Oil Cake", "category": "Oil Cake", "unit": "kg", "low_stock_threshold": 30},
    {"name": "Packing Bags", "category": "Packing", "unit": "pcs", "low_stock_threshold": 100},
]

async def seed_products():
    for p in DEFAULT_PRODUCTS:
        if await db.products.find_one({"name": p["name"]}) is None:
            await db.products.insert_one({"id": str(uuid.uuid4()), **p, "current_stock": 0,
                "rate": 0, "cost_per_unit": 0, "created_at": now_iso()})

async def get_settings_doc():
    s = await db.settings.find_one({"id": "config"})
    if not s:
        s = {"id": "config", "washed_loss": 2.5, "unwashed_loss": 5.0, "starting_cash": 0}
        await db.settings.insert_one(s)
    return clean(s)

async def adjust_stock_by_name(name, delta):
    await db.products.update_one({"name": name}, {"$inc": {"current_stock": round(delta, 3)}})

async def add_stock_with_cost(pid, qty, total_cost):
    p = await db.products.find_one({"id": pid})
    if not p:
        return
    old_stock = p.get("current_stock", 0)
    old_cost = p.get("cost_per_unit", 0)
    new_stock = old_stock + qty
    new_cost = ((old_stock * old_cost) + total_cost) / new_stock if new_stock > 0 else 0
    await db.products.update_one({"id": pid}, {"$set": {
        "current_stock": round(new_stock, 3), "cost_per_unit": round(new_cost, 4)}})

# ---- build helpers ----
async def build_grinding_doc(body: GrindingBody):
    inv = await next_invoice_number()
    output_atta = round(body.wheat_weight * (1 - body.loss_percent / 100), 2)
    loss_kg = round(body.wheat_weight - output_atta, 2)
    if body.payment_method == "Grain":
        total_charge = 0.0
        customer_receives = round(output_atta - body.grain_fee_kg, 2)
    else:
        total_charge = round(body.wheat_weight * body.charge_per_kg, 2)
        customer_receives = output_atta
    d = body.model_dump()
    d.update({"id": str(uuid.uuid4()), "invoice_number": inv, "output_atta": output_atta,
              "loss_kg": loss_kg, "customer_receives": customer_receives,
              "total_charge": total_charge, "created_at": now_iso()})
    return d

async def build_oil_doc(body: OilBody):
    inv = await next_invoice_number()
    d = body.model_dump()
    d.update({"id": str(uuid.uuid4()), "invoice_number": inv, "total": body.charge,
              "customer_oil": round(body.oil_extracted - body.retained_oil, 2),
              "customer_cake": round(body.oil_cake_produced - body.retained_cake, 2),
              "created_at": now_iso()})
    return d

async def apply_grinding_effects(doc, sign):
    if doc.get("payment_method") == "Grain" and doc.get("grain_fee_kg", 0):
        await adjust_stock_by_name("Atta", sign * doc["grain_fee_kg"])

async def apply_oil_effects(doc, sign):
    if doc.get("retained_oil", 0):
        await adjust_stock_by_name("Mustard Oil", sign * doc["retained_oil"])
    if doc.get("retained_cake", 0):
        await adjust_stock_by_name("Mustard Oil Cake", sign * doc["retained_cake"])

# ---- Settings ----
class SettingsBody(BaseModel):
    washed_loss: float
    unwashed_loss: float
    starting_cash: float = 0

@api_router.get("/settings")
async def read_settings(user: dict = Depends(get_current_user)):
    return await get_settings_doc()

@api_router.put("/settings")
async def write_settings(body: SettingsBody, user: dict = Depends(get_current_user)):
    await db.settings.update_one({"id": "config"}, {"$set": body.model_dump()}, upsert=True)
    return await get_settings_doc()

# ---- Production (converts input product into outputs) ----
class ProdOutput(BaseModel):
    product_id: str
    product_name: str
    quantity: float

class ProductionBody(BaseModel):
    date: str
    mill: str
    input_product_id: str
    input_product_name: str
    input_quantity: float
    outputs: List[ProdOutput]

@api_router.get("/production")
async def get_production(user: dict = Depends(get_current_user)):
    return [clean(p) for p in await db.production.find().sort("date", -1).to_list(2000)]

@api_router.post("/production")
async def create_production(body: ProductionBody, user: dict = Depends(get_current_user)):
    inp = await db.products.find_one({"id": body.input_product_id})
    if not inp:
        raise HTTPException(status_code=404, detail="Input product not found")
    if body.input_quantity > inp.get("current_stock", 0):
        raise HTTPException(status_code=400, detail=f"Not enough stock (have {inp.get('current_stock',0)})")
    input_cost = round(body.input_quantity * inp.get("cost_per_unit", 0), 2)
    total_out = sum(o.quantity for o in body.outputs) or 1
    await db.products.update_one({"id": body.input_product_id}, {"$inc": {"current_stock": -body.input_quantity}})
    out_records = []
    for o in body.outputs:
        allocated = round(input_cost * (o.quantity / total_out), 2)
        await add_stock_with_cost(o.product_id, o.quantity, allocated)
        out_records.append({"product_name": o.product_name, "quantity": o.quantity,
                            "cost": allocated, "cost_per_unit": round(allocated / o.quantity, 3) if o.quantity else 0})
    doc = {"id": str(uuid.uuid4()), "date": body.date, "mill": body.mill,
           "input_product_name": body.input_product_name, "input_quantity": body.input_quantity,
           "input_cost": input_cost, "outputs": out_records, "created_at": now_iso()}
    await db.production.insert_one(doc)
    await log_audit(user, "Production run", f"{body.mill}: {body.input_quantity} {body.input_product_name} → " + ", ".join(f"{o.quantity} {o.product_name}" for o in body.outputs))
    return clean(doc)

@api_router.delete("/production/{pid}")
async def delete_production(pid: str, user: dict = Depends(require_admin)):
    await db.production.delete_one({"id": pid})
    return {"message": "deleted"}

# ---- Exchange (wheat crop for atta) ----
class ExchangeBody(BaseModel):
    date: str
    customer_name: str
    wheat_qty: float
    washed: bool = True
    loss_percent: float = 2.5
    atta_given: float

@api_router.get("/exchanges")
async def get_exchanges(user: dict = Depends(get_current_user)):
    return [clean(e) for e in await db.exchanges.find().sort("date", -1).to_list(2000)]

@api_router.post("/exchanges")
async def create_exchange(body: ExchangeBody, user: dict = Depends(get_current_user)):
    atta = await db.products.find_one({"name": "Atta"})
    if atta and body.atta_given > atta.get("current_stock", 0):
        raise HTTPException(status_code=400, detail=f"Not enough Atta stock (have {atta.get('current_stock',0)} kg)")
    doc = {"id": str(uuid.uuid4()), **body.model_dump(),
           "loss_kg": round(body.wheat_qty * body.loss_percent / 100, 2), "created_at": now_iso()}
    await db.exchanges.insert_one(doc)
    await adjust_stock_by_name("Wheat Crop", body.wheat_qty)
    await adjust_stock_by_name("Atta", -body.atta_given)
    return clean(doc)

@api_router.delete("/exchanges/{eid}")
async def delete_exchange(eid: str, user: dict = Depends(require_admin)):
    e = await db.exchanges.find_one({"id": eid})
    if e:
        await adjust_stock_by_name("Wheat Crop", -e["wheat_qty"])
        await adjust_stock_by_name("Atta", e["atta_given"])
        await db.exchanges.delete_one({"id": eid})
    return {"message": "deleted"}

# ---- Mark as paid ----
class PayBody(BaseModel):
    payment_method: str = "Cash"

async def mark_paid(coll, rid, method):
    doc = await db[coll].find_one({"id": rid})
    if not doc:
        return
    amt = doc.get("total") or doc.get("total_charge") or 0
    await db[coll].update_one({"id": rid}, {"$set": {"payment_status": "Paid", "payment_method": method}})
    await db.invoices.update_one({"ref_id": rid}, {"$set": {"payment_status": "Paid"}})
    exists = await db.payments.find_one({"ref_id": rid})
    if amt and not exists:
        await add_credit("customer", doc.get("customer_name"), amt, doc.get("date"), rid, f"Payment {doc.get('invoice_number','')}")

@api_router.patch("/sales/{rid}/pay")
async def pay_sale(rid: str, body: PayBody, user: dict = Depends(get_current_user)):
    await mark_paid("sales", rid, body.payment_method)
    return {"message": "paid"}

@api_router.patch("/grinding/{rid}/pay")
async def pay_grinding(rid: str, body: PayBody, user: dict = Depends(get_current_user)):
    await mark_paid("grinding", rid, body.payment_method)
    return {"message": "paid"}

@api_router.patch("/oil/{rid}/pay")
async def pay_oil(rid: str, body: PayBody, user: dict = Depends(get_current_user)):
    await mark_paid("oil", rid, body.payment_method)
    return {"message": "paid"}

@api_router.patch("/purchases/{rid}/pay")
async def pay_purchase(rid: str, body: PayBody, user: dict = Depends(get_current_user)):
    p = await db.purchases.find_one({"id": rid})
    await db.purchases.update_one({"id": rid}, {"$set": {"payment_status": "Paid"}})
    if p and not await db.payments.find_one({"ref_id": rid}):
        await add_credit("supplier", p.get("supplier_name"), p.get("total", 0), p.get("date"), rid, "Purchase payment")
    return {"message": "paid"}

# ---- Edit records ----
@api_router.put("/sales/{sid}")
async def edit_sale(sid: str, body: SaleBody, user: dict = Depends(get_current_user)):
    old = await db.sales.find_one({"id": sid})
    if not old:
        raise HTTPException(status_code=404, detail="Not found")
    await db.products.update_one({"id": old["product_id"]}, {"$inc": {"current_stock": old["quantity"]}})
    total = round(body.quantity * body.price, 2)
    await db.sales.update_one({"id": sid}, {"$set": {**body.model_dump(), "total": total}})
    await db.products.update_one({"id": body.product_id}, {"$inc": {"current_stock": -body.quantity}})
    await db.invoices.update_one({"ref_id": sid}, {"$set": {"customer_name": body.customer_name,
        "date": body.date, "total": total, "payment_status": body.payment_status}})
    return clean(await db.sales.find_one({"id": sid}))

@api_router.put("/grinding/{gid}")
async def edit_grinding(gid: str, body: GrindingBody, user: dict = Depends(get_current_user)):
    old = await db.grinding.find_one({"id": gid})
    if not old:
        raise HTTPException(status_code=404, detail="Not found")
    await apply_grinding_effects(old, -1)
    doc = await build_grinding_doc(body)
    doc["id"] = gid
    doc["invoice_number"] = old["invoice_number"]
    await db.grinding.replace_one({"id": gid}, doc)
    await apply_grinding_effects(doc, 1)
    await db.invoices.update_one({"ref_id": gid}, {"$set": {"customer_name": doc["customer_name"],
        "date": doc["date"], "total": doc["total_charge"], "payment_status": doc["payment_status"]}})
    return clean(doc)

@api_router.put("/oil/{oid}")
async def edit_oil(oid: str, body: OilBody, user: dict = Depends(get_current_user)):
    old = await db.oil.find_one({"id": oid})
    if not old:
        raise HTTPException(status_code=404, detail="Not found")
    await apply_oil_effects(old, -1)
    doc = await build_oil_doc(body)
    doc["id"] = oid
    doc["invoice_number"] = old["invoice_number"]
    await db.oil.replace_one({"id": oid}, doc)
    await apply_oil_effects(doc, 1)
    await db.invoices.update_one({"ref_id": oid}, {"$set": {"customer_name": doc["customer_name"],
        "date": doc["date"], "total": doc["total"], "payment_status": doc["payment_status"]}})
    return clean(doc)

@api_router.put("/expenses/{eid}")
async def edit_expense(eid: str, body: ExpenseBody, user: dict = Depends(get_current_user)):
    await db.expenses.update_one({"id": eid}, {"$set": body.model_dump()})
    return clean(await db.expenses.find_one({"id": eid}))

# ---- Daybook (end-of-day summary) ----
@api_router.get("/daybook")
async def daybook(date: str, user: dict = Depends(get_current_user)):
    def f(items):
        return [i for i in items if str(i.get("date", "")) == date]
    sales = f(await db.sales.find().to_list(5000))
    grinding = f(await db.grinding.find().to_list(5000))
    oil = f(await db.oil.find().to_list(5000))
    expenses = f(await db.expenses.find().to_list(5000))
    purchases = f(await db.purchases.find().to_list(5000))
    sales_total = sum(s.get("total", 0) for s in sales)
    grinding_total = sum(g.get("total_charge", 0) for g in grinding)
    oil_total = sum(o.get("total", 0) for o in oil)
    income = sales_total + grinding_total + oil_total
    collected = (sum(s.get("total", 0) for s in sales if s.get("payment_status") == "Paid")
                 + sum(g.get("total_charge", 0) for g in grinding if g.get("payment_status") == "Paid")
                 + sum(o.get("total", 0) for o in oil if o.get("payment_status") == "Paid"))
    exp_total = sum(e.get("amount", 0) for e in expenses)
    return {"date": date, "sales_total": round(sales_total, 2), "grinding_total": round(grinding_total, 2),
            "oil_total": round(oil_total, 2), "income": round(income, 2), "collected": round(collected, 2),
            "pending": round(income - collected, 2), "expenses": round(exp_total, 2),
            "purchases": round(sum(p.get("total", 0) for p in purchases), 2),
            "net": round(collected - exp_total, 2),
            "counts": {"sales": len(sales), "grinding": len(grinding), "oil": len(oil), "expenses": len(expenses)}}

# ==================== Maintenance & Costing ====================

def compute_next_due(last_date, interval_days):
    try:
        d = datetime.fromisoformat(last_date)
    except Exception:
        d = datetime.now(timezone.utc)
    return (d + timedelta(days=int(interval_days))).strftime("%Y-%m-%d")

class MaintenanceBody(BaseModel):
    machine: str
    task: str
    last_service_date: str
    interval_days: int
    notes: str = ""

@api_router.get("/maintenance")
async def get_maintenance(user: dict = Depends(get_current_user)):
    return [clean(m) for m in await db.maintenance.find().sort("next_due_date", 1).to_list(1000)]

@api_router.post("/maintenance")
async def create_maintenance(body: MaintenanceBody, user: dict = Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), **body.model_dump(),
           "next_due_date": compute_next_due(body.last_service_date, body.interval_days), "created_at": now_iso()}
    await db.maintenance.insert_one(doc)
    return clean(doc)

@api_router.put("/maintenance/{mid}")
async def update_maintenance(mid: str, body: MaintenanceBody, user: dict = Depends(get_current_user)):
    await db.maintenance.update_one({"id": mid}, {"$set": {**body.model_dump(),
        "next_due_date": compute_next_due(body.last_service_date, body.interval_days)}})
    return clean(await db.maintenance.find_one({"id": mid}))

@api_router.patch("/maintenance/{mid}/serviced")
async def mark_serviced(mid: str, user: dict = Depends(get_current_user)):
    m = await db.maintenance.find_one({"id": mid})
    if not m:
        raise HTTPException(status_code=404, detail="Not found")
    today_str = datetime.now().strftime("%Y-%m-%d")
    await db.maintenance.update_one({"id": mid}, {"$set": {"last_service_date": today_str,
        "next_due_date": compute_next_due(today_str, m["interval_days"])}})
    return clean(await db.maintenance.find_one({"id": mid}))

@api_router.delete("/maintenance/{mid}")
async def delete_maintenance(mid: str, user: dict = Depends(require_admin)):
    await db.maintenance.delete_one({"id": mid})
    return {"message": "deleted"}

@api_router.get("/costing")
async def costing(user: dict = Depends(get_current_user)):
    finished = {"Flour", "Bran", "Edible Oil", "Oil Cake"}
    rows = []
    for p in await db.products.find().sort("name", 1).to_list(1000):
        if p.get("category") in finished:
            cost = round(p.get("cost_per_unit", 0), 2)
            rate = round(p.get("rate", 0), 2)
            margin = round(rate - cost, 2)
            pct = round((margin / rate * 100), 1) if rate else 0
            rows.append({"id": p["id"], "name": p["name"], "category": p["category"], "unit": p.get("unit", "kg"),
                         "current_stock": p.get("current_stock", 0), "cost_per_unit": cost,
                         "rate": rate, "margin": margin, "margin_pct": pct})
    return rows

# ==================== Ledger, Cash Book, Analytics, Audit ====================

async def add_credit(party_type, name, amount, date, ref_id=None, note=""):
    if not amount:
        return
    await db.payments.insert_one({"id": str(uuid.uuid4()), "party_type": party_type, "party_name": name,
        "amount": round(amount, 2), "date": date, "note": note, "ref_id": ref_id, "created_at": now_iso()})

async def log_audit(user, action, detail=""):
    u = user or {}
    await db.audit.insert_one({"id": str(uuid.uuid4()), "user": u.get("name") or u.get("email") or "system",
        "role": u.get("role", ""), "action": action, "detail": detail, "at": now_iso()})

@api_router.get("/audit")
async def get_audit(user: dict = Depends(get_current_user)):
    return [clean(a) for a in await db.audit.find().sort("at", -1).to_list(500)]

class PaymentBody(BaseModel):
    party_type: str
    party_name: str
    amount: float
    date: str
    note: str = ""

@api_router.get("/payments")
async def list_payments(party_type: Optional[str] = None, party_name: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {}
    if party_type:
        q["party_type"] = party_type
    if party_name:
        q["party_name"] = party_name
    return [clean(p) for p in await db.payments.find(q).sort("date", -1).to_list(5000)]

@api_router.post("/payments")
async def create_payment(body: PaymentBody, user: dict = Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "ref_id": None, "created_at": now_iso()}
    await db.payments.insert_one(doc)
    await log_audit(user, "Recorded payment", f"{body.party_type} {body.party_name}: Rs {body.amount}")
    return clean(doc)

@api_router.delete("/payments/{pid}")
async def delete_payment(pid: str, user: dict = Depends(require_admin)):
    await db.payments.delete_one({"id": pid})
    return {"message": "deleted"}

async def build_ledger(party_type, name):
    entries = []
    if party_type == "customer":
        for coll, field, label in [("sales", "total", "Sale"), ("grinding", "total_charge", "Grinding"), ("oil", "total", "Oil Extraction")]:
            for d in await db[coll].find({"customer_name": name}).to_list(3000):
                if d.get(field, 0):
                    entries.append({"date": d.get("date"), "type": label, "ref": d.get("invoice_number", ""), "debit": round(d.get(field, 0), 2), "credit": 0})
    else:
        for d in await db.purchases.find({"supplier_name": name}).to_list(3000):
            entries.append({"date": d.get("date"), "type": "Purchase", "ref": d.get("product_name", ""), "debit": round(d.get("total", 0), 2), "credit": 0})
    for p in await db.payments.find({"party_type": party_type, "party_name": name}).to_list(3000):
        entries.append({"date": p.get("date"), "type": "Payment", "ref": p.get("note", ""), "debit": 0, "credit": round(p.get("amount", 0), 2)})
    entries.sort(key=lambda e: (e.get("date") or ""))
    bal = 0.0
    for e in entries:
        bal += e["debit"] - e["credit"]
        e["balance"] = round(bal, 2)
    return {"name": name, "entries": entries, "total_debit": round(sum(e["debit"] for e in entries), 2),
            "total_credit": round(sum(e["credit"] for e in entries), 2), "balance": round(bal, 2)}

@api_router.get("/customers/{cid}/ledger")
async def customer_ledger(cid: str, user: dict = Depends(get_current_user)):
    c = await db.customers.find_one({"id": cid})
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    return await build_ledger("customer", c["name"])

@api_router.get("/suppliers/{sid}/ledger")
async def supplier_ledger(sid: str, user: dict = Depends(get_current_user)):
    s = await db.suppliers.find_one({"id": sid})
    if not s:
        raise HTTPException(status_code=404, detail="Not found")
    return await build_ledger("supplier", s["name"])

@api_router.get("/cashbook")
async def cashbook(date: str, user: dict = Depends(get_current_user)):
    settings = await get_settings_doc()
    starting = settings.get("starting_cash", 0) or 0
    payments = await db.payments.find().to_list(20000)
    expenses = await db.expenses.find().to_list(20000)
    cust_in = [p for p in payments if p.get("party_type") == "customer"]
    supp_out = [p for p in payments if p.get("party_type") == "supplier"]
    def before(items):
        return [i for i in items if str(i.get("date", "")) < date]
    def on(items):
        return [i for i in items if str(i.get("date", "")) == date]
    opening = starting + sum(p["amount"] for p in before(cust_in)) - sum(p["amount"] for p in before(supp_out)) - sum(e.get("amount", 0) for e in before(expenses))
    in_today = sum(p["amount"] for p in on(cust_in))
    supp_today = sum(p["amount"] for p in on(supp_out))
    exp_today = sum(e.get("amount", 0) for e in on(expenses))
    closing = opening + in_today - supp_today - exp_today
    return {"date": date, "opening": round(opening, 2), "payments_received": round(in_today, 2),
            "supplier_payments": round(supp_today, 2), "expenses": round(exp_today, 2), "closing": round(closing, 2)}

@api_router.get("/sales-analytics")
async def sales_analytics(user: dict = Depends(get_current_user)):
    sales = await db.sales.find().to_list(30000)
    products = {p["name"]: p for p in await db.products.find().to_list(1000)}
    t = datetime.now().strftime("%Y-%m-%d")
    m = t[:7]
    y = t[:4]
    def rev(prefix):
        return round(sum(s.get("total", 0) for s in sales if str(s.get("date", "")).startswith(prefix)), 2)
    agg = {}
    for s in sales:
        n = s.get("product_name", "?")
        a = agg.setdefault(n, {"name": n, "qty": 0.0, "revenue": 0.0, "profit": 0.0})
        a["qty"] += s.get("quantity", 0)
        a["revenue"] += s.get("total", 0)
        cost = products.get(n, {}).get("cost_per_unit", 0)
        a["profit"] += s.get("total", 0) - s.get("quantity", 0) * cost
    rows = sorted(agg.values(), key=lambda r: r["revenue"], reverse=True)
    for r in rows:
        r["qty"] = round(r["qty"], 2)
        r["revenue"] = round(r["revenue"], 2)
        r["profit"] = round(r["profit"], 2)
    return {"today": rev(t), "month": rev(m), "year": rev(y),
            "total_revenue": round(sum(s.get("total", 0) for s in sales), 2),
            "total_profit": round(sum(r["profit"] for r in rows), 2),
            "by_product": rows, "top": rows[:5], "least": rows[-5:][::-1] if rows else []}

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
