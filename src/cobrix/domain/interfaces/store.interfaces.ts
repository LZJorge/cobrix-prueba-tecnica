import type { 
    PersonType, 
    ImportItemOutcome, 
    PaymentCheckOutcome 
} from '../entities/domain.ts';

export interface DashboardSummary {
    readonly customersCount: number;
    readonly contractsCount: number;
    readonly openInvoicesCount: number;
    readonly paidInvoicesCount: number;
    readonly openAmountCents: number;
    readonly paidAmountCents: number;
}

export interface CustomerListItem {
    readonly id: string;
    readonly name: string;
    readonly personType: PersonType;
    readonly contractsCount: number;
    readonly openInvoicesCount: number;
    readonly paidInvoicesCount: number;
    readonly debtCents: number;
    readonly oldestDueDate: string | null;
}

export interface CustomerDossier {
    readonly customer: {
        readonly id: string;
        readonly rawIdentification: string;
        readonly name: string;
        readonly personType: PersonType;
        readonly email: string;
        readonly phone: string;
        readonly address: string;
        readonly origin: string;
        readonly createdAt: string;
    };
    readonly contracts: ReadonlyArray<{
        readonly id: number;
        readonly code: string;
        readonly status: string;
        readonly planName: string;
        readonly planPriceCents: number;
        readonly currency: string;
        readonly branchCode: string;
    }>;
    readonly invoices: ReadonlyArray<{
        readonly id: number;
        readonly cobrixNumber: string;
        readonly externalDeudaId: string;
        readonly contractId: number;
        readonly period: string;
        readonly dueDate: string;
        readonly cutoffDate: string;
        readonly totalCents: number;
        readonly balanceCents: number;
        readonly status: 'open' | 'paid';
        readonly paidAt: string | null;
        readonly ispInvoiceNumber: string | null;
    }>;
    readonly events: ReadonlyArray<{
        readonly id: number;
        readonly eventType: string;
        readonly description: string;
        readonly occurredAt: string;
    }>;
    readonly totals: {
        readonly contractsCount: number;
        readonly openInvoicesCount: number;
        readonly paidInvoicesCount: number;
        readonly debtCents: number;
    };
}

export interface SyncRunRecord {
    readonly id: number;
    readonly runType: 'import' | 'update_paid';
    readonly isSimulation: boolean;
    readonly status: 'completed' | 'failed';
    readonly startedAt: string;
    readonly finishedAt: string;
    readonly summaryText: string;
    readonly errorMessage: string | null;
    readonly counters: Record<string, number>;
}

export interface SyncRunItemRecord {
    readonly id: number;
    readonly runId: number;
    readonly contractId: number;
    readonly holderName: string;
    readonly holderId: string;
    readonly externalDeudaId: string;
    readonly period: string;
    readonly amountCents: number;
    readonly outcome: string;
    readonly reason: string;
}

export interface PendingRunItem {
    readonly contractId: number;
    readonly holderName: string;
    readonly holderId: string;
    readonly externalDeudaId: string;
    readonly period: string;
    readonly amountCents: number;
    readonly outcome: ImportItemOutcome | PaymentCheckOutcome;
    readonly reason: string;
}