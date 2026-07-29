"""Iteration 4 backend tests: payments/ledger, cashbook, sales-analytics, audit, seeded products, settings."""
import os
import time
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip()
BASE = BASE.rstrip("/")
API = f"{BASE}/api"

ADMIN = {"email": "admin@agrimill.com", "password": "admin123"}


@pytest.fixture(scope="module")
def sess():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, r.text
    return s


# ---------------- Seeded products ----------------

def test_seeded_products_include_new_types(sess):
    r = sess.get(f"{API}/products")
    assert r.status_code == 200
    names = {p["name"] for p in r.json()}
    for n in ["Fine Atta", "Medium Atta", "Coarse Atta", "Multigrain Atta",
              "Besan", "Makka Atta", "Bajra Atta", "Sattu", "Packing Bags",
              "Wheat Bran", "Mustard Oil Cake"]:
        assert n in names, f"missing seed: {n}"


# ---------------- Settings ----------------

def test_settings_get_put_persists(sess):
    r = sess.get(f"{API}/settings"); assert r.status_code == 200
    body = {"washed_loss": 2.7, "unwashed_loss": 5.2, "starting_cash": 1234.5}
    r = sess.put(f"{API}/settings", json=body); assert r.status_code == 200
    r = sess.get(f"{API}/settings"); d = r.json()
    assert d["washed_loss"] == 2.7 and d["unwashed_loss"] == 5.2 and d["starting_cash"] == 1234.5


# ---------------- Customer ledger + partial payment + auto-credit ----------------

@pytest.fixture(scope="module")
def scenario(sess):
    ts = int(time.time())
    cname = f"TEST_LedgerCust_{ts}"
    r = sess.post(f"{API}/customers", json={"name": cname, "phone": "9", "address": "x"})
    assert r.status_code == 200, r.text
    cust = r.json()

    # a Pending grinding of 200
    r = sess.post(f"{API}/grinding", json={
        "date": "2026-01-05", "customer_name": cname, "wheat_weight": 100,
        "washed": True, "loss_percent": 2.5, "charge_per_kg": 2,
        "payment_method": "Cash", "grain_fee_kg": 0, "payment_status": "Pending",
    })
    assert r.status_code == 200, r.text
    grinding = r.json()  # total_charge=200

    return {"customer": cust, "grinding": grinding, "name": cname}


def test_customer_ledger_debit_from_grinding(sess, scenario):
    cid = scenario["customer"]["id"]
    r = sess.get(f"{API}/customers/{cid}/ledger"); assert r.status_code == 200
    d = r.json()
    assert d["total_debit"] >= 200
    assert d["balance"] == round(d["total_debit"] - d["total_credit"], 2)
    debit_entries = [e for e in d["entries"] if e["type"] == "Grinding"]
    assert any(e["debit"] == 200 for e in debit_entries)


def test_partial_payment_reduces_outstanding(sess, scenario):
    cid = scenario["customer"]["id"]; name = scenario["name"]
    r = sess.post(f"{API}/payments", json={
        "party_type": "customer", "party_name": name, "amount": 50,
        "date": "2026-01-06", "note": "Partial"})
    assert r.status_code == 200
    r = sess.get(f"{API}/customers/{cid}/ledger"); d = r.json()
    assert d["total_credit"] >= 50
    assert d["balance"] == round(d["total_debit"] - d["total_credit"], 2)
    # customer list outstanding
    cs = sess.get(f"{API}/customers").json()
    me = next(c for c in cs if c["id"] == cid)
    assert me["outstanding"] == d["balance"]


def test_paid_sale_auto_credits_no_outstanding(sess, scenario):
    name = scenario["name"]
    # Need a product with stock; use Packing Bags after adding stock via purchase
    products = sess.get(f"{API}/products").json()
    bags = next(p for p in products if p["name"] == "Packing Bags")
    # top up stock
    sess.put(f"{API}/products/{bags['id']}", json={
        **{k: bags.get(k) for k in ["name", "category", "unit", "rate", "cost_per_unit", "low_stock_threshold"]},
        "current_stock": 500,
    })
    ts = int(time.time())
    paid_cust = f"TEST_PaidCust_{ts}"
    sess.post(f"{API}/customers", json={"name": paid_cust})
    r = sess.post(f"{API}/sales", json={
        "date": "2026-01-06", "customer_name": paid_cust,
        "product_id": bags["id"], "product_name": "Packing Bags",
        "quantity": 10, "price": 5, "payment_status": "Paid"})
    assert r.status_code == 200
    cs = sess.get(f"{API}/customers").json()
    me = next(c for c in cs if c["name"] == paid_cust)
    assert me["outstanding"] == 0, f"expected 0 outstanding, got {me['outstanding']}"


