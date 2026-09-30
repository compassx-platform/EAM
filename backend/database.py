from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from backend.config import settings

# Database Engine Configuration (PostgreSQL / SQLite)
db_url = settings.sync_database_url
if not settings.is_production and not settings.DATABASE_URL:
    db_url = "sqlite:////tmp/eam.db"

if db_url.startswith("sqlite"):
    engine = create_engine(
        db_url,
        connect_args={"check_same_thread": False, "timeout": 30},
        poolclass=NullPool,
        echo=False,
        future=True,
    )
else:
    engine = create_engine(
        db_url,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
        pool_recycle=1800,
        echo=False,
        future=True,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def _ensure_column(db: Session, table: str, column: str, ddl: str) -> None:
    """Idempotently adds a nullable column to an existing table in PostgreSQL/SQLite if missing (never drops or modifies data)."""
    try:
        bind = db.get_bind()
        if bind.dialect.name == "sqlite":
            with bind.connect() as conn:
                res = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
                col_names = [r[1] for r in res]
                if column not in col_names:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))
                    conn.commit()
        else:
            res = db.execute(text(
                "SELECT column_name FROM information_schema.columns "
                f"WHERE table_name = '{table}' AND column_name = '{column}'"
            )).fetchall()
            if not res:
                db.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))
                db.commit()
    except Exception:
        pass

def ensure_schema_compatibility(db: Session) -> None:
    """Idempotently ensures backward compatibility schema columns exist without altering or dropping any data."""
    _ensure_column(db, "entity_field", "label", "label VARCHAR(100)")
    _ensure_column(db, "app_user", "person_id", "person_id VARCHAR(50)")
    _ensure_column(db, "entity_form", "version_number", "version_number INTEGER DEFAULT 1")
    _ensure_column(db, "entity_form", "version_label", "version_label VARCHAR(50) DEFAULT 'v1'")
    _ensure_column(db, "entity_form", "tabs", "tabs JSON")
    _ensure_column(db, "entity_form_version", "tabs", "tabs JSON")
    _ensure_column(db, "entity_type_definition", "version_number", "version_number INTEGER DEFAULT 1")
    _ensure_column(db, "entity_type_definition", "version_label", "version_label VARCHAR(50) DEFAULT 'v1'")
    _ensure_column(db, "entity_type_definition", "statuses", "statuses JSON")
    _ensure_column(db, "entity_type_version", "statuses", "statuses JSON")
    _ensure_column(db, "dynamic_entity", "workflow_stage", "workflow_stage VARCHAR(100)")
    _ensure_column(db, "task_assignment", "escalated_to_person_id", "escalated_to_person_id VARCHAR(50)")
    _ensure_column(db, "task_assignment", "escalation_count", "escalation_count INTEGER DEFAULT 0")
    _ensure_column(db, "task_assignment", "escalated_at", "escalated_at TIMESTAMP")
    _ensure_column(db, "task_assignment", "escalation_reason", "escalation_reason VARCHAR(255)")
    _ensure_column(db, "location", "classstructure_id", "classstructure_id VARCHAR(50)")
    _ensure_column(db, "location", "classification_path", "classification_path VARCHAR(500)")
    _ensure_column(db, "asset", "classstructure_id", "classstructure_id VARCHAR(50)")
    _ensure_column(db, "asset", "classification_path", "classification_path VARCHAR(500)")
    _ensure_column(db, "class_spec", "section", "section VARCHAR(100)")
    _ensure_column(db, "class_spec", "apply_down_hierarchy", "apply_down_hierarchy BOOLEAN DEFAULT 1")
    _ensure_column(db, "asset_spec", "section", "section VARCHAR(100)")
    _ensure_column(db, "location_spec", "section", "section VARCHAR(100)")


def seed_default_organizations(db: Session) -> None:
    """Idempotently seeds default Company Sets, Organizations, Sites, and Vendors if empty."""
    from backend.models.organization import (
        CompanySet,
        Organization,
        Site,
        CompanyMaster,
        CompanyOrg,
    )

    if db.query(Organization).first():
        return

    # 1. Company Sets
    global_set = CompanySet(
        set_id="GLOBAL_SET",
        description="Global Multi-Org Enterprise Vendor Set",
        auto_add_companies=False,
        status="ACTIVE",
    )
    comm_set = CompanySet(
        set_id="COMMERCIAL_SET",
        description="Commercial Facilities & Building Services Set",
        auto_add_companies=True,
        status="ACTIVE",
    )
    db.add(global_set)
    db.add(comm_set)
    db.flush()

    # 2. Organizations
    eaglena = Organization(
        org_id="EAGLENA",
        name="Eagle North America Operations",
        description="Primary North American manufacturing, processing, and assembly plants",
        company_set_id="GLOBAL_SET",
        item_set_id="ITEMSET_1",
        base_currency_1="USD",
        status="ACTIVE",
        purchasing_options={
            "require_po_approval": True,
            "auto_po_close_days": 30,
            "allow_vendor_overdelivery": False,
            "invoice_variance_tolerance_percent": 5.0,
        },
        inventory_options={
            "auto_inventory_replenish": True,
            "default_cost_method": "AVERAGE",
            "allow_negative_balance": False,
        },
        work_order_options={
            "auto_close_days": 14,
            "require_actual_dates_on_completion": True,
            "track_asset_downtime": True,
        },
    )
    eagleeu = Organization(
        org_id="EAGLEEU",
        name="Eagle European Manufacturing",
        description="European production facilities and regional distribution centers",
        company_set_id="GLOBAL_SET",
        item_set_id="ITEMSET_1",
        base_currency_1="EUR",
        status="ACTIVE",
        purchasing_options={
            "require_po_approval": True,
            "auto_po_close_days": 30,
            "allow_vendor_overdelivery": False,
            "invoice_variance_tolerance_percent": 3.0,
        },
        inventory_options={
            "auto_inventory_replenish": True,
            "default_cost_method": "FIFO",
            "allow_negative_balance": False,
        },
        work_order_options={
            "auto_close_days": 14,
            "require_actual_dates_on_completion": True,
            "track_asset_downtime": True,
        },
    )
    db.add(eaglena)
    db.add(eagleeu)
    db.flush()

    # 3. Sites
    sample_sites = [
        Site(site_id="BEDFORD", org_id="EAGLENA", name="Bedford Manufacturing Plant", status="ACTIVE"),
        Site(site_id="NASHUA", org_id="EAGLENA", name="Nashua Distribution & Power Substation", status="ACTIVE"),
        Site(site_id="HQ", org_id="EAGLENA", name="Corporate Technology Center", status="ACTIVE"),
        Site(site_id="BERLIN", org_id="EAGLEEU", name="Berlin Industrial Center", status="ACTIVE"),
    ]
    for s in sample_sites:
        db.add(s)
    db.flush()

    # 4. Company Masters & Org Links
    masters = [
        CompanyMaster(company="FLOWSERVE", company_set_id="GLOBAL_SET", name="Flowserve Corporation", type="VENDOR", status="ACTIVE"),
        CompanyMaster(company="ABB", company_set_id="GLOBAL_SET", name="ABB Electrification & Drives", type="VENDOR", status="ACTIVE"),
        CompanyMaster(company="SKF", company_set_id="GLOBAL_SET", name="SKF Bearings & Lubrication", type="VENDOR", status="ACTIVE"),
        CompanyMaster(company="FANUC", company_set_id="GLOBAL_SET", name="FANUC Robotics America", type="VENDOR", status="ACTIVE"),
        CompanyMaster(company="SIEMENS", company_set_id="GLOBAL_SET", name="Siemens Energy & Automation", type="VENDOR", status="ACTIVE"),
        CompanyMaster(company="CAT", company_set_id="GLOBAL_SET", name="Caterpillar Heavy Equipment", type="VENDOR", status="ACTIVE"),
    ]
    for m in masters:
        db.add(m)
    db.flush()

    for m in masters:
        db.add(
            CompanyOrg(
                org_id="EAGLENA",
                company=m.company,
                name=m.name,
                type=m.type,
                currency_code="USD",
                payment_terms="NET30",
                freight_terms="FOB",
                fob="DESTINATION",
                tax_exempt=False,
                disabled=False,
            )
        )
    db.commit()


