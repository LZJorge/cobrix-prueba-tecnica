import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, rmSync } from 'node:fs'

import { SANDBOX_API_USER, seedBillingApi } from '../src/billing-api/seed.ts'
import { createBillingApiServer } from '../src/billing-api/server.ts'
import { SqliteStoreService } from '../src/cobrix/infrastructure/persistence/sqlite/sqlite-store.service.ts'
import { IspApiService } from '../src/cobrix/infrastructure/api-client/isp-api.service.ts'
import { SyncService } from '../src/cobrix/application/use-cases/sync.service.ts'

process.env.SANDBOX_TODAY = '2026-10-13'

describe('Integration: Cobrix Full Lifecycle & Security', () => {
    const API_PORT = 4313
    const SIMULATOR_URL = `http://127.0.0.1:${API_PORT}`
    const DB_PATH = './test-cobrix-api.sqlite'

    let billingApi: any
    let store: SqliteStoreService
    let client: IspApiService
    let syncService: SyncService

    before(async () => {
        if (existsSync(DB_PATH)) rmSync(DB_PATH)
        seedBillingApi(DB_PATH)
        billingApi = createBillingApiServer(DB_PATH)
        await billingApi.listen(API_PORT, '127.0.0.1')

        store = new SqliteStoreService(':memory:', SIMULATOR_URL)
        store.onModuleInit()
        client = new IspApiService()
        syncService = new SyncService(store, client)
    })

    after(async () => {
        store.onModuleDestroy()
        await billingApi.close()
        if (existsSync(DB_PATH)) rmSync(DB_PATH)
    })

    const clearDb = () => {
        store.db.exec('DELETE FROM sync_run_items; DELETE FROM sync_runs; DELETE FROM customer_events; DELETE FROM invoices; DELETE FROM contracts; DELETE FROM customers;')
    }

    const resetConfig = () => {
        store.updateConfig({
            windowMonths: null,
            maxRecentInstallments: null,
            maxNewInvoices: null,
            maxNewAmountCents: null,
            excludedDocTypes: [],
            apiPassword: SANDBOX_API_USER.password,
        })
    }

    describe('Security & Connection Errors', () => {
        it('Fails connection test with invalid credentials', async () => {
            const res = await syncService.testConnection({ apiPassword: 'wrong-password' })
            assert.equal(res.ok, false)
            assert.match(res.message, /HTTP 401|Authentication failed|Contraseña Incorrecta/i)
        })

        it('Records a failed sync run when credentials are bad', async () => {
            store.updateConfig({ apiPassword: 'wrong-password' })
            const res = await syncService.runImport({ dryRun: false })
            assert.equal(res.status, 'failed')
            assert.match(String(res.errorMessage), /HTTP 401|Authentication failed|Contraseña Incorrecta/i)
            resetConfig()
        })
    })

    describe('Business Rules & Human Constraints (Limits)', () => {
        before(() => { 
            clearDb()
            resetConfig() 
        })

        it('Applies max new invoices limit', async () => {
            store.updateConfig({ maxNewInvoices: 5 })
            const res = await syncService.runImport({ dryRun: false })
            
            assert.equal(res.status, 'completed', res.errorMessage ?? '')
            assert.equal(Number(res.counters['importedInvoices'] ?? 0), 5)
            assert.ok(Number(res.counters['cappedInvoices'] ?? 0) > 0)
            
            clearDb()
            resetConfig()
        })

        it('Applies max new amount limit', async () => {
            store.updateConfig({ maxNewAmountCents: 10000 })
            const res = await syncService.runImport({ dryRun: false })
            
            assert.equal(res.status, 'completed', res.errorMessage ?? '')
            assert.ok(Number(res.counters['importedAmountCents'] ?? 0) <= 10000)
            assert.ok(Number(res.counters['cappedInvoices'] ?? 0) > 0)
            
            clearDb()
            resetConfig()
        })

        it('Excludes specific document types', async () => {
            store.updateConfig({ excludedDocTypes: ['V'] })
            const res = await syncService.runImport({ dryRun: false })
            
            assert.ok(Number(res.counters['excludedDocType'] ?? 0) > 0)
            const customers = store.listCustomers()
            const vCustomers = customers.filter(c => c.personType === 'natural' && c.id.startsWith('V'))
            assert.equal(vCustomers.length, 0)
            
            clearDb()
            resetConfig()
        })

        it('Applies window months constraint', async () => {
            store.updateConfig({ windowMonths: 3 })
            const res = await syncService.runImport({ dryRun: false })
            
            assert.ok(Number(res.counters['excludedWindow'] ?? 0) > 0)
            
            clearDb()
            resetConfig()
        })

        it('Applies max recent installments per contract', async () => {
            store.updateConfig({ maxRecentInstallments: 2 })
            const res = await syncService.runImport({ dryRun: false })
            
            assert.ok(Number(res.counters['excludedMaxRecent'] ?? 0) > 0)
            
            clearDb()
            resetConfig()
        })
    })

    describe('Happy Path: Acceptance Criteria Workflow', () => {
        before(() => {
            clearDb()
            resetConfig()
        })

        it('Simulates import without saving', async () => {
            const res = await syncService.runImport({ dryRun: true })
            assert.equal(res.status, 'completed', res.errorMessage ?? '')
            assert.equal(Number(res.counters['importedInvoices'] ?? 0), 42)
            
            const summary = store.getDashboardSummary()
            assert.equal(summary.customersCount, 0)
        })

        it('Executes real import matching exact acceptance criteria', async () => {
            const res = await syncService.runImport({ dryRun: false })
            
            assert.equal(res.status, 'completed', res.errorMessage ?? '')
            assert.equal(Number(res.counters['importedInvoices'] ?? 0), 42)
            assert.equal(Number(res.counters['newCustomers'] ?? 0), 20)
            assert.equal(Number(res.counters['importedAmountCents'] ?? 0), 123500)
            
            assert.equal(Number(res.counters['excludedStatus'] ?? 0), 9)
            assert.equal(Number(res.counters['excludedCurrency'] ?? 0), 1)
            assert.equal(Number(res.counters['excludedResidual'] ?? 0), 1)

            const dossierLuis = store.listCustomers('LUIS GOMEZ')[0]
            assert.ok(dossierLuis)
            assert.equal(dossierLuis.contractsCount, 2)

            const dossierElena = store.listCustomers('ELENA RUIZ')[0]
            assert.ok(dossierElena)
            assert.equal(dossierElena.id, '9000123')

            assert.equal(store.listCustomers('CARLOS ROJAS').length, 0)
            assert.equal(store.listCustomers('ROSA DIAZ').length, 0)
            assert.equal(store.listCustomers('PEDRO LEON').length, 0)
            assert.equal(store.listCustomers('ANDRES VARGAS').length, 0)
            assert.equal(store.listCustomers('LAURA MENDEZ').length, 0)
            assert.equal(store.listCustomers('JORGE CASTILLO').length, 0)
        })

        it('Ensures idempotency (second import does nothing)', async () => {
            const res = await syncService.runImport({ dryRun: false })
            assert.equal(Number(res.counters['importedInvoices'] ?? 0), 0)
            assert.equal(Number(res.counters['alreadyImported'] ?? 0), 42)
        })

        it('Processes simulated payments and updates paid invoices', async () => {
            const simPagar = async (body: any) => {
                const r = await fetch(`${SIMULATOR_URL}/__sim/pagar`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                })
                return r.json()
            }

            const simAnular = async (idFactura: number) => {
                await fetch(`${SIMULATOR_URL}/__sim/anular`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id_factura: idFactura })
                })
            }

            await simPagar({ id_contrato: 900101 })
            await simPagar({ id_contrato: 900103, monto: 25 })
            await simPagar({ id_contrato: 900104 })
            await simPagar({ id_contrato: 900114, monto: 70 })

            const pagoElena = await simPagar({ id_contrato: 900113 })
            
            const idFactura = pagoElena.id_factura ?? pagoElena.data?.id_factura ?? pagoElena.factura?.id_factura
            if (idFactura) await simAnular(idFactura)

            const res = await syncService.runUpdatePaid({ dryRun: false })
            
            assert.equal(Number(res.counters['markedPaid'] ?? 0), 8)
            assert.equal(Number(res.counters['partialPayments'] ?? 0), 1)
            assert.equal(Number(res.counters['stillOpen'] ?? 0), 33)

            const summary = store.getDashboardSummary()
            assert.equal(summary.paidInvoicesCount, 8)
            assert.equal(summary.openInvoicesCount, 34)
            assert.equal(summary.openAmountCents, 95500)
        })

        it('Ensures idempotency on update paid', async () => {
            const res = await syncService.runUpdatePaid({ dryRun: false })
            assert.equal(Number(res.counters['markedPaid'] ?? 0), 0)
        })
    })
})