import { 
    Injectable, 
    Inject, 
    type OnModuleInit, 
    type OnModuleDestroy 
} from '@nestjs/common';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SANDBOX_API_USER } from '../../../../billing-api/seed.ts';
import { COBRIX_SCHEMA } from './sqlite-schema.ts';
import type { DocLetter, PersonType, SyncConfig } from '../../../domain/entities/domain.ts';
import type {
    DashboardSummary,
    CustomerListItem,
    CustomerDossier,
    SyncRunRecord,
    SyncRunItemRecord,
} from '../../../domain/interfaces/store.interfaces.ts';
import { today } from '../../../../shared/dates.ts';

@Injectable()
export class SqliteStoreService implements OnModuleInit, OnModuleDestroy {
    readonly db: DatabaseSync;

    constructor(
        @Inject('DB_PATH') private readonly dbPath: string,
        @Inject('SIMULATOR_URL') private readonly defaultSimulatorUrl: string,
    ) {
        if (this.dbPath !== ':memory:') {
            mkdirSync(dirname(this.dbPath), { recursive: true });
        }
        this.db = new DatabaseSync(this.dbPath);
    }

    onModuleInit(): void {
        this.db.exec('PRAGMA foreign_keys = ON');
        this.db.exec(COBRIX_SCHEMA);
        this.ensureDefaultConfig();
    }

    onModuleDestroy(): void {
        this.db.close();
    }

    private ensureDefaultConfig(): void {
        const existing = this.db.prepare('SELECT id FROM config WHERE id = 1').get();
        if (existing) return;
        this.db
            .prepare(
                `INSERT INTO config (
                    id, company_name, company_rif, company_email,
                    api_url, api_user, api_password,
                    allowed_statuses, window_months, max_recent_installments,
                    grace_days, max_new_invoices, max_new_amount_cents,
                    excluded_doc_types, auto_run_enabled, auto_run_time
                ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 5, NULL, NULL, '[]', 0, '06:00')`,
            )
            .run(
                'Cobrix Venezuela, C.A.',
                'J-50012345-0',
                'cobranzas@cobrix.co',
                this.defaultSimulatorUrl,
                SANDBOX_API_USER.user_name,
                SANDBOX_API_USER.password,
                JSON.stringify(['ACTIVO', 'CORTADO']),
            );
    }

    getConfig(): SyncConfig {
        const row = this.db.prepare('SELECT * FROM config WHERE id = 1').get() as Record<string, unknown>;
        return {
            companyName: String(row.company_name),
            companyRif: String(row.company_rif),
            companyEmail: String(row.company_email),
            apiUrl: String(row.api_url),
            apiUser: String(row.api_user),
            apiPassword: String(row.api_password),
            allowedStatuses: JSON.parse(String(row.allowed_statuses ?? '["ACTIVO","CORTADO"]')) as string[],
            windowMonths: row.window_months === null ? null : Number(row.window_months),
            maxRecentInstallments: row.max_recent_installments === null ? null : Number(row.max_recent_installments),
            graceDays: Number(row.grace_days ?? 0),
            maxNewInvoices: row.max_new_invoices === null ? null : Number(row.max_new_invoices),
            maxNewAmountCents: row.max_new_amount_cents === null ? null : Number(row.max_new_amount_cents),
            excludedDocTypes: JSON.parse(String(row.excluded_doc_types ?? '[]')) as DocLetter[],
            autoRunEnabled: Number(row.auto_run_enabled) === 1,
            autoRunTime: String(row.auto_run_time ?? '06:00'),
        };
    }

