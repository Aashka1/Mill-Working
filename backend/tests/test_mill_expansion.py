"""AgriMill Hub - business logic expansion tests (settings, production, grinding, oil, exchange, pay, edit, daybook)."""
import os
import pytest
import requests
from datetime import date

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mill-management-pro-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@agrimill.com", "password": "admin123"}
TODAY = date.today().isoformat()


def _login(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN)


def _product(admin, name):
    for p in admin.get(f"{API}/products").json():
        if p["name"] == name:
            return p
    return None


def _stock(admin, name):
    p = _product(admin, name)
    return p["current_stock"] if p else 0


# ------- Settings -------
class TestSettings:
    def test_get_and_update(self, admin):
        r = admin.get(f"{API}/settings")
        assert r.status_code == 200
        d = r.json()
        assert "washed_loss" in d and "unwashed_loss" in d
        # update
        r2 = admin.put(f"{API}/settings", json={"washed_loss": 3.0, "unwashed_loss": 6.0})
        assert r2.status_code == 200
        assert r2.json()["washed_loss"] == 3.0
        assert r2.json()["unwashed_loss"] == 6.0
        # restore defaults
        admin.put(f"{API}/settings", json={"washed_loss": 2.5, "unwashed_loss": 5.0})


# ------- Production -------
class TestProduction:
    def test_production_flow_and_reject_over_stock(self, admin):
        wheat = _product(admin, "Wheat Crop")
        atta = _product(admin, "Atta")
        bran = _product(admin, "Wheat Bran")
        assert wheat and atta and bran

        # Seed Wheat Crop stock via purchase (100kg @ 25 => cost/unit=25)
        buy = {"date": TODAY, "supplier_name": "TEST_Sup_prod",
               "product_id": wheat["id"], "product_name": "Wheat Crop",
               "quantity": 200, "rate": 25, "payment_status": "Paid"}
        r = admin.post(f"{API}/purchases", json=buy)
        assert r.status_code == 200

        wheat_before = _stock(admin, "Wheat Crop")
        atta_before = _stock(admin, "Atta")
        bran_before = _stock(admin, "Wheat Bran")

        payload = {
            "date": TODAY, "mill": "Flour Mill",
            "input_product_id": wheat["id"], "input_product_name": "Wheat Crop",
            "input_quantity": 100,
            "outputs": [
                {"product_id": atta["id"], "product_name": "Atta", "quantity": 85},
                {"product_id": bran["id"], "product_name": "Wheat Bran", "quantity": 13},
            ],
        }
        r = admin.post(f"{API}/production", json=payload)
        assert r.status_code == 200, r.text
        prod = r.json()
        assert prod["input_cost"] > 0
        assert sum(o["cost"] for o in prod["outputs"]) == pytest.approx(prod["input_cost"], abs=0.05)

        assert _stock(admin, "Wheat Crop") == wheat_before - 100
        assert _stock(admin, "Atta") == atta_before + 85
        assert _stock(admin, "Wheat Bran") == bran_before + 13

        # Wheat crop cost_per_unit should be > 0 (from purchase)
        wc = _product(admin, "Wheat Crop")
        assert wc["cost_per_unit"] > 0

        # Reject over-stock
        cur = _stock(admin, "Wheat Crop")
        bad = {**payload, "input_quantity": cur + 5000}
        r2 = admin.post(f"{API}/production", json=bad)
        assert r2.status_code == 400


# ------- Grinding -------
class TestGrinding:
    def test_cash_and_grain_grinding(self, admin):
        # Cash: total_charge = weight * charge_per_kg, no stock impact
        atta_before = _stock(admin, "Atta")
        cash_payload = {"date": TODAY, "customer_name": "TEST_GrindCash",
                        "wheat_weight": 100, "washed": True, "loss_percent": 2.5,
                        "charge_per_kg": 3, "payment_method": "Cash",
                        "grain_fee_kg": 0, "payment_status": "Pending"}
        r = admin.post(f"{API}/grinding", json=cash_payload)
        assert r.status_code == 200, r.text
        g = r.json()
        assert g["output_atta"] == pytest.approx(97.5)
        assert g["loss_kg"] == pytest.approx(2.5)
        assert g["total_charge"] == 300
        assert _stock(admin, "Atta") == atta_before  # cash: no stock change

        # Grain: total_charge=0, grain_fee added to Atta stock
        grain_payload = {"date": TODAY, "customer_name": "TEST_GrindGrain",
                         "wheat_weight": 100, "washed": False, "loss_percent": 5.0,
                         "charge_per_kg": 0, "payment_method": "Grain",
                         "grain_fee_kg": 4, "payment_status": "Paid"}
        r2 = admin.post(f"{API}/grinding", json=grain_payload)
        assert r2.status_code == 200, r2.text
        g2 = r2.json()
        assert g2["output_atta"] == pytest.approx(95.0)
        assert g2["total_charge"] == 0
        assert g2["customer_receives"] == pytest.approx(91.0)
        assert _stock(admin, "Atta") == pytest.approx(atta_before + 4)
        pytest.grind_grain_id = g2["id"]

        # Mark-as-paid on cash grinding
        pay = admin.patch(f"{API}/grinding/{g['id']}/pay", json={"payment_method": "Cash"})
        assert pay.status_code == 200
        # verify status flipped
        gg = next(x for x in admin.get(f"{API}/grinding").json() if x["id"] == g["id"])
        assert gg["payment_status"] == "Paid"

        # Edit grinding: change grain_fee_kg from 4->6 → net atta stock should increase by 2
        atta_mid = _stock(admin, "Atta")
        edit_payload = {**grain_payload, "grain_fee_kg": 6}
        er = admin.put(f"{API}/grinding/{pytest.grind_grain_id}", json=edit_payload)
        assert er.status_code == 200
        assert _stock(admin, "Atta") == pytest.approx(atta_mid + 2)

        # Delete grain grinding (admin) reverses atta
        atta_before_del = _stock(admin, "Atta")
        dr = admin.delete(f"{API}/grinding/{pytest.grind_grain_id}")
        assert dr.status_code == 200
        assert _stock(admin, "Atta") == pytest.approx(atta_before_del - 6)