def seed_default_asset_hierarchy(db: Session) -> None:
    """Idempotently seeds default Locations and Parent-Child Assets if tables are empty."""
    from backend.models.organization import Site, Organization
    from backend.models.asset_hierarchy import Location, Asset

    # Ensure organizations exist first
    seed_default_organizations(db)

    # Check if locations already exist
    existing_locs = db.query(Location).first()
    if existing_locs:
        return

    # Check if any org exists
    org = db.query(Organization).first()
    if not org:
        return
    target_org_id = org.org_id

    # Check or create Bedford site
    bedford_site = db.query(Site).filter(Site.site_id == "BEDFORD").first()
    if not bedford_site:
        bedford_site = Site(
            site_id="BEDFORD",
            org_id=target_org_id,
            name="Bedford Manufacturing Plant",
            description="Primary manufacturing & assembly facility",
            status="ACTIVE",
        )
        db.add(bedford_site)
        db.commit()

    nashua_site = db.query(Site).filter(Site.site_id == "NASHUA").first()
    if not nashua_site:
        nashua_site = Site(
            site_id="NASHUA",
            org_id=target_org_id,
            name="Nashua Power & Substation",
            description="High voltage power distribution substation",
            status="ACTIVE",
        )
        db.add(nashua_site)
        db.commit()

    # 1. Seed Locations
    sample_locs = [
        Location(
            location_id="FACILITY_A",
            site_id="BEDFORD",
            org_id=target_org_id,
            parent_location_id=None,
            description="Main Manufacturing Facility",
            type="OPERATING",
            status="OPERATING",
            gl_account="6100-001",
        ),
        Location(
            location_id="BLDG_01",
            site_id="BEDFORD",
            org_id=target_org_id,
            parent_location_id="FACILITY_A",
            description="Production Building 1",
            type="OPERATING",
            status="OPERATING",
            gl_account="6100-002",
        ),
        Location(
            location_id="MECH_ROOM_101",
            site_id="BEDFORD",
            org_id=target_org_id,
            parent_location_id="BLDG_01",
            description="Mechanical & Pump Room 101",
            type="OPERATING",
            status="OPERATING",
            gl_account="6100-003",
        ),
        Location(
            location_id="ASSEMBLY_LINE_A",
            site_id="BEDFORD",
            org_id=target_org_id,
            parent_location_id="BLDG_01",
            description="Automated Packaging & Assembly Cell A",
            type="OPERATING",
            status="OPERATING",
            gl_account="6100-004",
        ),
        Location(
            location_id="CENTRAL_STORE_01",
            site_id="BEDFORD",
            org_id=target_org_id,
            parent_location_id=None,
            description="Central MRO Spare Parts Storeroom",
            type="STOREROOM",
            status="OPERATING",
            gl_account="1300-100",
        ),
        Location(
            location_id="AISLE_B_SHELF_3",
            site_id="BEDFORD",
            org_id=target_org_id,
            parent_location_id="CENTRAL_STORE_01",
            description="High-Density Fastener & Small Parts Rack B3",
            type="STOREROOM",
            status="OPERATING",
            gl_account="1300-101",
        ),
        Location(
            location_id="HOLDING_STAGING",
            site_id="BEDFORD",
            org_id=target_org_id,
            parent_location_id=None,
            description="Inbound Receiving & Staging Dock",
            type="HOLDING",
            status="OPERATING",
            gl_account="1300-200",
        ),
    ]

    # Nashua substation location
    nashua_site = db.query(Site).filter(Site.site_id == "NASHUA").first()
    if nashua_site:
        sample_locs.append(
            Location(
                location_id="SUBSTATION_NORTH",
                site_id="NASHUA",
                org_id=target_org_id,
                parent_location_id=None,
                description="Primary 115kV High-Voltage Distribution Substation",
                type="OPERATING",
                status="OPERATING",
                gl_account="6200-001",
            )
        )

    for loc in sample_locs:
        db.add(loc)
    db.commit()

    # 2. Seed Assets with Multi-Level Parent-Child Hierarchy
    sample_assets = [
        Asset(
            asset_id="PUMP_SYS_100",
            site_id="BEDFORD",
            org_id=target_org_id,
            location_id="MECH_ROOM_101",
            parent_asset_id=None,
            name="High Pressure Centrifugal Feed Pump System",
            description="Main boiler feedwater multistage centrifugal pump train",
            item_num="PUMP-CENT-01",
            serial_num="SN-98214-A",
            status="OPERATING",
            vendor="FLOWSERVE",
            manufacturer="Flowserve Corp",
            model="HPX-200",
            purchase_cost=48500.0,
            priority=1,
        ),
        Asset(
            asset_id="MOTOR_50HP_01",
            site_id="BEDFORD",
            org_id=target_org_id,
            location_id="MECH_ROOM_101",
            parent_asset_id="PUMP_SYS_100",
            name="50HP 3-Phase Induction Drive Motor",
            description="High-efficiency continuous duty motor drive",
            item_num="MOT-IND-50",
            serial_num="SN-M50-332",
            status="OPERATING",
            vendor="ABB",
            manufacturer="ABB Ltd",
            model="M3BP-250",
            purchase_cost=12400.0,
            priority=2,
        ),
        Asset(
            asset_id="BEARING_ASSY_01",
            site_id="BEDFORD",
            org_id=target_org_id,
            location_id="MECH_ROOM_101",
            parent_asset_id="MOTOR_50HP_01",
            name="Ceramic High-Load Thrust Bearing Assembly",
            description="Double-row angular contact ceramic bearing set",
            item_num="BRG-CER-88",
            serial_num="BRG-9921",
            status="OPERATING",
            vendor="SKF",
            manufacturer="SKF Group",
            model="7314-BECBP",
            purchase_cost=1850.0,
            priority=3,
        ),
        Asset(
            asset_id="IMPELLER_ASSY_01",
            site_id="BEDFORD",
            org_id=target_org_id,
            location_id="MECH_ROOM_101",
            parent_asset_id="PUMP_SYS_100",
            name="Dual-Vane Enclosed Impeller Rotor Unit",
            description="Precision-machined stainless steel closed impeller rotor",
            item_num="IMP-DUAL-04",
            serial_num="IMP-4412",
            status="OPERATING",
            vendor="FLOWSERVE",
            manufacturer="Flowserve Corp",
            model="HPX-IMP-20",
            purchase_cost=7200.0,
            priority=2,
        ),
        Asset(
            asset_id="VALVE_RELIEF_01",
            site_id="BEDFORD",
            org_id=target_org_id,
            location_id="MECH_ROOM_101",
            parent_asset_id="PUMP_SYS_100",
            name="Direct-Acting Pressure Relief Bypass Valve",
            description="High-pressure stainless bypass safety valve",
            item_num="VLV-REL-02",
            serial_num="VLV-1104",
            status="OPERATING",
            vendor="EMERSON",
            manufacturer="Emerson Fisher",
            model="627-W",
            purchase_cost=2950.0,
            priority=2,
        ),
        Asset(
            asset_id="ROBOT_ARM_200",
            site_id="BEDFORD",
            org_id=target_org_id,
            location_id="ASSEMBLY_LINE_A",
            parent_asset_id=None,
            name="6-Axis Articulated Industrial Robotic Arm",
            description="Heavy payload material handling articulated robot",
            item_num="ROB-6AX-01",
            serial_num="SN-FANUC-771",
            status="OPERATING",
            vendor="FANUC",
            manufacturer="FANUC Robotics",
            model="M-20iD/25",
            purchase_cost=65000.0,
            priority=1,
        ),
        Asset(
            asset_id="GRIPPER_PNEUMATIC_01",
            site_id="BEDFORD",
            org_id=target_org_id,
            location_id="ASSEMBLY_LINE_A",
            parent_asset_id="ROBOT_ARM_200",
            name="Smart Pneumatic Parallel Gripper End-Effector",
            description="2-finger parallel gripper with digital position sensors",
            item_num="GRP-PNU-06",
            serial_num="GRP-3390",
            status="OPERATING",
            vendor="SCHUNK",
            manufacturer="Schunk GmbH",
            model="PGN-plus-P",
            purchase_cost=3400.0,
            priority=3,
        ),
        Asset(
            asset_id="SERVO_DRIVE_J1",
            site_id="BEDFORD",
            org_id=target_org_id,
            location_id="ASSEMBLY_LINE_A",
            parent_asset_id="ROBOT_ARM_200",
            name="Axis J1 High-Torque AC Servo Motor Drive",
            description="Primary base rotation axis servo motor and encoder",
            item_num="SRV-AC-J1",
            serial_num="SRV-5510",
            status="IN_REPAIR",
            vendor="FANUC",
            manufacturer="FANUC Robotics",
            model="Beta iS 8/3000",
            purchase_cost=5200.0,
            priority=2,
        ),
        Asset(
            asset_id="SPARE_GENSET_500",
            site_id="BEDFORD",
            org_id=target_org_id,
            location_id=None,
            parent_asset_id=None,
            name="500kW Standby Diesel Generator Set",
            description="Staged standby diesel emergency power unit awaiting electrical tie-in",
            item_num="GEN-500KW",
            serial_num="SN-CAT-500K-91",
            status="NOT_READY",
            vendor="CAT",
            manufacturer="Caterpillar",
            model="C15 ACERT",
            purchase_cost=92000.0,
            priority=1,
        ),
    ]

    if nashua_site:
        sample_assets.extend([
            Asset(
                asset_id="TRANSFORMER_T1",
                site_id="NASHUA",
                org_id=target_org_id,
                location_id="SUBSTATION_NORTH",
                parent_asset_id=None,
                name="Main Step-Down Power Transformer 115kV/13.8kV",
                description="Oil-immersed power stepdown transformer with cooling radiators",
                item_num="XFRM-115KV",
                serial_num="SN-SIEM-994",
                status="OPERATING",
                vendor="SIEMENS",
                manufacturer="Siemens Energy",
                model="T-Power 25MVA",
                purchase_cost=210000.0,
                priority=1,
            ),
            Asset(
                asset_id="TAP_CHANGER_01",
                site_id="NASHUA",
                org_id=target_org_id,
                location_id="SUBSTATION_NORTH",
                parent_asset_id="TRANSFORMER_T1",
                name="On-Load Vacuum Tap Changer Assembly",
                description="Motorized on-load automatic voltage regulation tap changer",
                item_num="TAP-VAC-01",
                serial_num="SN-MR-8812",
                status="OPERATING",
                vendor="REINHAUSEN",
                manufacturer="Maschinenfabrik Reinhausen",
                model="VACUTAP VR",
                purchase_cost=28500.0,
                priority=2,
            ),
        ])

    for asset in sample_assets:
        db.add(asset)
    db.commit()


