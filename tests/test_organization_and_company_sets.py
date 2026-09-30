import pytest
from fastapi.testclient import TestClient


def test_list_and_create_company_sets(client: TestClient):
    # 1. List seeded company sets
    res = client.get("/api/company-sets")
    assert res.status_code == 200
    sets = res.json()
    set_ids = [s["set_id"] for s in sets]
    assert "GLOBAL_SET" in set_ids
    assert "COMMERCIAL_SET" in set_ids

    # 2. Create new company set
    create_res = client.post("/api/company-sets", json={
        "set_id": "TEST_SET",
        "description": "Test Company Set",
        "auto_add_companies": False,
        "status": "ACTIVE",
    })
    assert create_res.status_code == 201
    data = create_res.json()
    assert data["set_id"] == "TEST_SET"
    assert data["auto_add_companies"] is False

    # 3. Update company set
    update_res = client.put("/api/company-sets/TEST_SET", json={
        "description": "Updated Description",
        "auto_add_companies": True,
    })
    assert update_res.status_code == 200
    assert update_res.json()["auto_add_companies"] is True
    assert update_res.json()["description"] == "Updated Description"

    # 4. Delete unreferenced company set
    del_res = client.delete("/api/company-sets/TEST_SET")
    assert del_res.status_code == 204


def test_cannot_delete_company_set_with_assigned_organizations(client: TestClient):
    # GLOBAL_SET has EAGLENA and EAGLEEU assigned
    res = client.delete("/api/company-sets/GLOBAL_SET")
    assert res.status_code == 400
    assert "Cannot delete Company Set 'GLOBAL_SET' because it is assigned" in res.json()["detail"]


def test_company_master_crud_and_add_to_orgs(client: TestClient):
    # 1. List masters in GLOBAL_SET
    res = client.get("/api/company-master?company_set_id=GLOBAL_SET")
    assert res.status_code == 200
    masters = res.json()
    comps = [m["company"] for m in masters]
    assert "GRAINGER" in comps
    assert "CATERPILLAR" in comps
    assert "ABB" in comps

    # 2. Create new master vendor
    new_master = client.post("/api/company-master", json={
        "company": "SCHNEIDER",
        "company_set_id": "GLOBAL_SET",
        "name": "Schneider Electric SE",
        "type": "M",
        "currency_code": "EUR",
        "country": "France",
    })
    assert new_master.status_code == 201
    assert new_master.json()["company"] == "SCHNEIDER"

    # 3. Action: Add Company to Organization (Enterprise rollout pattern)
    add_to_orgs_res = client.post("/api/company-master/GLOBAL_SET/SCHNEIDER/add-to-orgs", json={
        "org_ids": ["EAGLENA", "EAGLEEU"],
        "payment_terms": "NET45",
        "freight_terms": "PREPAID",
        "fob": "DESTINATION",
    })
    assert add_to_orgs_res.status_code == 200
    data = add_to_orgs_res.json()
    assert "EAGLENA" in data["added_to"]
    assert "EAGLEEU" in data["added_to"]

    # Verify presence in EAGLENA
    org_comp_res = client.get("/api/companies/EAGLENA/SCHNEIDER")
    assert org_comp_res.status_code == 200
    assert org_comp_res.json()["payment_terms"] == "NET45"


def test_enterprise_auto_add_companies_rule(client: TestClient):
    """Verifies Enterprise EAM's 'Automatically Add Companies to Company Master' rule.

    - When False (e.g. GLOBAL_SET): creating an unlisted company directly in an Organization
      MUST fail with a descriptive Enterprise error.
    - When True (e.g. COMMERCIAL_SET): creating an unlisted company directly in an Organization
      automatically creates the corresponding COMPMASTER record at the Set level.
    """
    # Part A: Test False behavior on EAGLENA (which uses GLOBAL_SET with auto_add_companies=False)
    fail_res = client.post("/api/organizations/EAGLENA/companies", json={
        "company": "UNAPPROVED_VENDOR",
        "name": "Unapproved Vendor LLC",
        "payment_terms": "NET30",
    })
    assert fail_res.status_code == 400
    assert "does not exist in Company Set 'GLOBAL_SET'" in fail_res.json()["detail"]
    assert "Automatically Add Companies to Company Master" in fail_res.json()["detail"]

    # Part B: Test True behavior on an Org using COMMERCIAL_SET (which has auto_add_companies=True)
    org_create = client.post("/api/organizations", json={
        "org_id": "COMM_ORG",
        "name": "Commercial Facilities Org",
        "company_set_id": "COMMERCIAL_SET",
        "base_currency_1": "USD",
    })
    assert org_create.status_code == 201

    auto_res = client.post("/api/organizations/COMM_ORG/companies", json={
        "company": "LOCAL_HARDWARE",
        "name": "Local Hardware Supply Co.",
        "payment_terms": "NET15",
    })
    assert auto_res.status_code == 201
    assert auto_res.json()["company"] == "LOCAL_HARDWARE"

    # Verify that LOCAL_HARDWARE was automatically created in Company Master for COMMERCIAL_SET
    cm_check = client.get("/api/company-master/COMMERCIAL_SET/LOCAL_HARDWARE")
    assert cm_check.status_code == 200
    assert cm_check.json()["name"] == "Local Hardware Supply Co."


