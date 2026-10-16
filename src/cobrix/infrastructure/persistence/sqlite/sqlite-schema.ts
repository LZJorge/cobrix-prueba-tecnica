export const COBRIX_SCHEMA = `
CREATE TABLE IF NOT EXISTS config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    company_name TEXT NOT NULL,
    company_rif TEXT NOT NULL,
    company_email TEXT NOT NULL,
    api_url TEXT NOT NULL,
    api_user TEXT NOT NULL,
    api_password TEXT NOT NULL,
    allowed_statuses TEXT NOT NULL,
    window_months INTEGER,
    max_recent_installments INTEGER,
    grace_days INTEGER NOT NULL DEFAULT 0,
    max_new_invoices INTEGER,
    max_new_amount_cents INTEGER,
    excluded_doc_types TEXT NOT NULL DEFAULT '[]',
    auto_run_enabled INTEGER NOT NULL DEFAULT 0,
    auto_run_time TEXT NOT NULL DEFAULT '06:00'
);

CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    raw_identification TEXT NOT NULL,
    name TEXT NOT NULL,
    person_type TEXT NOT NULL CHECK (person_type IN ('natural', 'juridico')),
    doc_letter TEXT,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    origin TEXT NOT NULL DEFAULT 'API ISP',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contracts (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL,
    customer_id TEXT NOT NULL REFERENCES customers(id),
    status TEXT NOT NULL,
    plan_name TEXT NOT NULL,
    plan_price_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    branch_code TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cobrix_number TEXT NOT NULL UNIQUE,
    external_deuda_id TEXT NOT NULL UNIQUE,
    customer_id TEXT NOT NULL REFERENCES customers(id),
    contract_id INTEGER NOT NULL REFERENCES contracts(id),
    period TEXT NOT NULL,
    due_date TEXT NOT NULL,
    cutoff_date TEXT NOT NULL,
    total_cents INTEGER NOT NULL,
    balance_cents INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open', 'paid')),
    paid_at TEXT,
    isp_invoice_number TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id TEXT NOT NULL REFERENCES customers(id),
    event_type TEXT NOT NULL CHECK (event_type IN ('customer_created', 'invoice_imported', 'invoice_paid')),
    description TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    meta_json TEXT
);

CREATE TABLE IF NOT EXISTS sync_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_type TEXT NOT NULL CHECK (run_type IN ('import', 'update_paid')),
    is_simulation INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL,
    summary_text TEXT NOT NULL,
    error_message TEXT,
    counters_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_run_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
    contract_id INTEGER NOT NULL,
    holder_name TEXT NOT NULL,
    holder_id TEXT NOT NULL,
    external_deuda_id TEXT NOT NULL,
    period TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    outcome TEXT NOT NULL,
    reason TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_contracts_customer ON contracts(customer_id);
CREATE INDEX IF NOT EXISTS idx_events_customer ON customer_events(customer_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_run_items_run ON sync_run_items(run_id, id);
`