def seed_default_attributes(db: Session) -> None:
    """Idempotently seeds master attribute catalog (AssetAttribute repository)."""
    from backend.models.classification import AssetAttribute

    master_attributes = [
        {"attribute_id": "HORSEPOWER", "description": "Motor Rated Horsepower", "data_type": "NUMERIC", "unit_of_measure": "HP"},
        {"attribute_id": "VOLTAGE_RATED", "description": "Operating Voltage", "data_type": "NUMERIC", "unit_of_measure": "V"},
        {"attribute_id": "FLOW_RATE", "description": "Rated Design Flow Rate", "data_type": "NUMERIC", "unit_of_measure": "GPM"},
        {"attribute_id": "HEAD_FEET", "description": "Total Dynamic Head", "data_type": "NUMERIC", "unit_of_measure": "FT"},
        {"attribute_id": "IMPELLER_DIA", "description": "Impeller Diameter", "data_type": "NUMERIC", "unit_of_measure": "IN"},
        {"attribute_id": "CASING_MAT", "description": "Casing Material", "data_type": "ALN", "domain_values": ["316L Stainless Steel", "Cast Iron", "Ductile Iron", "Hastelloy C"]},
        {"attribute_id": "MAX_PRESSURE", "description": "Maximum Operating Pressure", "data_type": "NUMERIC", "unit_of_measure": "PSI"},
        {"attribute_id": "RPM_RATED", "description": "Rated Operating Speed", "data_type": "NUMERIC", "unit_of_measure": "RPM"},
        {"attribute_id": "LUBRICANT_TYPE", "description": "Lubricant Specification", "data_type": "ALN", "domain_values": ["Synthetic ISO VG 46", "Mineral ISO VG 68", "Food Grade NSF H1", "Grease NLGI 2"]},
        {"attribute_id": "PRIMARY_VOLTAGE", "description": "Primary High-Side Voltage", "data_type": "NUMERIC", "unit_of_measure": "kV"},
        {"attribute_id": "SECONDARY_VOLTAGE", "description": "Secondary Low-Side Voltage", "data_type": "NUMERIC", "unit_of_measure": "kV"},
        {"attribute_id": "CAPACITY_KVA", "description": "Rated Apparent Power Capacity", "data_type": "NUMERIC", "unit_of_measure": "kVA"},
        {"attribute_id": "COOLING_TYPE", "description": "Cooling Method Classification", "data_type": "ALN", "domain_values": ["ONAN", "ONAF", "OFAF", "Dry Type"]},
        {"attribute_id": "FRAME_SIZE", "description": "NEMA/IEC Frame Size", "data_type": "ALN", "domain_values": ["254T", "286T", "324T", "IEC 180M", "IEC 250M"]},
        {"attribute_id": "ENCLOSURE", "description": "Enclosure Type", "data_type": "ALN", "domain_values": ["TEFC", "ODP", "Explosion Proof Class 1 Div 1"]},
        {"attribute_id": "EFFICIENCY_CLASS", "description": "Energy Efficiency Rating", "data_type": "ALN", "domain_values": ["IE1 Standard", "IE2 High", "IE3 Premium", "IE4 Super Premium"]},
        {"attribute_id": "AMPERAGE_RATED", "description": "Full Load Amperage", "data_type": "NUMERIC", "unit_of_measure": "A"},
        {"attribute_id": "SQUARE_FEET", "description": "Gross Floor Area", "data_type": "NUMERIC", "unit_of_measure": "SQFT"},
        {"attribute_id": "HVAC_ZONE", "description": "HVAC Climate Zone", "data_type": "ALN", "domain_values": ["Zone 1 - Office", "Zone 2 - Production", "Zone 3 - Cleanroom", "Zone 4 - Unconditioned"]},
        {"attribute_id": "NUM_FLOORS", "description": "Number of Floors", "data_type": "NUMERIC"},
        {"attribute_id": "FIRE_RATING", "description": "Building Fire Safety Class", "data_type": "ALN", "domain_values": ["Class A (Sprinklered)", "Class B", "High Hazard Type 1"]},
        {"attribute_id": "MAX_OCCUPANCY", "description": "Max Authorized Personnel", "data_type": "NUMERIC"},
        {"attribute_id": "EXPLOSION_VENT", "description": "Explosion Relief Venting", "data_type": "ALN", "domain_values": ["YES", "NO", "N/A"]},
        {"attribute_id": "BACKUP_POWER", "description": "Emergency Generator Tie", "data_type": "ALN", "domain_values": ["YES", "NO"]},
        {"attribute_id": "SECURITY_LEVEL", "description": "Security Clearance Level", "data_type": "ALN", "domain_values": ["Badge Restricted", "Open Access", "High Value Cage"]},
        {"attribute_id": "TEMPERATURE_CONTROLLED", "description": "Climate Control Active", "data_type": "ALN", "domain_values": ["YES", "NO"]},
        {"attribute_id": "WEIGHT_LBS", "description": "Operating Weight", "data_type": "NUMERIC", "unit_of_measure": "LBS"},
    ]

    for item in master_attributes:
        attr_id = item["attribute_id"]
        if not db.query(AssetAttribute).filter(AssetAttribute.attribute_id == attr_id).first():
            db.add(AssetAttribute(
                attribute_id=attr_id,
                description=item["description"],
                data_type=item.get("data_type", "ALN"),
                unit_of_measure=item.get("unit_of_measure"),
                domain_values=item.get("domain_values"),
                status="ACTIVE",
            ))
    db.commit()


