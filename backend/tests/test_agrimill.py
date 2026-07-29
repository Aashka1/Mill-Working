"""AgriMill Hub - comprehensive backend API tests."""
import os
import io
import pytest
import requests
from datetime import date

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mill-management-pro-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@agrimill.com", "password": "admin123"}
STAFF = {"email": "staff@agrimill.com", "password": "staff123"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    assert "access_token" in s.cookies
    return s


@pytest.fixture(scope="session")
def admin():
    return _login(ADMIN)


@pytest.fixture(scope="session")
def staff():
    return _login(STAFF)


# ---------------- Auth ----------------
class TestAuth:
    def test_login_admin(self):
        s = _login(ADMIN)
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == ADMIN["email"]
        assert data["role"] == "admin"
        assert "id" in data

    def test_login_staff(self):
        s = _login(STAFF)
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["role"] == "staff"

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": "admin@agrimill.com", "password": "wrong"}, timeout=15)
        assert r.status_code in (401, 429)

    def test_me_unauthenticated(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401

    def test_logout(self, admin):
        s = _login(ADMIN)
        r = s.post(f"{API}/auth/logout")
        assert r.status_code == 200
        r2 = s.get(f"{API}/auth/me")
        assert r2.status_code == 401


# ---------------- Products / Inventory ----------------
class TestProducts:
    def test_create_list_and_low_stock(self, admin):
        payload = {"name": f"TEST_Wheat_{os.urandom(3).hex()}", "category": "Wheat",
                   "unit": "kg", "current_stock": 10, "rate": 30, "low_stock_threshold": 50}
        r = admin.post(f"{API}/products", json=payload)
        assert r.status_code == 200, r.text
        pd = r.json()
        assert pd["name"] == payload["name"]
        assert "id" in pd
        pytest.product_id = pd["id"]
        # list
        r2 = admin.get(f"{API}/products")
        assert r2.status_code == 200
        assert any(p["id"] == pd["id"] for p in r2.json())

    def test_purchase_increments_stock(self, admin):
        pid = pytest.product_id
        before = next(p for p in admin.get(f"{API}/products").json() if p["id"] == pid)["current_stock"]
        payload = {"date": date.today().isoformat(), "supplier_name": "TEST_Sup",
                   "product_id": pid, "product_name": "TEST_Wheat", "quantity": 100, "rate": 25,
                   "payment_status": "Pending"}
        r = admin.post(f"{API}/purchases", json=payload)
        assert r.status_code == 200, r.text
        assert r.json()["total"] == 2500
        after = next(p for p in admin.get(f"{API}/products").json() if p["id"] == pid)["current_stock"]
        assert after == before + 100

    def test_sale_decrements_stock_and_creates_invoice(self, admin):
        pid = pytest.product_id
        before = next(p for p in admin.get(f"{API}/products").json() if p["id"] == pid)["current_stock"]
        payload = {"date": date.today().isoformat(), "customer_name": "TEST_Cust",
                   "product_id": pid, "product_name": "TEST_Wheat", "quantity": 20, "price": 40,
                   "payment_status": "Pending"}
        r = admin.post(f"{API}/sales", json=payload)
        assert r.status_code == 200, r.text
        sale = r.json()
        assert sale["total"] == 800
        assert sale["invoice_number"].startswith("INV-")
        pytest.sale_id = sale["id"]
        pytest.sale_inv = sale["invoice_number"]
        after = next(p for p in admin.get(f"{API}/products").json() if p["id"] == pid)["current_stock"]
        assert after == before - 20
        # invoice list contains
        invs = admin.get(f"{API}/invoices").json()
        assert any(i["ref_id"] == sale["id"] for i in invs)

    def test_sale_pdf(self, admin):
        r = admin.get(f"{API}/invoices/{pytest.sale_id}/pdf")
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"

    def test_export_sales_excel(self, admin):
        r = admin.get(f"{API}/export/sales")
        assert r.status_code == 200
        assert "spreadsheetml" in r.headers.get("content-type", "")
        assert r.content[:2] == b"PK"  # xlsx = zip

    def test_staff_cannot_delete_product(self, staff):
        # create a product to try to delete
        payload = {"name": f"TEST_Del_{os.urandom(3).hex()}", "category": "Oil", "unit": "L",
                   "current_stock": 5, "rate": 100, "low_stock_threshold": 10}
        s = _login(ADMIN)
        pid = s.post(f"{API}/products", json=payload).json()["id"]
        r = staff.delete(f"{API}/products/{pid}")
        assert r.status_code == 403
        # admin can
        r2 = s.delete(f"{API}/products/{pid}")
        assert r2.status_code == 200


# ---------------- Grinding & Oil ----------------
class TestServices:
    def test_grinding_no_inventory_impact(self, admin):
        pid = pytest.product_id
        before = next(p for p in admin.get(f"{API}/products").json() if p["id"] == pid)["current_stock"]
        payload = {"date": date.today().isoformat(), "customer_name": "TEST_GrindCust",
                   "wheat_weight": 50, "charge_per_kg": 4, "payment_status": "Pending"}
        r = admin.post(f"{API}/grinding", json=payload)
        assert r.status_code == 200, r.text
        g = r.json()
        assert g["total_charge"] == 200
        assert g["invoice_number"].startswith("INV-")
        after = next(p for p in admin.get(f"{API}/products").json() if p["id"] == pid)["current_stock"]
        assert after == before  # unchanged
        pytest.grind_id = g["id"]

    def test_oil_no_inventory_impact(self, admin):
        pid = pytest.product_id
        before = next(p for p in admin.get(f"{API}/products").json() if p["id"] == pid)["current_stock"]
        payload = {"date": date.today().isoformat(), "customer_name": "TEST_OilCust",
                   "seed_type": "Mustard", "quantity_received": 30, "oil_extracted": 10,
                   "charge": 150, "payment_status": "Pending"}
        r = admin.post(f"{API}/oil", json=payload)
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["total"] == 150
        after = next(p for p in admin.get(f"{API}/products").json() if p["id"] == pid)["current_stock"]
        assert after == before
        pytest.oil_id = o["id"]

    def test_grinding_pdf(self, admin):
        r = admin.get(f"{API}/invoices/{pytest.grind_id}/pdf")
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

    def test_oil_pdf(self, admin):
        r = admin.get(f"{API}/invoices/{pytest.oil_id}/pdf")
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"


# ---------------- Expenses / Customers / Suppliers ----------------
class TestOther:
    def test_expense_create(self, admin):
        r = admin.post(f"{API}/expenses", json={"date": date.today().isoformat(),
            "category": "Electricity", "description": "TEST_exp", "amount": 500})
        assert r.status_code == 200
        assert r.json()["amount"] == 500

    def test_customer_outstanding_and_history(self, admin):
        cname = "TEST_Cust"
        r = admin.post(f"{API}/customers", json={"name": cname, "phone": "9999", "address": "x"})
        assert r.status_code == 200
        cid = r.json()["id"]
        customers = admin.get(f"{API}/customers").json()
        c = next(c for c in customers if c["id"] == cid)
        # sale (800 pending) created earlier under this customer name
        assert c["outstanding"] >= 800
        hist = admin.get(f"{API}/customers/{cid}/history").json()
        assert len(hist["sales"]) >= 1

    def test_supplier_outstanding(self, admin):
        sname = "TEST_Sup"
        r = admin.post(f"{API}/suppliers", json={"name": sname, "phone": "8888", "address": "y"})
        assert r.status_code == 200
        sid = r.json()["id"]
        suppliers = admin.get(f"{API}/suppliers").json()
        s = next(x for x in suppliers if x["id"] == sid)
        assert s["outstanding"] >= 2500  # pending purchase from earlier

    def test_dashboard(self, admin):
        r = admin.get(f"{API}/dashboard")
        assert r.status_code == 200
        d = r.json()
        for k in ["total_income", "total_sales", "profit", "pending_customer",
                  "supplier_dues", "low_stock", "trend", "revenue_breakdown"]:
            assert k in d
        assert isinstance(d["trend"], list) and len(d["trend"]) == 6
        assert isinstance(d["revenue_breakdown"], list) and len(d["revenue_breakdown"]) == 3

    def test_notifications(self, admin):
        r = admin.get(f"{API}/notifications")
        assert r.status_code == 200
        notes = r.json()
        assert isinstance(notes, list)
        types = {n["type"] for n in notes}
        # We have pending sale, grinding, oil, supplier purchase, and low stock product
        assert "pending_payment" in types
        assert "supplier_due" in types

    def test_invoices_list(self, admin):
        r = admin.get(f"{API}/invoices")
        assert r.status_code == 200
        invs = r.json()
        assert isinstance(invs, list) and len(invs) >= 3
        assert all("ref_id" in i and "invoice_number" in i for i in invs)


# ---------------- Cleanup ----------------
@pytest.fixture(scope="session", autouse=True)
def cleanup(request):
    yield
    try:
        s = _login(ADMIN)
        # delete TEST_ products
        for p in s.get(f"{API}/products").json():
            if p["name"].startswith("TEST_"):
                s.delete(f"{API}/products/{p['id']}")
        for c in s.get(f"{API}/customers").json():
            if c["name"].startswith("TEST_"):
                s.delete(f"{API}/customers/{c['id']}")
        for sup in s.get(f"{API}/suppliers").json():
            if sup["name"].startswith("TEST_"):
                s.delete(f"{API}/suppliers/{sup['id']}")
    except Exception as e:
        print("cleanup error", e)