# ------- Oil -------
class TestOil:
    def test_retain_and_edit_delete(self, admin):
        mo_before = _stock(admin, "Mustard Oil")
        mc_before = _stock(admin, "Mustard Oil Cake")
        payload = {"date": TODAY, "customer_name": "TEST_OilRetain",
                   "seed_type": "Mustard", "quantity_received": 50,
                   "oil_extracted": 15, "oil_cake_produced": 30,
                   "charge": 0, "payment_method": "Retain Oil",
                   "retained_oil": 3, "retained_cake": 5,
                   "payment_status": "Paid"}
        r = admin.post(f"{API}/oil", json=payload)
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["customer_oil"] == pytest.approx(12)
        assert o["customer_cake"] == pytest.approx(25)
        assert _stock(admin, "Mustard Oil") == pytest.approx(mo_before + 3)
        assert _stock(admin, "Mustard Oil Cake") == pytest.approx(mc_before + 5)
        oid = o["id"]

        # Mark paid
        p = admin.patch(f"{API}/oil/{oid}/pay", json={"payment_method": "Cash"})
        assert p.status_code == 200

        # Edit oil - change retained_oil 3 -> 5, retained_cake 5 -> 4
        edit = {**payload, "retained_oil": 5, "retained_cake": 4}
        er = admin.put(f"{API}/oil/{oid}", json=edit)
        assert er.status_code == 200
        assert _stock(admin, "Mustard Oil") == pytest.approx(mo_before + 5)
        assert _stock(admin, "Mustard Oil Cake") == pytest.approx(mc_before + 4)

        # Delete reverses
        d = admin.delete(f"{API}/oil/{oid}")
        assert d.status_code == 200
        assert _stock(admin, "Mustard Oil") == pytest.approx(mo_before)
        assert _stock(admin, "Mustard Oil Cake") == pytest.approx(mc_before)


# ------- Exchange -------
class TestExchange:
    def test_exchange_and_delete(self, admin):
        wc_before = _stock(admin, "Wheat Crop")
        atta_before = _stock(admin, "Atta")
        payload = {"date": TODAY, "customer_name": "TEST_Exch",
                   "wheat_qty": 50, "washed": True, "loss_percent": 2.5,
                   "atta_given": 48}
        r = admin.post(f"{API}/exchanges", json=payload)
        assert r.status_code == 200, r.text
        e = r.json()
        assert e["loss_kg"] == pytest.approx(1.25)
        assert _stock(admin, "Wheat Crop") == pytest.approx(wc_before + 50)
        assert _stock(admin, "Atta") == pytest.approx(atta_before - 48)
        # delete reverses
        d = admin.delete(f"{API}/exchanges/{e['id']}")
        assert d.status_code == 200
        assert _stock(admin, "Wheat Crop") == pytest.approx(wc_before)
        assert _stock(admin, "Atta") == pytest.approx(atta_before)


# ------- Sale Edit + Mark Paid -------
class TestSaleEdit:
    def test_edit_sale_net_stock(self, admin):
        atta = _product(admin, "Atta")
        assert atta["current_stock"] >= 20
        atta_before = _stock(admin, "Atta")
        create = {"date": TODAY, "customer_name": "TEST_SaleEdit",
                  "product_id": atta["id"], "product_name": "Atta",
                  "quantity": 10, "price": 40, "payment_status": "Pending"}
        r = admin.post(f"{API}/sales", json=create)
        assert r.status_code == 200
        sale = r.json()
        assert _stock(admin, "Atta") == pytest.approx(atta_before - 10)

        # Edit quantity 10 -> 15: net -15 vs original -10 => atta_before - 15
        edit = {**create, "quantity": 15}
        er = admin.put(f"{API}/sales/{sale['id']}", json=edit)
        assert er.status_code == 200
        assert _stock(admin, "Atta") == pytest.approx(atta_before - 15)

        # Mark paid
        p = admin.patch(f"{API}/sales/{sale['id']}/pay", json={"payment_method": "Cash"})
        assert p.status_code == 200
        # verify invoice status Paid
        invs = admin.get(f"{API}/invoices").json()
        inv = next(i for i in invs if i["ref_id"] == sale["id"])
        assert inv["payment_status"] == "Paid"

        # cleanup: delete
        admin.delete(f"{API}/sales/{sale['id']}")


# ------- Daybook -------
class TestDaybook:
    def test_daybook_returns_summary(self, admin):
        r = admin.get(f"{API}/daybook", params={"date": TODAY})
        assert r.status_code == 200
        d = r.json()
        for k in ["income", "collected", "pending", "expenses", "net", "counts"]:
            assert k in d
        assert set(d["counts"].keys()) >= {"sales", "grinding", "oil", "expenses"}


# ------- Cleanup -------
@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    try:
        s = _login(ADMIN)
        for sup in s.get(f"{API}/suppliers").json():
            if sup["name"].startswith("TEST_"):
                s.delete(f"{API}/suppliers/{sup['id']}")
    except Exception as e:
        print("cleanup error", e)