def seed_default_classifications(db: Session) -> None:
    """Idempotently seeds default classification taxonomy, spec templates, and attaches specs to demo assets/locations."""
    from sqlalchemy import and_
    from backend.models.classification import Classification, ClassSpec, AssetSpec, LocationSpec, AssetAttribute
    from backend.models.asset_hierarchy import Location, Asset

    # 1. Always ensure master attribute repository is seeded
    seed_default_attributes(db)

    # Check if classifications already exist
    existing = db.query(Classification).first()
    if existing:
        return

    # 2. Classification Hierarchy
    classifications_data = [
        # Rotating Machinery Hierarchy
        {
            "classstructure_id": "CS_ROTATING",
            "classification_id": "ROTATING",
            "parent_classstructure_id": None,
            "hierarchy_path": "ROTATING",
            "description": "Rotating Machinery & Mechanical Drives",
            "use_with": ["ASSET"],
            "attributes": [
                {
                    "attribute_id": "RPM_RATED",
                    "section": "Mechanical",
                    "description": "Rated Operating Speed",
                    "data_type": "NUMERIC",
                    "unit_of_measure": "RPM",
                    "mandatory": False,
                    "apply_down_hierarchy": True,
                    "display_sequence": 1,
                },
                {
                    "attribute_id": "LUBRICANT_TYPE",
                    "section": "Maintenance",
                    "description": "Lubricant Specification",
                    "data_type": "ALN",
                    "domain_values": ["Synthetic ISO VG 46", "Mineral ISO VG 68", "Food Grade NSF H1", "Grease NLGI 2"],
                    "mandatory": False,
                    "apply_down_hierarchy": True,
                    "display_sequence": 2,
                },
            ],
        },
        {
            "classstructure_id": "CS_PUMP",
            "classification_id": "PUMP",
            "parent_classstructure_id": "CS_ROTATING",
            "hierarchy_path": "ROTATING \\ PUMP",
            "description": "Pumps & Liquid Displacement Units",
            "use_with": ["ASSET"],
            "attributes": [
                {
                    "attribute_id": "CASING_MAT",
                    "section": "Mechanical",
                    "description": "Casing Material",
                    "data_type": "ALN",
                    "domain_values": ["316L Stainless Steel", "Cast Iron", "Ductile Iron", "Hastelloy C"],
                    "mandatory": True,
                    "apply_down_hierarchy": True,
                    "display_sequence": 1,
                },
                {
                    "attribute_id": "MAX_PRESSURE",
                    "section": "Hydraulics",
                    "description": "Maximum Operating Pressure",
                    "data_type": "NUMERIC",
                    "unit_of_measure": "PSI",
                    "mandatory": False,
                    "apply_down_hierarchy": True,
                    "display_sequence": 2,
                },
            ],
        },
        {
            "classstructure_id": "CS_PUMP_CENT",
            "classification_id": "CENTRIFUGAL",
            "parent_classstructure_id": "CS_PUMP",
            "hierarchy_path": "ROTATING \\ PUMP \\ CENTRIFUGAL",
            "description": "Centrifugal Multi-Stage Pumps",
            "use_with": ["ASSET"],
            "attributes": [
                {
                    "attribute_id": "FLOW_RATE",
                    "section": "Hydraulics",
                    "description": "Rated Design Flow Rate",
                    "data_type": "NUMERIC",
                    "unit_of_measure": "GPM",
                    "mandatory": True,
                    "apply_down_hierarchy": True,
                    "display_sequence": 1,
                },
                {
                    "attribute_id": "HEAD_FEET",
                    "section": "Hydraulics",
                    "description": "Total Dynamic Head",
                    "data_type": "NUMERIC",
                    "unit_of_measure": "FT",
                    "mandatory": False,
                    "apply_down_hierarchy": True,
                    "display_sequence": 2,
                },
                {
                    "attribute_id": "IMPELLER_DIA",
                    "section": "Mechanical",
                    "description": "Impeller Diameter",
                    "data_type": "NUMERIC",
                    "unit_of_measure": "IN",
                    "mandatory": False,
                    "apply_down_hierarchy": True,
                    "display_sequence": 3,
                },
            ],
        },
        {
            "classstructure_id": "CS_MOTOR",
            "classification_id": "MOTOR",
            "parent_classstructure_id": "CS_ROTATING",
            "hierarchy_path": "ROTATING \\ MOTOR",
            "description": "Electric Induction Motors",
            "use_with": ["ASSET"],
            "attributes": [
                {
                    "attribute_id": "HORSEPOWER",
                    "section": "Electrical",
                    "description": "Motor Rated Horsepower",
                    "data_type": "NUMERIC",
                    "unit_of_measure": "HP",
                    "mandatory": True,
                    "apply_down_hierarchy": True,
                    "display_sequence": 1,
                },
                {
                    "attribute_id": "VOLTAGE_RATED",
                    "section": "Electrical",
                    "description": "Operating Voltage",
                    "data_type": "NUMERIC",
                    "unit_of_measure": "V",
                    "mandatory": True,
                    "apply_down_hierarchy": True,
                    "display_sequence": 2,
                },
                {
                    "attribute_id": "FRAME_SIZE",
                    "section": "Mechanical",
                    "description": "NEMA/IEC Frame Size",
                    "data_type": "ALN",
                    "domain_values": ["254T", "286T", "324T", "IEC 180M", "IEC 250M"],
                    "mandatory": False,
                    "apply_down_hierarchy": True,
                    "display_sequence": 3,
                },
                {
                    "attribute_id": "ENCLOSURE",
                    "section": "Mechanical",
                    "description": "Enclosure Type",
                    "data_type": "ALN",
                    "domain_values": ["TEFC", "ODP", "Explosion Proof Class 1 Div 1"],
                    "mandatory": False,
                    "apply_down_hierarchy": True,
                    "display_sequence": 4,
                },
            ],
        },
        # Electrical Hierarchy
        {
            "classstructure_id": "CS_ELECTRICAL",
            "classification_id": "ELECTRICAL",
            "parent_classstructure_id": None,
            "hierarchy_path": "ELECTRICAL",
            "description": "Electrical Power & Distribution Systems",
            "use_with": ["ASSET"],
            "attributes": [],
        },
        {
            "classstructure_id": "CS_XFRM",
            "classification_id": "TRANSFORMER",
            "parent_classstructure_id": "CS_ELECTRICAL",
            "hierarchy_path": "ELECTRICAL \\ TRANSFORMER",
            "description": "Power Step-Down & Distribution Transformers",
            "use_with": ["ASSET"],
            "attributes": [
                {
                    "attribute_id": "PRIMARY_VOLTAGE",
                    "section": "Electrical",
                    "description": "Primary High-Side Voltage",
                    "data_type": "NUMERIC",
                    "unit_of_measure": "kV",
                    "mandatory": True,
                    "apply_down_hierarchy": True,
                    "display_sequence": 1,
                },
                {
                    "attribute_id": "SECONDARY_VOLTAGE",
                    "section": "Electrical",
                    "description": "Secondary Low-Side Voltage",
                    "data_type": "NUMERIC",
                    "unit_of_measure": "kV",
                    "mandatory": True,
                    "apply_down_hierarchy": True,
                    "display_sequence": 2,
                },
                {
                    "attribute_id": "CAPACITY_KVA",
                    "section": "Electrical",
                    "description": "Rated Apparent Power Capacity",
                    "data_type": "NUMERIC",
                    "unit_of_measure": "kVA",
                    "mandatory": True,
                    "apply_down_hierarchy": True,
                    "display_sequence": 3,
                },
                {
                    "attribute_id": "COOLING_TYPE",
                    "section": "Thermal",
                    "description": "Cooling Method Classification",
                    "data_type": "ALN",
                    "domain_values": ["ONAN", "ONAF", "OFAF", "Dry Type"],
                    "mandatory": False,
                    "apply_down_hierarchy": True,
                    "display_sequence": 4,
                },
            ],
        },
        # Facility / Location Hierarchy
        {
            "classstructure_id": "CS_FACILITY",
            "classification_id": "FACILITY",
            "parent_classstructure_id": None,
            "hierarchy_path": "FACILITY",
            "description": "Facility & Infrastructure Areas",
            "use_with": ["LOCATIONS"],
            "attributes": [
                {
                    "attribute_id": "SQUARE_FEET",
                    "section": "Physical Dimension",
                    "description": "Gross Floor Area",
                    "data_type": "NUMERIC",
                    "unit_of_measure": "SQFT",
                    "mandatory": False,
                    "apply_down_hierarchy": True,
                    "display_sequence": 1,
                },
                {
                    "attribute_id": "HVAC_ZONE",
                    "section": "Environmental",
                    "description": "HVAC Climate Zone",
                    "data_type": "ALN",
                    "domain_values": ["Zone 1 - Office", "Zone 2 - Production", "Zone 3 - Cleanroom", "Zone 4 - Unconditioned"],
                    "mandatory": False,
                    "apply_down_hierarchy": True,
                    "display_sequence": 2,
                },
            ],
        },
        {
            "classstructure_id": "CS_BLDG",
            "classification_id": "BUILDING",
            "parent_classstructure_id": "CS_FACILITY",
            "hierarchy_path": "FACILITY \\ BUILDING",
            "description": "Physical Production & Office Buildings",
            "use_with": ["LOCATIONS"],
            "attributes": [
                {
                    "attribute_id": "NUM_FLOORS",
                    "section": "Physical Dimension",
                    "description": "Number of Floors",
                    "data_type": "NUMERIC",
                    "mandatory": False,
                    "apply_down_hierarchy": True,
                    "display_sequence": 1,
                },
                {
                    "attribute_id": "FIRE_RATING",
                    "section": "Safety & Compliance",
                    "description": "Building Fire Safety Class",
                    "data_type": "ALN",
                    "domain_values": ["Class A (Sprinklered)", "Class B", "High Hazard Type 1"],
                    "mandatory": False,
                    "apply_down_hierarchy": True,
                    "display_sequence": 2,
                },
            ],
        },
        {
            "classstructure_id": "CS_MECH_ROOM",
            "classification_id": "MECH_ROOM",
            "parent_classstructure_id": "CS_BLDG",
            "hierarchy_path": "FACILITY \\ BUILDING \\ MECH_ROOM",
            "description": "Mechanical Utility & Boiler Rooms",
            "use_with": ["LOCATIONS"],
            "attributes": [
                {
                    "attribute_id": "MAX_OCCUPANCY",
                    "section": "Occupancy",
                    "description": "Max Authorized Personnel",
                    "data_type": "NUMERIC",
                    "mandatory": False,
                    "apply_down_hierarchy": True,
                    "display_sequence": 1,
                },
                {
                    "attribute_id": "EXPLOSION_VENT",
                    "section": "Safety & Compliance",
                    "description": "Explosion Relief Venting",
                    "data_type": "ALN",
                    "domain_values": ["YES", "NO", "N/A"],
                    "mandatory": False,
                    "apply_down_hierarchy": True,
                    "display_sequence": 2,
                },
                {
                    "attribute_id": "BACKUP_POWER",
                    "section": "Electrical",
                    "description": "Emergency Generator Tie",
                    "data_type": "ALN",
                    "domain_values": ["YES", "NO"],
                    "mandatory": False,
                    "apply_down_hierarchy": True,
                    "display_sequence": 3,
                },
            ],
        },
        {
            "classstructure_id": "CS_STOREROOM",
            "classification_id": "STOREROOM",
            "parent_classstructure_id": "CS_FACILITY",
            "hierarchy_path": "FACILITY \\ STOREROOM",
            "description": "Secure Inventory Storerooms & Staging Areas",
            "use_with": ["LOCATIONS"],
            "attributes": [
                {
                    "attribute_id": "SECURITY_LEVEL",
                    "section": "Security",
                    "description": "Security Clearance Level",
                    "data_type": "ALN",
                    "domain_values": ["Badge Restricted", "Open Access", "High Value Cage"],
                    "mandatory": True,
                    "apply_down_hierarchy": True,
                    "display_sequence": 1,
                },
                {
                    "attribute_id": "TEMPERATURE_CONTROLLED",
                    "section": "Environmental",
                    "description": "Climate Control Active",
                    "data_type": "ALN",
                    "domain_values": ["YES", "NO"],
                    "mandatory": False,
                    "apply_down_hierarchy": True,
                    "display_sequence": 2,
                },
            ],
        },
    ]

    for item in classifications_data:
        cls = Classification(
            classstructure_id=item["classstructure_id"],
            classification_id=item["classification_id"],
            parent_classstructure_id=item["parent_classstructure_id"],
            hierarchy_path=item["hierarchy_path"],
            description=item["description"],
            use_with=item["use_with"],
            status="ACTIVE",
        )
        db.add(cls)
        db.flush()

        for attr in item.get("attributes", []):
            spec = ClassSpec(
                id=f"{item['classstructure_id']}:{attr['attribute_id']}",
                classstructure_id=item["classstructure_id"],
                attribute_id=attr["attribute_id"],
                section=attr.get("section"),
                description=attr["description"],
                data_type=attr["data_type"],
                unit_of_measure=attr.get("unit_of_measure"),
                domain_values=attr.get("domain_values"),
                mandatory=attr.get("mandatory", False),
                apply_down_hierarchy=attr.get("apply_down_hierarchy", True),
                display_sequence=attr.get("display_sequence", 1),
            )
            db.add(spec)

    db.commit()

    # 2. Attach Classifications and Specs to Demo Assets
    pump_asset = db.query(Asset).filter(and_(Asset.site_id == "BEDFORD", Asset.asset_id == "PUMP_SYS_100")).first()
    if pump_asset:
        pump_asset.classstructure_id = "CS_PUMP_CENT"
        pump_asset.classification_path = "ROTATING \\ PUMP \\ CENTRIFUGAL"
        demo_pump_specs = [
            ("FLOW_RATE", None, 450.0, "GPM"),
            ("HEAD_FEET", None, 320.0, "FT"),
            ("IMPELLER_DIA", None, 12.5, "IN"),
            ("CASING_MAT", "316L Stainless Steel", None, None),
            ("MAX_PRESSURE", None, 600.0, "PSI"),
            ("RPM_RATED", None, 3550.0, "RPM"),
            ("LUBRICANT_TYPE", "Synthetic ISO VG 46", None, None),
        ]
        for aid, aln, num, uom in demo_pump_specs:
            db.add(AssetSpec(
                id=f"BEDFORD:PUMP_SYS_100:{aid}",
                asset_id="PUMP_SYS_100",
                site_id="BEDFORD",
                classstructure_id="CS_PUMP_CENT",
                attribute_id=aid,
                aln_value=aln,
                num_value=num,
                unit_of_measure=uom,
            ))

    motor_asset = db.query(Asset).filter(and_(Asset.site_id == "BEDFORD", Asset.asset_id == "MOTOR_50HP_01")).first()
    if motor_asset:
        motor_asset.classstructure_id = "CS_MOTOR"
        motor_asset.classification_path = "ROTATING \\ MOTOR"
        demo_motor_specs = [
            ("HORSEPOWER", None, 50.0, "HP"),
            ("VOLTAGE_RATED", None, 460.0, "V"),
            ("FRAME_SIZE", "324T", None, None),
            ("ENCLOSURE", "TEFC", None, None),
            ("RPM_RATED", None, 1780.0, "RPM"),
            ("LUBRICANT_TYPE", "Grease NLGI 2", None, None),
        ]
        for aid, aln, num, uom in demo_motor_specs:
            db.add(AssetSpec(
                id=f"BEDFORD:MOTOR_50HP_01:{aid}",
                asset_id="MOTOR_50HP_01",
                site_id="BEDFORD",
                classstructure_id="CS_MOTOR",
                attribute_id=aid,
                aln_value=aln,
                num_value=num,
                unit_of_measure=uom,
            ))

    xfrm_asset = db.query(Asset).filter(and_(Asset.site_id == "NASHUA", Asset.asset_id == "TRANSFORMER_T1")).first()
    if xfrm_asset:
        xfrm_asset.classstructure_id = "CS_XFRM"
        xfrm_asset.classification_path = "ELECTRICAL \\ TRANSFORMER"
        demo_xfrm_specs = [
            ("PRIMARY_VOLTAGE", None, 115.0, "kV"),
            ("SECONDARY_VOLTAGE", None, 13.8, "kV"),
            ("CAPACITY_KVA", None, 25000.0, "kVA"),
            ("COOLING_TYPE", "ONAF", None, None),
        ]
        for aid, aln, num, uom in demo_xfrm_specs:
            db.add(AssetSpec(
                id=f"NASHUA:TRANSFORMER_T1:{aid}",
                asset_id="TRANSFORMER_T1",
                site_id="NASHUA",
                classstructure_id="CS_XFRM",
                attribute_id=aid,
                aln_value=aln,
                num_value=num,
                unit_of_measure=uom,
            ))

    # 3. Attach Classifications and Specs to Demo Locations
    mech_loc = db.query(Location).filter(and_(Location.site_id == "BEDFORD", Location.location_id == "MECH_ROOM_101")).first()
    if mech_loc:
        mech_loc.classstructure_id = "CS_MECH_ROOM"
        mech_loc.classification_path = "FACILITY \\ BUILDING \\ MECH_ROOM"
        demo_mech_specs = [
            ("SQUARE_FEET", None, 3200.0, "SQFT"),
            ("HVAC_ZONE", "Zone 4 - Unconditioned", None, None),
            ("MAX_OCCUPANCY", None, 10.0, None),
            ("EXPLOSION_VENT", "YES", None, None),
            ("BACKUP_POWER", "YES", None, None),
        ]
        for aid, aln, num, uom in demo_mech_specs:
            db.add(LocationSpec(
                id=f"BEDFORD:MECH_ROOM_101:{aid}",
                location_id="MECH_ROOM_101",
                site_id="BEDFORD",
                classstructure_id="CS_MECH_ROOM",
                attribute_id=aid,
                aln_value=aln,
                num_value=num,
                unit_of_measure=uom,
            ))

    bldg_loc = db.query(Location).filter(and_(Location.site_id == "BEDFORD", Location.location_id == "BLDG_01")).first()
    if bldg_loc:
        bldg_loc.classstructure_id = "CS_BLDG"
        bldg_loc.classification_path = "FACILITY \\ BUILDING"
        demo_bldg_specs = [
            ("SQUARE_FEET", None, 85000.0, "SQFT"),
            ("HVAC_ZONE", "Zone 2 - Production", None, None),
            ("NUM_FLOORS", None, 2.0, None),
            ("FIRE_RATING", "Class A (Sprinklered)", None, None),
        ]
        for aid, aln, num, uom in demo_bldg_specs:
            db.add(LocationSpec(
                id=f"BEDFORD:BLDG_01:{aid}",
                location_id="BLDG_01",
                site_id="BEDFORD",
                classstructure_id="CS_BLDG",
                attribute_id=aid,
                aln_value=aln,
                num_value=num,
                unit_of_measure=uom,
            ))

    store_loc = db.query(Location).filter(and_(Location.site_id == "BEDFORD", Location.location_id == "CENTRAL_STORE_01")).first()
    if store_loc:
        store_loc.classstructure_id = "CS_STOREROOM"
        store_loc.classification_path = "FACILITY \\ STOREROOM"
        demo_store_specs = [
            ("SQUARE_FEET", None, 12500.0, "SQFT"),
            ("HVAC_ZONE", "Zone 2 - Production", None, None),
            ("SECURITY_LEVEL", "Badge Restricted", None, None),
            ("TEMPERATURE_CONTROLLED", "YES", None, None),
        ]
        for aid, aln, num, uom in demo_store_specs:
            db.add(LocationSpec(
                id=f"BEDFORD:CENTRAL_STORE_01:{aid}",
                location_id="CENTRAL_STORE_01",
                site_id="BEDFORD",
                classstructure_id="CS_STOREROOM",
                attribute_id=aid,
                aln_value=aln,
                num_value=num,
                unit_of_measure=uom,
            ))

    db.commit()