    updateConfig(patch: Partial<SyncConfig>): SyncConfig {
        const current = this.getConfig();
        const next: SyncConfig = {
            ...current,
            ...patch,
            apiPassword:
                patch.apiPassword !== undefined && patch.apiPassword.trim() !== ''
                    ? patch.apiPassword
                    : current.apiPassword,
        };
        this.db
            .prepare(
                `UPDATE config SET
                    company_name = ?,
                    company_rif = ?,
                    company_email = ?,
                    api_url = ?,
                    api_user = ?,
                    api_password = ?,
                    allowed_statuses = ?,
                    window_months = ?,
                    max_recent_installments = ?,
                    grace_days = ?,
                    max_new_invoices = ?,
                    max_new_amount_cents = ?,
                    excluded_doc_types = ?,
                    auto_run_enabled = ?,
                    auto_run_time = ?
                WHERE id = 1`,
            )
            .run(
                next.companyName,
                next.companyRif,
                next.companyEmail,
                next.apiUrl,
                next.apiUser,
                next.apiPassword,
                JSON.stringify(next.allowedStatuses),
                next.windowMonths,
                next.maxRecentInstallments,
                next.graceDays,
                next.maxNewInvoices,
                next.maxNewAmountCents,
                JSON.stringify(next.excludedDocTypes),
                next.autoRunEnabled ? 1 : 0,
                next.autoRunTime,
            );
        return this.getConfig();
    }

    getDashboardSummary(): DashboardSummary {
        const customersCount = Number(
            (this.db.prepare('SELECT COUNT(*) AS c FROM customers').get() as { c: number }).c,
        );
        const contractsCount = Number(
            (this.db.prepare('SELECT COUNT(*) AS c FROM contracts').get() as { c: number }).c,
        );
        const openRow = this.db
            .prepare("SELECT COUNT(*) AS c, COALESCE(SUM(balance_cents), 0) AS s FROM invoices WHERE status = 'open'")
            .get() as { c: number; s: number };
        const paidRow = this.db
            .prepare("SELECT COUNT(*) AS c, COALESCE(SUM(total_cents), 0) AS s FROM invoices WHERE status = 'paid'")
            .get() as { c: number; s: number };

        return {
            customersCount,
            contractsCount,
            openInvoicesCount: Number(openRow.c),
            paidInvoicesCount: Number(paidRow.c),
            openAmountCents: Number(openRow.s),
            paidAmountCents: Number(paidRow.s),
        };
    }

    listCustomers(searchQuery = ''): CustomerListItem[] {
        const q = searchQuery.trim().toUpperCase();
        const normalizedDigits = q.replace(/[^0-9A-Z]/g, '');
        const rows = this.db
            .prepare(
                `SELECT
                    c.id,
                    c.name,
                    c.person_type,
                    c.raw_identification,
                    (SELECT COUNT(*) FROM contracts ct WHERE ct.customer_id = c.id) AS contracts_count,
                    (SELECT COUNT(*) FROM invoices i WHERE i.customer_id = c.id AND i.status = 'open') AS open_invoices,
                    (SELECT COUNT(*) FROM invoices i WHERE i.customer_id = c.id AND i.status = 'paid') AS paid_invoices,
                    (SELECT COALESCE(SUM(i.balance_cents), 0) FROM invoices i WHERE i.customer_id = c.id AND i.status = 'open') AS debt_cents,
                    (SELECT MIN(i.due_date) FROM invoices i WHERE i.customer_id = c.id AND i.status = 'open') AS oldest_due_date
                FROM customers c
                ORDER BY debt_cents DESC, c.name ASC`,
            )
            .all() as Array<Record<string, unknown>>;

        return rows
            .filter((r) => {
                if (!q) return true;
                const name = String(r.name).toUpperCase();
                const id = String(r.id).toUpperCase();
                const rawId = String(r.raw_identification).toUpperCase();
                return (
                    name.includes(q) ||
                    id.includes(q) ||
                    rawId.includes(q) ||
                    (normalizedDigits.length > 0 && id.includes(normalizedDigits))
                );
            })
            .map((r) => ({
                id: String(r.id),
                name: String(r.name),
                personType: String(r.person_type) as PersonType,
                contractsCount: Number(r.contracts_count),
                openInvoicesCount: Number(r.open_invoices),
                paidInvoicesCount: Number(r.paid_invoices),
                debtCents: Number(r.debt_cents),
                oldestDueDate: r.oldest_due_date ? String(r.oldest_due_date) : null,
            }));
    }

