export interface DashboardSummary {
    readonly customersCount: number
    readonly contractsCount: number
    readonly openInvoicesCount: number
    readonly paidInvoicesCount: number
    readonly openAmountCents: number
    readonly paidAmountCents: number
}

export interface OperationalRadar {
    readonly today: string
    readonly cutoffReachedCount: number
    readonly cutoffReachedAmountCents: number
    readonly inGraceCount: number
    readonly inGraceAmountCents: number
}

export interface PublicConfig {
    readonly companyName: string
    readonly companyRif: string
    readonly companyEmail: string
    readonly apiUrl: string
    readonly apiUser: string
    readonly allowedStatuses: readonly string[]
    readonly windowMonths: number | null
    readonly maxRecentInstallments: number | null
    readonly graceDays: number
    readonly maxNewInvoices: number | null
    readonly maxNewAmountCents: number | null
    readonly excludedDocTypes: readonly string[]
    readonly autoRunEnabled: boolean
    readonly autoRunTime: string
    readonly simulatorUrl: string
}

export interface SyncRunRecord {
    readonly id: number
    readonly runType: 'import' | 'update_paid'
    readonly isSimulation: boolean
    readonly status: 'completed' | 'failed'
    readonly startedAt: string
    readonly finishedAt: string
    readonly summaryText: string
    readonly errorMessage: string | null
    readonly counters: Record<string, number>
}

export interface SyncRunItemRecord {
    readonly id: number
    readonly runId: number
    readonly contractId: number
    readonly holderName: string
    readonly holderId: string
    readonly externalDeudaId: string
    readonly period: string
    readonly amountCents: number
    readonly outcome: string
    readonly reason: string
}

export interface CustomerListItem {
    readonly id: string
    readonly name: string
    readonly personType: 'natural' | 'juridico'
    readonly contractsCount: number
    readonly openInvoicesCount: number
    readonly paidInvoicesCount: number
    readonly debtCents: number
    readonly oldestDueDate: string | null
}

export interface CustomerDossier {
    readonly customer: {
        readonly id: string
        readonly rawIdentification: string
        readonly name: string
        readonly personType: 'natural' | 'juridico'
        readonly email: string
        readonly phone: string
        readonly address: string
        readonly origin: string
        readonly createdAt: string
    }
    readonly contracts: ReadonlyArray<{
        readonly id: number
        readonly code: string
        readonly status: string
        readonly planName: string
        readonly planPriceCents: number
        readonly currency: string
        readonly branchCode: string
    }>
    readonly invoices: ReadonlyArray<{
        readonly id: number
        readonly cobrixNumber: string
        readonly externalDeudaId: string
        readonly contractId: number
        readonly period: string
        readonly dueDate: string
        readonly cutoffDate: string
        readonly totalCents: number
        readonly balanceCents: number
        readonly status: 'open' | 'paid'
        readonly paidAt: string | null
        readonly ispInvoiceNumber: string | null
    }>
    readonly events: ReadonlyArray<{
        readonly id: number
        readonly eventType: string
        readonly description: string
        readonly occurredAt: string
    }>
    readonly totals: {
        readonly contractsCount: number
        readonly openInvoicesCount: number
        readonly paidInvoicesCount: number
        readonly debtCents: number
    }
}

export interface OverviewResponse {
    readonly summary: DashboardSummary
    readonly radar: OperationalRadar
    readonly config: PublicConfig
    readonly recentRuns: readonly SyncRunRecord[]
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(path, {
        ...init,
        headers: {
            'content-type': 'application/json',
            ...(init?.headers ?? {}),
        },
    })
    const data = await res.json()
    if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`)
    }
    return data as T
}

export const api = {
    getOverview: () => request<OverviewResponse>('/api/cobrix/overview'),
    getCustomers: (q = '') => request<{ customers: CustomerListItem[] }>(`/api/cobrix/customers?q=${encodeURIComponent(q)}`),
    getCustomerDossier: (id: string) => request<CustomerDossier>(`/api/cobrix/customers/${encodeURIComponent(id)}`),
    getRuns: () => request<{ runs: SyncRunRecord[] }>('/api/cobrix/runs'),
    getRunDetail: (id: number) => request<{ run: SyncRunRecord; items: SyncRunItemRecord[] }>(`/api/cobrix/runs/${id}`),
    runImport: (dryRun: boolean) =>
        request<{ run: SyncRunRecord }>('/api/cobrix/sync/import', {
            method: 'POST',
            body: JSON.stringify({ dryRun }),
        }),
    runUpdatePaid: (dryRun: boolean) =>
        request<{ run: SyncRunRecord }>('/api/cobrix/sync/update-paid', {
            method: 'POST',
            body: JSON.stringify({ dryRun }),
        }),
    getConfig: () => request<PublicConfig>('/api/cobrix/config'),
    updateConfig: (payload: Record<string, unknown>) =>
        request<PublicConfig>('/api/cobrix/config', {
            method: 'PUT',
            body: JSON.stringify(payload),
        }),
    testConnection: (payload: { apiUrl?: string; apiUser?: string; apiPassword?: string }) =>
        request<{ ok: boolean; contractsCount: number; message: string }>('/api/cobrix/config/test-connection', {
            method: 'POST',
            body: JSON.stringify(payload),
        }),
}

const currencyFormatter = new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
})

export function formatUsd(cents: number): string {
    return `USD ${currencyFormatter.format(cents / 100)}`
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function formatDate(value: string | null | undefined): string {
    if (!value) return '—'
    const [y, m, d] = value.slice(0, 10).split('-')
    if (!y || !m) return value
    return d ? `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}` : `${MONTHS[Number(m) - 1]} ${y}`
}

export function formatDateTime(value: string | null | undefined): string {
    if (!value) return '—'
    return new Intl.DateTimeFormat('es-VE', {
        timeZone: 'America/Caracas',
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value))
}