def seed_default_meters(db: Session) -> None:
    """Idempotently seeds master meters, meter groups, demo asset/location meters, and measure points."""
    from sqlalchemy import and_
    from backend.models.meter import (
        Meter,
        MeterGroup,
        MeterInGroup,
        AssetMeter,
        LocationMeter,
        MeterReading,
        MeasurePoint,
    )
    from backend.models.asset_hierarchy import Asset, Location
    from backend.models.base import utc_now

    # 1. Master Meters
    master_meters = [
        # Continuous
        {"meter_id": "RUNHOURS", "description": "Operating Run Hours", "meter_type": "CONTINUOUS", "reading_type": "ACTUAL", "unit_of_measure": "HOURS"},
        {"meter_id": "KWH_METER", "description": "Electrical Energy Consumption", "meter_type": "CONTINUOUS", "reading_type": "ACTUAL", "unit_of_measure": "kWH"},
        {"meter_id": "ODOMETER", "description": "Vehicle Travel Distance", "meter_type": "CONTINUOUS", "reading_type": "ACTUAL", "unit_of_measure": "MILES"},
        {"meter_id": "CYCLE_COUNT", "description": "Operating Stroke Cycles", "meter_type": "CONTINUOUS", "reading_type": "ACTUAL", "unit_of_measure": "CYCLES"},
        {"meter_id": "FLOW_TOTAL", "description": "Totalized Fluid Throughput", "meter_type": "CONTINUOUS", "reading_type": "ACTUAL", "unit_of_measure": "GALLONS"},
        # Gauge
        {"meter_id": "DISCHARGE_PSI", "description": "Pump Discharge Pressure", "meter_type": "GAUGE", "unit_of_measure": "PSI"},
        {"meter_id": "SUCTION_PSI", "description": "Pump Inlet Suction Pressure", "meter_type": "GAUGE", "unit_of_measure": "PSI"},
        {"meter_id": "BEARING_TEMP", "description": "Drive Bearing Temperature", "meter_type": "GAUGE", "unit_of_measure": "DEG_C"},
        {"meter_id": "VIB_VELOCITY", "description": "Overall Vibration Velocity RMS", "meter_type": "GAUGE", "unit_of_measure": "MM/S"},
        {"meter_id": "VOLTAGE_MEAS", "description": "Measured Line Operating Voltage", "meter_type": "GAUGE", "unit_of_measure": "V"},
        {"meter_id": "AMPERAGE_MEAS", "description": "Measured Full Load Current", "meter_type": "GAUGE", "unit_of_measure": "A"},
        {"meter_id": "DIFF_PRESSURE", "description": "Filter Differential Pressure", "meter_type": "GAUGE", "unit_of_measure": "PSI"},
        # Characteristic
        {"meter_id": "OIL_CONDITION", "description": "Lube Oil Visual Quality", "meter_type": "CHARACTERISTIC", "domain_values": ["CLEAR", "AMBER", "DARK", "BURNT"]},
        {"meter_id": "BELT_TENSION", "description": "Drive Belt Mechanical Condition", "meter_type": "CHARACTERISTIC", "domain_values": ["NORMAL", "SLACK", "FRAYED"]},
        {"meter_id": "INSPECTION_STATUS", "description": "Visual Integrity Status", "meter_type": "CHARACTERISTIC", "domain_values": ["PASS", "ADVISORY", "FAIL"]},
    ]

    for item in master_meters:
        mid = item["meter_id"]
        if not db.query(Meter).filter(Meter.meter_id == mid).first():
            db.add(Meter(
                meter_id=mid,
                description=item["description"],
                meter_type=item.get("meter_type", "CONTINUOUS"),
                reading_type=item.get("reading_type", "ACTUAL"),
                unit_of_measure=item.get("unit_of_measure"),
                domain_values=item.get("domain_values"),
                status="ACTIVE",
            ))
    db.commit()

    # 2. Meter Groups
    meter_groups_data = [
        {
            "group_id": "MG_ROTATING_PUMP",
            "description": "Centrifugal Pumps Standard Monitoring Group",
            "meters": [
                {"meter_id": "RUNHOURS", "sequence": 1, "default_rollover": 100000.0, "default_avg_method": "ALL"},
                {"meter_id": "DISCHARGE_PSI", "sequence": 2},
                {"meter_id": "VIB_VELOCITY", "sequence": 3},
                {"meter_id": "OIL_CONDITION", "sequence": 4},
            ],
        },
        {
            "group_id": "MG_ELECTRIC_MOTOR",
            "description": "Electric Induction Motors Monitoring Group",
            "meters": [
                {"meter_id": "RUNHOURS", "sequence": 1, "default_rollover": 100000.0, "default_avg_method": "ALL"},
                {"meter_id": "BEARING_TEMP", "sequence": 2},
                {"meter_id": "VIB_VELOCITY", "sequence": 3},
                {"meter_id": "AMPERAGE_MEAS", "sequence": 4},
            ],
        },
        {
            "group_id": "MG_TRANSFORMER",
            "description": "Power Transformers Monitoring Group",
            "meters": [
                {"meter_id": "VOLTAGE_MEAS", "sequence": 1},
                {"meter_id": "BEARING_TEMP", "sequence": 2},
                {"meter_id": "OIL_CONDITION", "sequence": 3},
            ],
        },
        {
            "group_id": "MG_FACILITY_ROOM",
            "description": "Facility Mechanical Room Energy & Inspection Group",
            "meters": [
                {"meter_id": "KWH_METER", "sequence": 1, "default_rollover": 1000000.0, "default_avg_method": "ALL"},
                {"meter_id": "INSPECTION_STATUS", "sequence": 2},
            ],
        },
    ]

    for g in meter_groups_data:
        gid = g["group_id"]
        if not db.query(MeterGroup).filter(MeterGroup.group_id == gid).first():
            grp = MeterGroup(
                group_id=gid,
                description=g["description"],
                status="ACTIVE",
            )
            db.add(grp)
            db.flush()
            for idx, m_item in enumerate(g.get("meters", [])):
                db.add(MeterInGroup(
                    id=f"{gid}:{m_item['meter_id']}",
                    group_id=gid,
                    meter_id=m_item["meter_id"],
                    sequence=m_item.get("sequence", idx + 1),
                    default_rollover=m_item.get("default_rollover"),
                    default_avg_method=m_item.get("default_avg_method", "ALL"),
                ))
    db.commit()

    # 3. Attach meters to demo assets if not present
    pump_asset = db.query(Asset).filter(and_(Asset.site_id == "BEDFORD", Asset.asset_id == "PUMP_SYS_100")).first()
    if pump_asset:
        pump_meters = [
            ("RUNHOURS", 4250.5, None, 100000.0, 14.5, 4250.5, 1250.0),
            ("DISCHARGE_PSI", 185.0, None, None, 0.0, 0.0, 0.0),
            ("VIB_VELOCITY", 2.8, None, None, 0.0, 0.0, 0.0),
            ("OIL_CONDITION", None, "CLEAR", None, 0.0, 0.0, 0.0),
        ]
        for mid, val, aln, rollover, avg, ltd, slo in pump_meters:
            pk = f"BEDFORD:PUMP_SYS_100:{mid}"
            if not db.query(AssetMeter).filter(AssetMeter.id == pk).first():
                db.add(AssetMeter(
                    id=pk,
                    site_id="BEDFORD",
                    asset_id="PUMP_SYS_100",
                    meter_id=mid,
                    last_reading=val,
                    last_reading_aln=aln,
                    last_reading_date=utc_now(),
                    rollover_point=rollover,
                    avg_units_per_day=avg,
                    life_to_date=ltd,
                    since_last_overhaul=slo,
                    since_last_repair=slo,
                    active=True,
                ))

    motor_asset = db.query(Asset).filter(and_(Asset.site_id == "BEDFORD", Asset.asset_id == "MOTOR_50HP_01")).first()
    if motor_asset:
        motor_meters = [
            ("RUNHOURS", 3890.0, None, 100000.0, 16.0, 3890.0, 890.0),
            ("BEARING_TEMP", 68.5, None, None, 0.0, 0.0, 0.0),
            ("VIB_VELOCITY", 1.9, None, None, 0.0, 0.0, 0.0),
            ("AMPERAGE_MEAS", 58.2, None, None, 0.0, 0.0, 0.0),
        ]
        for mid, val, aln, rollover, avg, ltd, slo in motor_meters:
            pk = f"BEDFORD:MOTOR_50HP_01:{mid}"
            if not db.query(AssetMeter).filter(AssetMeter.id == pk).first():
                db.add(AssetMeter(
                    id=pk,
                    site_id="BEDFORD",
                    asset_id="MOTOR_50HP_01",
                    meter_id=mid,
                    last_reading=val,
                    last_reading_aln=aln,
                    last_reading_date=utc_now(),
                    rollover_point=rollover,
                    avg_units_per_day=avg,
                    life_to_date=ltd,
                    since_last_overhaul=slo,
                    since_last_repair=slo,
                    active=True,
                ))

    # 4. Attach meters to demo locations
    mech_loc = db.query(Location).filter(and_(Location.site_id == "BEDFORD", Location.location_id == "MECH_ROOM_101")).first()
    if mech_loc:
        loc_meters = [
            ("KWH_METER", 148200.0, None, 1000000.0, 350.0, 148200.0),
            ("INSPECTION_STATUS", None, "PASS", None, 0.0, 0.0),
        ]
        for mid, val, aln, rollover, avg, ltd in loc_meters:
            pk = f"BEDFORD:MECH_ROOM_101:{mid}"
            if not db.query(LocationMeter).filter(LocationMeter.id == pk).first():
                db.add(LocationMeter(
                    id=pk,
                    site_id="BEDFORD",
                    location_id="MECH_ROOM_101",
                    meter_id=mid,
                    last_reading=val,
                    last_reading_aln=aln,
                    last_reading_date=utc_now(),
                    rollover_point=rollover,
                    avg_units_per_day=avg,
                    life_to_date=ltd,
                    active=True,
                ))

    # 5. Measure Points (Condition Monitoring)
    sample_mps = [
        {
            "point_id": "MP_PUMP100_VIB",
            "description": "Centrifugal Pump Bearing Vibration Warning & Action Limits",
            "site_id": "BEDFORD",
            "asset_id": "PUMP_SYS_100",
            "meter_id": "VIB_VELOCITY",
            "upper_action_limit": 4.5,
            "upper_warning_limit": 3.5,
            "action_description": "Excessive Vibration - Perform Laser Alignment & Bearing Inspection",
            "action_job_plan": "JP_PUMP_VIB_INSPECT",
            "action_priority": 1,
        },
        {
            "point_id": "MP_PUMP100_OIL",
            "description": "Pump Lube Oil Condition Limit",
            "site_id": "BEDFORD",
            "asset_id": "PUMP_SYS_100",
            "meter_id": "OIL_CONDITION",
            "action_aln_value": "BURNT",
            "action_description": "Degraded Lube Oil - Flush Reservoir and Replace Lubricant",
            "action_priority": 2,
        },
        {
            "point_id": "MP_MOTOR01_TEMP",
            "description": "Motor Bearing Operating Temperature Limits",
            "site_id": "BEDFORD",
            "asset_id": "MOTOR_50HP_01",
            "meter_id": "BEARING_TEMP",
            "upper_action_limit": 90.0,
            "upper_warning_limit": 75.0,
            "action_description": "Motor Overheating - Inspect Fan Cowl & Greasing Condition",
            "action_priority": 1,
        },
    ]

    for mp in sample_mps:
        pid = mp["point_id"]
        if not db.query(MeasurePoint).filter(MeasurePoint.point_id == pid).first():
            db.add(MeasurePoint(
                point_id=pid,
                description=mp["description"],
                site_id=mp["site_id"],
                asset_id=mp.get("asset_id"),
                meter_id=mp["meter_id"],
                upper_action_limit=mp.get("upper_action_limit"),
                upper_warning_limit=mp.get("upper_warning_limit"),
                action_aln_value=mp.get("action_aln_value"),
                action_description=mp.get("action_description"),
                action_job_plan=mp.get("action_job_plan"),
                action_priority=mp.get("action_priority", 1),
                status="ACTIVE",
            ))
    db.commit()


def seed_default_document_folders(db: Session) -> None:
    """Seeds default document folder categories (Attachments, Manuals, Drawings, Certificates, Invoices, Photos)."""
    from backend.services.doc_management_service import doc_management_service
    doc_management_service.seed_default_folders(db)