    getCustomerDossier(customerId: string): CustomerDossier | null {
        const customer = this.db
            .prepare('SELECT * FROM customers WHERE id = ?')
            .get(customerId) as Record<string, unknown> | undefined;
        if (!customer) return null;

        const contracts = (
            this.db
                .prepare('SELECT * FROM contracts WHERE customer_id = ? ORDER BY id ASC')
                .all(customerId) as Array<Record<string, unknown>>
        ).map((c) => ({
            id: Number(c.id),
            code: String(c.code),
            status: String(c.status),
            planName: String(c.plan_name),
            planPriceCents: Number(c.plan_price_cents),
            currency: String(c.currency),
            branchCode: String(c.branch_code),
        }));

        const invoices = (
            this.db
                .prepare('SELECT * FROM invoices WHERE customer_id = ? ORDER BY period DESC, id DESC')
                .all(customerId) as Array<Record<string, unknown>>
        ).map((i) => ({
            id: Number(i.id),
            cobrixNumber: String(i.cobrix_number),
            externalDeudaId: String(i.external_deuda_id),
            contractId: Number(i.contract_id),
            period: String(i.period),
            dueDate: String(i.due_date),
            cutoffDate: String(i.cutoff_date),
            totalCents: Number(i.total_cents),
            balanceCents: Number(i.balance_cents),
            status: String(i.status) as 'open' | 'paid',
            paidAt: i.paid_at ? String(i.paid_at) : null,
            ispInvoiceNumber: i.isp_invoice_number ? String(i.isp_invoice_number) : null,
        }));

        const events = (
            this.db
                .prepare('SELECT * FROM customer_events WHERE customer_id = ? ORDER BY id DESC')
                .all(customerId) as Array<Record<string, unknown>>
        ).map((e) => ({
            id: Number(e.id),
            eventType: String(e.event_type),
            description: String(e.description),
            occurredAt: String(e.occurred_at),
        }));

        const openInvoicesCount = invoices.filter((i) => i.status === 'open').length;
        const paidInvoicesCount = invoices.filter((i) => i.status === 'paid').length;
        const debtCents = invoices
            .filter((i) => i.status === 'open')
            .reduce((acc, i) => acc + i.balanceCents, 0);

        return {
            customer: {
                id: String(customer.id),
                rawIdentification: String(customer.raw_identification),
                name: String(customer.name),
                personType: String(customer.person_type) as PersonType,
                email: String(customer.email),
                phone: String(customer.phone),
                address: String(customer.address),
                origin: String(customer.origin),
                createdAt: String(customer.created_at),
            },
            contracts,
            invoices,
            events,
            totals: {
                contractsCount: contracts.length,
                openInvoicesCount,
                paidInvoicesCount,
                debtCents,
            },
        };
    }

    listSyncRuns(limit = 30): SyncRunRecord[] {
        const rows = this.db
            .prepare('SELECT * FROM sync_runs ORDER BY id DESC LIMIT ?')
            .all(limit) as Array<Record<string, unknown>>;
        return rows.map((r) => this.mapSyncRunRow(r));
    }

    getSyncRun(runId: number): { run: SyncRunRecord; items: SyncRunItemRecord[] } | null {
        const row = this.db.prepare('SELECT * FROM sync_runs WHERE id = ?').get(runId) as
            | Record<string, unknown>
            | undefined;
        if (!row) return null;
        const items = (
            this.db
                .prepare('SELECT * FROM sync_run_items WHERE run_id = ? ORDER BY id ASC')
                .all(runId) as Array<Record<string, unknown>>
        ).map((item) => ({
            id: Number(item.id),
            runId: Number(item.run_id),
            contractId: Number(item.contract_id),
            holderName: String(item.holder_name),
            holderId: String(item.holder_id),
            externalDeudaId: String(item.external_deuda_id),
            period: String(item.period),
            amountCents: Number(item.amount_cents),
            outcome: String(item.outcome),
            reason: String(item.reason),
        }));
        return { run: this.mapSyncRunRow(row), items };
    }