def test_organization_crud_and_sites(client: TestClient):
    # 1. Create Organization
    res = client.post("/api/organizations", json={
        "org_id": "PACIFIC_OPS",
        "name": "Pacific Operations",
        "description": "West Coast and Pacific Facilities",
        "company_set_id": "GLOBAL_SET",
        "base_currency_1": "USD",
        "clearing_account": "1990-PAC-00",
        "purchasing_options": {
            "po_autonumber_prefix": "PO-PAC-",
            "receiving_tolerance_percent": 5.0,
            "auto_close_po": True,
        },
        "inventory_options": {
            "costing_method": "FIFO",
            "allow_negative_balance": True,
        },
        "work_order_options": {
            "wo_autonumber_prefix": "WO-PAC-",
            "track_asset_downtime": True,
        },
    })
    assert res.status_code == 201
    org = res.json()
    assert org["org_id"] == "PACIFIC_OPS"
    assert org["inventory_options"]["costing_method"] == "FIFO"
    assert org["inventory_options"]["allow_negative_balance"] is True

    # 2. Add Sites
    site_res = client.post("/api/organizations/PACIFIC_OPS/sites", json={
        "site_id": "SEATTLE",
        "name": "Seattle Marine Terminal",
    })
    assert site_res.status_code == 201
    assert site_res.json()["site_id"] == "SEATTLE"

    site_res2 = client.post("/api/organizations/PACIFIC_OPS/sites", json={
        "site_id": "PORTLAND",
        "name": "Portland Logistics Center",
    })
    assert site_res2.status_code == 201

    # 3. List Sites
    sites_res = client.get("/api/organizations/PACIFIC_OPS/sites")
    assert sites_res.status_code == 200
    assert len(sites_res.json()) == 2

    # 4. Update Organization Options
    update_res = client.put("/api/organizations/PACIFIC_OPS", json={
        "purchasing_options": {"receiving_tolerance_percent": 8.0},
    })
    assert update_res.status_code == 200
    assert update_res.json()["purchasing_options"]["receiving_tolerance_percent"] == 8.0


def test_organization_immutable_company_set_guard(client: TestClient):
    # EAGLENA has active companies (GRAINGER, CATERPILLAR, FASTENAL)
    # Attempting to switch its company_set_id to COMMERCIAL_SET must be rejected
    res = client.put("/api/organizations/EAGLENA", json={
        "company_set_id": "COMMERCIAL_SET",
    })
    assert res.status_code == 400
    assert "Cannot change Company Set for organization 'EAGLENA' because" in res.json()["detail"]


def test_company_org_local_disable_flag(client: TestClient):
    """Verifies that a company can be locally disabled in Org A while remaining active in Org B."""
    # In seeded data:
    # GRAINGER is active (disabled=False) in EAGLENA
    # GRAINGER is disabled (disabled=True) in EAGLEEU
    eaglena_grainger = client.get("/api/companies/EAGLENA/GRAINGER").json()
    assert eaglena_grainger["disabled"] is False

    eagleeu_grainger = client.get("/api/companies/EAGLEEU/GRAINGER").json()
    assert eagleeu_grainger["disabled"] is True

    # Re-enable in EAGLEEU
    toggle_res = client.put("/api/companies/EAGLEEU/GRAINGER", json={"disabled": False})
    assert toggle_res.status_code == 200
    assert toggle_res.json()["disabled"] is False

    # Check that EAGLENA is still active
    assert client.get("/api/companies/EAGLENA/GRAINGER").json()["disabled"] is False