def test_mark_as_paid_creates_single_credit(sess, scenario):
    gid = scenario["grinding"]["id"]; cid = scenario["customer"]["id"]
    r = sess.patch(f"{API}/grinding/{gid}/pay", json={"payment_method": "Cash"})
    assert r.status_code == 200
    # call again — should not double-credit
    sess.patch(f"{API}/grinding/{gid}/pay", json={"payment_method": "Cash"})
    d = sess.get(f"{API}/customers/{cid}/ledger").json()
    # credits after partial (50) + mark-as-paid (200) = 250 for a debit of 200
    # so balance should be -50 (customer overpaid; still ok)
    assert d["total_credit"] >= 200
    # ensure only one credit payment tied to this grinding ref
    payments = sess.get(f"{API}/payments", params={"party_type": "customer", "party_name": scenario["name"]}).json()
    ref_matches = [p for p in payments if p.get("ref_id") == gid]
    assert len(ref_matches) == 1, f"double-credit: {ref_matches}"


# ---------------- Supplier ledger ----------------

def test_supplier_ledger_and_auto_credit(sess):
    ts = int(time.time())
    sname = f"TEST_LedgerSup_{ts}"
    r = sess.post(f"{API}/suppliers", json={"name": sname})
    sid = r.json()["id"]
    products = sess.get(f"{API}/products").json()
    prod = products[0]
    r = sess.post(f"{API}/purchases", json={
        "date": "2026-01-05", "supplier_name": sname,
        "product_id": prod["id"], "product_name": prod["name"],
        "quantity": 10, "rate": 20, "payment_status": "Paid"})
    assert r.status_code == 200
    d = sess.get(f"{API}/suppliers/{sid}/ledger").json()
    assert any(e["type"] == "Purchase" and e["debit"] == 200 for e in d["entries"])
    assert any(e["type"] == "Payment" and e["credit"] == 200 for e in d["entries"])
    sups = sess.get(f"{API}/suppliers").json()
    me = next(s for s in sups if s["id"] == sid)
    assert me["outstanding"] == 0


# ---------------- Cash Book ----------------

def test_cashbook_structure_and_starting_cash(sess):
    sess.put(f"{API}/settings", json={"washed_loss": 2.5, "unwashed_loss": 5.0, "starting_cash": 1000})
    r = sess.get(f"{API}/cashbook", params={"date": "2026-01-06"})
    assert r.status_code == 200
    d = r.json()
    for k in ["opening", "payments_received", "supplier_payments", "expenses", "closing"]:
        assert k in d
    assert d["payments_received"] >= 50  # partial paid on 2026-01-06 earlier
    # closing = opening + received - suppliers - expenses
    assert d["closing"] == round(d["opening"] + d["payments_received"] - d["supplier_payments"] - d["expenses"], 2)


# ---------------- Sales analytics ----------------

def test_sales_analytics(sess):
    r = sess.get(f"{API}/sales-analytics"); assert r.status_code == 200
    d = r.json()
    for k in ["today", "month", "year", "total_revenue", "total_profit", "by_product", "top", "least"]:
        assert k in d
    assert len(d["top"]) <= 5
    if d["by_product"]:
        r0 = d["by_product"][0]
        for k in ["name", "qty", "revenue", "profit"]:
            assert k in r0


# ---------------- Audit log ----------------

def test_audit_logs_stock_change_and_sale(sess):
    products = sess.get(f"{API}/products").json()
    prod = next(p for p in products if p["name"] == "Sattu")
    old_stock = prod.get("current_stock", 0)
    sess.put(f"{API}/products/{prod['id']}", json={
        **{k: prod.get(k) for k in ["name", "category", "unit", "rate", "cost_per_unit", "low_stock_threshold"]},
        "current_stock": old_stock + 5,
    })
    a = sess.get(f"{API}/audit").json()
    assert any("Sattu" in (x.get("detail") or "") and "Changed stock" in x.get("action", "") for x in a)


def test_notifications_low_stock_includes_new_products(sess):
    r = sess.get(f"{API}/notifications"); assert r.status_code == 200
    msgs = " | ".join(n["message"] for n in r.json())
    # Some seed products with 0 stock should appear (e.g. Besan, Bajra Atta)
    assert "Low stock" in msgs