    private mapSyncRunRow(r: Record<string, unknown>): SyncRunRecord {
        return {
            id: Number(r.id),
            runType: String(r.run_type) as 'import' | 'update_paid',
            isSimulation: Number(r.is_simulation) === 1,
            status: String(r.status) as 'completed' | 'failed',
            startedAt: String(r.started_at),
            finishedAt: String(r.finished_at),
            summaryText: String(r.summary_text),
            errorMessage: r.error_message ? String(r.error_message) : null,
            counters: JSON.parse(String(r.counters_json ?? '{}')) as Record<string, number>,
        };
    }

    getAllInvoiceExternalIds(): string[] {
        return (this.db.prepare('SELECT external_deuda_id FROM invoices').all() as Array<{ external_deuda_id: string }>).map(r => r.external_deuda_id);
    }

    getAllCustomerIds(): string[] {
        return (this.db.prepare('SELECT id FROM customers').all() as Array<{ id: string }>).map(r => r.id);
    }

    getNextInvoiceSequenceId(): number {
        return Number((this.db.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM invoices').get() as { m: number }).m) + 1;
    }

    upsertCustomerAndContract(holder: any, evaluation: any, isNewCustomer: boolean): void {
        const nowIso = new Date().toISOString();
        const customerId = holder.identification.id;

        if (isNewCustomer) {
            this.db.prepare(
                `INSERT INTO customers (
                    id, raw_identification, name, person_type, doc_letter,
                    email, phone, address, origin, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'API ISP', ?, ?)`
            ).run(
                customerId, holder.rawIdentification, holder.name,
                holder.identification.personType, holder.identification.letter,
                holder.email, holder.phone, holder.address, nowIso, nowIso
            );

            this.db.prepare(
                `INSERT INTO customer_events (customer_id, event_type, description, occurred_at)
                 VALUES (?, 'customer_created', ?, ?)`
            ).run(customerId, `Cliente creado con identificación ${customerId}`, nowIso);
        } else {
            this.db.prepare(
                `UPDATE customers SET name = ?, email = ?, phone = ?, address = ?, updated_at = ? WHERE id = ?`
            ).run(holder.name, holder.email, holder.phone, holder.address, nowIso, customerId);
        }

        this.db.prepare(
            `INSERT INTO contracts (
                id, code, customer_id, status, plan_name, plan_price_cents, currency, branch_code, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                status = excluded.status, plan_name = excluded.plan_name,
                plan_price_cents = excluded.plan_price_cents, currency = excluded.currency,
                branch_code = excluded.branch_code, updated_at = excluded.updated_at`
        ).run(
            evaluation.contractId, evaluation.contractCode, customerId,
            evaluation.status, evaluation.planName, evaluation.planPriceCents,
            evaluation.currency, evaluation.branchCode, nowIso
        );
    }

    insertOpenInvoice(cobrixNumber: string, customerId: string, contractId: number, inst: any): void {
        const nowIso = new Date().toISOString();
        this.db.prepare(
            `INSERT INTO invoices (
                cobrix_number, external_deuda_id, customer_id, contract_id,
                period, due_date, cutoff_date, total_cents, balance_cents,
                status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`
        ).run(
            cobrixNumber, inst.deudaId, customerId, contractId,
            inst.period, inst.dueDate, inst.cutoffDate, inst.amountCents,
            inst.amountCents, nowIso
        );

        this.db.prepare(
            `INSERT INTO customer_events (customer_id, event_type, description, occurred_at)
             VALUES (?, 'invoice_imported', ?, ?)`
        ).run(
            customerId,
            `Factura ${cobrixNumber} importada (cuota ${inst.deudaId}, periodo ${inst.period}) por USD ${(inst.amountCents / 100).toFixed(2)}`,
            nowIso
        );
    }

    getOpenInvoices(): Array<Record<string, unknown>> {
        return this.db.prepare(
            `SELECT i.*, c.name AS holder_name
             FROM invoices i
             JOIN customers c ON c.id = i.customer_id
             WHERE i.status = 'open'
             ORDER BY i.contract_id ASC, i.period ASC, i.id ASC`
        ).all() as Array<Record<string, unknown>>;
    }

    markInvoiceAsPaid(id: number, customerId: string, cobrixNumber: string, externalDeudaId: string, paidDate: string, ispInvoiceNumber: string | null): void {
        this.db.prepare(
            `UPDATE invoices
             SET status = 'paid', balance_cents = 0, paid_at = ?, isp_invoice_number = ?
             WHERE id = ?`
        ).run(paidDate, ispInvoiceNumber, id);

        this.db.prepare(
            `INSERT INTO customer_events (customer_id, event_type, description, occurred_at)
             VALUES (?, 'invoice_paid', ?, ?)`
        ).run(
            customerId,
            `Factura ${cobrixNumber} (cuota ${externalDeudaId}) pagada en el ISP${ispInvoiceNumber ? ` con factura ${ispInvoiceNumber}` : ''}`,
            new Date().toISOString()
        );
    }

    saveSyncRun(
        runType: 'import' | 'update_paid', isSimulation: boolean, status: 'completed' | 'failed',
        startedAt: string, summaryText: string, errorMessage: string | null,
        counters: Record<string, number>, items: any[]
    ): any {
        const finishedAt = new Date().toISOString();
        
        // SQLite transactions must happen at the infrastructure layer
        this.db.exec('BEGIN');
        try {
            const result = this.db.prepare(
                `INSERT INTO sync_runs (
                    run_type, is_simulation, status, started_at, finished_at,
                    summary_text, error_message, counters_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
                runType, isSimulation ? 1 : 0, status, startedAt, finishedAt,
                summaryText, errorMessage, JSON.stringify(counters)
            );
            
            const runId = Number(result.lastInsertRowid);
            const insertItem = this.db.prepare(
                `INSERT INTO sync_run_items (
                    run_id, contract_id, holder_name, holder_id, external_deuda_id,
                    period, amount_cents, outcome, reason
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            );
            
            for (const item of items) {
                insertItem.run(
                    runId, item.contractId, item.holderName, item.holderId,
                    item.externalDeudaId, item.period, item.amountCents,
                    item.outcome, item.reason
                );
            }
            this.db.exec('COMMIT');
            return this.getSyncRun(runId)!.run;
        } catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
    }

    getOperationalRadar(): any {
        const now = today();
        const cutoff = this.db
            .prepare("SELECT COUNT(*) AS c, COALESCE(SUM(balance_cents), 0) AS s FROM invoices WHERE status = 'open' AND cutoff_date <= ?")
            .get(now) as { c: number; s: number };
        const grace = this.db
            .prepare("SELECT COUNT(*) AS c, COALESCE(SUM(balance_cents), 0) AS s FROM invoices WHERE status = 'open' AND due_date <= ? AND cutoff_date > ?")
            .get(now, now) as { c: number; s: number };

        return {
            today: now,
            cutoffReachedCount: Number(cutoff.c),
            cutoffReachedAmountCents: Number(cutoff.s),
            inGraceCount: Number(grace.c),
            inGraceAmountCents: Number(grace.s),
        };
    }

    commitImportMutations(customers: any[], invoices: any[]): void {
        this.db.exec('BEGIN');
        try {
            for (const c of customers) {
                this.upsertCustomerAndContract(c.holder, c.evaluation, c.isNewCustomer);
            }
            for (const i of invoices) {
                this.insertOpenInvoice(i.cobrixNumber, i.customerId, i.contractId, i.inst);
            }
            this.db.exec('COMMIT');
        } catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
    }

    commitPaymentMutations(payments: any[]): void {
        this.db.exec('BEGIN');
        try {
            for (const p of payments) {
                this.markInvoiceAsPaid(p.id, p.customerId, p.cobrixNumber, p.externalDeudaId, p.paidDate, p.ispInvoiceNumber);
            }
            this.db.exec('COMMIT');
        } catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
    }
}