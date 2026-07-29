"""Iteration 3 tests: Costing, Maintenance, Sattu workflow."""
import os
import pytest
import requests
from datetime import date, datetime, timedelta

def _load_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return os.environ.get("REACT_APP_BACKEND_URL", "")

BASE_URL = _load_env().rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not found"
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@agrimill.com", "password": "admin123"}
STAFF = {"email": "staff@agrimill.com", "password": "staff123"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def staff():
    return _login(STAFF)


def _get_products(s):
    r = s.get(f"{API}/products")
    assert r.status_code == 200
    return r.json()


def _product_by_name(s, name):
    for p in _get_products(s):
        if p["name"] == name:
            return p
    return None


# ---------------- Costing ----------------
class TestCosting:
    def test_seeded_sattu_exists(self, admin):
        p = _product_by_name(admin, "Sattu")
        assert p is not None, "Sattu should be seeded"
        assert p["category"] == "Flour"

    def test_costing_returns_finished_goods(self, admin):
        r = admin.get(f"{API}/costing")
        assert r.status_code == 200
        rows = r.json()
        names = [x["name"] for x in rows]
        # Should include finished goods
        for expected in ["Atta", "Sattu", "Wheat Bran", "Mustard Oil", "Mustard Oil Cake"]:
            assert expected in names, f"{expected} missing from costing. Got: {names}"
        for row in rows:
            assert row["category"] in {"Flour", "Bran", "Edible Oil", "Oil Cake"}
            assert "cost_per_unit" in row
            assert "rate" in row
            assert "margin" in row
            assert "margin_pct" in row
            # margin = rate - cost
            assert abs(row["margin"] - round(row["rate"] - row["cost_per_unit"], 2)) < 0.01

    def test_costing_excludes_raw(self, admin):
        r = admin.get(f"{API}/costing")
        names = [x["name"] for x in r.json()]
        assert "Wheat Crop" not in names
        assert "Mustard Seeds" not in names

    def test_edit_selling_price_updates_margin(self, admin):
        atta = _product_by_name(admin, "Atta")
        assert atta is not None
        new_rate = 45.0
        body = {
            "name": atta["name"], "category": atta["category"], "unit": atta["unit"],
            "current_stock": atta["current_stock"], "rate": new_rate,
            "cost_per_unit": atta.get("cost_per_unit", 0),
            "low_stock_threshold": atta.get("low_stock_threshold", 50),
        }
        r = admin.put(f"{API}/products/{atta['id']}", json=body)
        assert r.status_code == 200
        # Fetch costing and verify
        rows = admin.get(f"{API}/costing").json()
        atta_row = next(x for x in rows if x["name"] == "Atta")
        assert atta_row["rate"] == new_rate
        assert abs(atta_row["margin"] - round(new_rate - atta_row["cost_per_unit"], 2)) < 0.01
        expected_pct = round((atta_row["margin"] / new_rate) * 100, 1) if new_rate else 0
        assert atta_row["margin_pct"] == expected_pct


# ---------------- Sattu Workflow ----------------
class TestSattu:
    def test_production_sattu_from_wheat(self, admin):
        wheat = _product_by_name(admin, "Wheat Crop")
        sattu = _product_by_name(admin, "Sattu")
        assert wheat and sattu

        # Ensure wheat has stock: purchase some
        pr = admin.post(f"{API}/purchases", json={
            "date": date.today().isoformat(), "supplier_name": "TEST_Supplier",
            "product_id": wheat["id"], "product_name": "Wheat Crop",
            "quantity": 100, "rate": 30, "payment_status": "Paid",
        })
        assert pr.status_code == 200

        wheat_before = _product_by_name(admin, "Wheat Crop")["current_stock"]
        sattu_before = _product_by_name(admin, "Sattu")["current_stock"]

        # Production with mill=Sattu
        r = admin.post(f"{API}/production", json={
            "date": date.today().isoformat(), "mill": "Sattu",
            "input_product_id": wheat["id"], "input_product_name": "Wheat Crop",
            "input_quantity": 50,
            "outputs": [{"product_id": sattu["id"], "product_name": "Sattu", "quantity": 48}],
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["mill"] == "Sattu"

        wheat_after = _product_by_name(admin, "Wheat Crop")["current_stock"]
        sattu_after = _product_by_name(admin, "Sattu")["current_stock"]
        assert abs(wheat_after - (wheat_before - 50)) < 0.01
        assert abs(sattu_after - (sattu_before + 48)) < 0.01

    def test_sell_sattu(self, admin):
        sattu = _product_by_name(admin, "Sattu")
        assert sattu["current_stock"] >= 5, f"need Sattu stock, have {sattu['current_stock']}"
        before = sattu["current_stock"]
        r = admin.post(f"{API}/sales", json={
            "date": date.today().isoformat(), "customer_name": "TEST_Walkin",
            "product_id": sattu["id"], "product_name": "Sattu",
            "quantity": 5, "price": 60, "payment_status": "Paid",
        })
        assert r.status_code == 200, r.text
        after = _product_by_name(admin, "Sattu")["current_stock"]
        assert abs(after - (before - 5)) < 0.01


# ---------------- Maintenance ----------------
class TestMaintenance:
    created_id = None

    def test_create_maintenance_computes_next_due(self, admin):
        last = "2026-01-01"
        r = admin.post(f"{API}/maintenance", json={
            "machine": "TEST_Grinder", "task": "Belt check",
            "last_service_date": last, "interval_days": 30, "notes": "test"
        })
        assert r.status_code == 200
        m = r.json()
        assert m["next_due_date"] == "2026-01-31"
        assert "id" in m
        TestMaintenance.created_id = m["id"]

    def test_list_sorted(self, admin):
        r = admin.get(f"{API}/maintenance")
        assert r.status_code == 200
        items = r.json()
        dates = [i["next_due_date"] for i in items]
        assert dates == sorted(dates)

    def test_update_recomputes(self, admin):
        mid = TestMaintenance.created_id
        assert mid
        r = admin.put(f"{API}/maintenance/{mid}", json={
            "machine": "TEST_Grinder", "task": "Belt check",
            "last_service_date": "2026-02-01", "interval_days": 60, "notes": "updated"
        })
        assert r.status_code == 200
        m = r.json()
        assert m["next_due_date"] == "2026-04-02"
        assert m["notes"] == "updated"

    def test_mark_serviced(self, admin):
        mid = TestMaintenance.created_id
        r = admin.patch(f"{API}/maintenance/{mid}/serviced")
        assert r.status_code == 200
        m = r.json()
        today_str = datetime.now().strftime("%Y-%m-%d")
        assert m["last_service_date"] == today_str
        expected = (datetime.now() + timedelta(days=60)).strftime("%Y-%m-%d")
        assert m["next_due_date"] == expected

    def test_maintenance_notification_overdue(self, admin):
        # create overdue schedule
        r = admin.post(f"{API}/maintenance", json={
            "machine": "TEST_OverdueMachine", "task": "Oil change",
            "last_service_date": "2020-01-01", "interval_days": 30, "notes": ""
        })
        assert r.status_code == 200
        overdue_id = r.json()["id"]

        notes = admin.get(f"{API}/notifications").json()
        maint_notes = [n for n in notes if n["type"] == "maintenance"]
        assert any("TEST_OverdueMachine" in n["message"] for n in maint_notes)
        overdue_note = next(n for n in maint_notes if "TEST_OverdueMachine" in n["message"])
        assert overdue_note["level"] == "warning"
        assert "OVERDUE" in overdue_note["message"]

        # cleanup
        admin.delete(f"{API}/maintenance/{overdue_id}")

    def test_maintenance_notification_upcoming(self, admin):
        # due in 3 days
        last = (datetime.now() - timedelta(days=27)).strftime("%Y-%m-%d")
        r = admin.post(f"{API}/maintenance", json={
            "machine": "TEST_SoonMachine", "task": "Grease",
            "last_service_date": last, "interval_days": 30, "notes": ""
        })
        soon_id = r.json()["id"]
        notes = admin.get(f"{API}/notifications").json()
        maint_notes = [n for n in notes if n["type"] == "maintenance" and "TEST_SoonMachine" in n["message"]]
        assert len(maint_notes) == 1
        assert maint_notes[0]["level"] == "info"
        assert "Upcoming" in maint_notes[0]["message"]
        admin.delete(f"{API}/maintenance/{soon_id}")

    def test_staff_cannot_delete_maintenance(self, staff, admin):
        # create with admin
        r = admin.post(f"{API}/maintenance", json={
            "machine": "TEST_DelCheck", "task": "x",
            "last_service_date": "2026-01-01", "interval_days": 10
        })
        mid = r.json()["id"]
        # staff attempt
        rs = staff.delete(f"{API}/maintenance/{mid}")
        assert rs.status_code == 403
        # admin cleanup
        r = admin.delete(f"{API}/maintenance/{mid}")
        assert r.status_code == 200

    def test_admin_delete(self, admin):
        r = admin.delete(f"{API}/maintenance/{TestMaintenance.created_id}")
        assert r.status_code == 200
        # verify removed
        items = admin.get(f"{API}/maintenance").json()
        assert not any(i["id"] == TestMaintenance.created_id for i in items)
