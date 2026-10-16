// Based on my known from hexagonal architecture, this import doesn't really belong here, it should come from my domain layer instead
// but for practicality, I'll just leave dates from its original location
import { addCivilDays, addMonths, currentPeriod } from '../../../shared/dates.ts';

export type DocLetter = 'V' | 'E' | 'J' | 'G' | 'P';
export type PersonType = 'natural' | 'juridico';

export interface NormalizedIdentification {
    readonly id: string;
    readonly letter: DocLetter | null;
    readonly digits: string;
    readonly personType: PersonType;
}

export interface SyncConfig {
    readonly companyName: string;
    readonly companyRif: string;
    readonly companyEmail: string;
    readonly apiUrl: string;
    readonly apiUser: string;
    readonly apiPassword: string;
    readonly allowedStatuses: readonly string[];
    readonly windowMonths: number | null;
    readonly maxRecentInstallments: number | null;
    readonly graceDays: number;
    readonly maxNewInvoices: number | null;
    readonly maxNewAmountCents: number | null;
    readonly excludedDocTypes: readonly DocLetter[];
    readonly autoRunEnabled: boolean;
    readonly autoRunTime: string;
}

export type ImportItemOutcome =
    | 'imported'
    | 'already_imported'
    | 'excluded_status'
    | 'excluded_currency'
    | 'excluded_doc_type'
    | 'excluded_window'
    | 'excluded_max_recent'
    | 'excluded_residual'
    | 'excluded_invalid_contract'
    | 'capped_invoice_count'
    | 'capped_amount';

export type PaymentCheckOutcome =
    | 'marked_paid'
    | 'partial_payment'
    | 'still_open'
    | 'exempt_not_paid'
    | 'no_evidence'
    | 'contradictory_ledger';

export const KNOWN_CONTRACT_STATUSES = [
    'ACTIVO',
    'CORTADO',
    'CORTESIA',
    'RETIRADO',
    'RECHAZADO',
    'ANULADO',
] as const;

const MONTH_NUMBER_BY_NAME: Record<string, string> = {
    enero: '01', febrero: '02', marzo: '03', abril: '04',
    mayo: '05', junio: '06', julio: '07', agosto: '08',
    septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
};

export function toCents(amount: number): number {
    return Math.round(amount * 100);
}

export function normalizeIdentification(raw: unknown): NormalizedIdentification | null {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim().toUpperCase();
    if (!trimmed) return null;

    const match = /^([VEJGP])?[-.\s]*([0-9][0-9-.\s]*)$/.exec(trimmed);
    if (!match) return null;

    const letter = (match[1] as DocLetter | undefined) ?? null;
    const rawDigits = match[2]!.replace(/[-.\s]/g, '');
    if (!/^\d+$/.test(rawDigits)) return null;

    const digits = rawDigits.replace(/^0+/, '');
    if (digits.length < 6 || digits.length > 12) return null;

    const personType: PersonType = letter === 'J' || letter === 'G' ? 'juridico' : 'natural';
    return { id: `${letter ?? ''}${digits}`, letter, digits, personType };
}

export function parseInstallmentSchedule(
    detalleDeuda: unknown,
    graceDays: number,
): { period: string; dueDate: string; cutoffDate: string } | null {
    if (!Array.isArray(detalleDeuda) || detalleDeuda.length !== 1 || typeof detalleDeuda[0] !== 'string') {
        return null;
    }
    const match = /\b(\d{4})\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s*$/.exec(detalleDeuda[0].trim());
    if (!match) return null;

    const year = match[1]!;
    const monthName = match[2]!.toLowerCase();
    const month = MONTH_NUMBER_BY_NAME[monthName];
    if (!month) return null;

    const period = `${year}-${month}`;
    const dueDate = `${period}-01`;
    const cutoffDate = addCivilDays(dueDate, Math.max(0, graceDays));
    return { period, dueDate, cutoffDate };
}

export interface RawContractInstallmentRow {
    readonly contrato_id: unknown;
    readonly codigo: unknown;
    readonly identificacion_contrato: unknown;
    readonly nombre_contrato: unknown;
    readonly telefono: unknown;
    readonly email: unknown;
    readonly direccion: unknown;
    readonly estado: unknown;
    readonly deuda: unknown;
    readonly deuda_id: unknown;
    readonly detalle_deuda: unknown;
    readonly precio_servicio: unknown;
    readonly nombre_plan: unknown;
    readonly moneda_sigla: unknown;
    readonly sigla_sucursal: unknown;
}

export interface ValidatedInstallmentCandidate {
    readonly deudaId: string;
    readonly amountCents: number;
    readonly period: string;
    readonly dueDate: string;
    readonly cutoffDate: string;
}

export interface ContractEvaluation {
    readonly valid: boolean;
    readonly errorReason?: string;
    readonly contractId: number;
    readonly contractCode: string;
    readonly status: string;
    readonly planName: string;
    readonly planPriceCents: number;
    readonly currency: string;
    readonly branchCode: string;
    readonly holder: {
        readonly identification: NormalizedIdentification;
        readonly rawIdentification: string;
        readonly name: string;
        readonly phone: string;
        readonly email: string;
        readonly address: string;
    } | null;
    readonly hasZeroDebtMarkerOnly: boolean;
    readonly incoherentCurrency: boolean;
    readonly residualInstallments: ReadonlyArray<{ deudaId: string; period: string }>;
    readonly installments: readonly ValidatedInstallmentCandidate[];
}

export function evaluateContractRows(
    expectedContractId: number,
    rows: readonly RawContractInstallmentRow[],
    graceDays: number,
): ContractEvaluation {
    const invalid = (reason: string): ContractEvaluation => ({
        valid: false,
        errorReason: reason,
        contractId: expectedContractId,
        contractCode: String(expectedContractId),
        status: 'status_unrecognized',
        planName: '', planPriceCents: 0, currency: '', branchCode: '',
        holder: null, hasZeroDebtMarkerOnly: false, incoherentCurrency: false,
        residualInstallments: [], installments: [],
    });

    if (rows.length === 0) return invalid('Respuesta vacía para el contrato');

    const first = rows[0]!;
    if (first.contrato_id !== expectedContractId) return invalid(`Fila pertenece a otro contrato (${String(first.contrato_id)})`);

    const status = typeof first.estado === 'string' ? first.estado.trim().toUpperCase() : '';
    if (!KNOWN_CONTRACT_STATUSES.includes(status as (typeof KNOWN_CONTRACT_STATUSES)[number])) {
        return invalid(`Estado de contrato desconocido: ${String(first.estado)}`);
    }

    const identification = normalizeIdentification(first.identificacion_contrato);
    if (!identification) return invalid(`Identificación de titular inválida: ${String(first.identificacion_contrato)}`);

    const planPrice = Number(first.precio_servicio);
    if (!Number.isFinite(planPrice) || planPrice <= 0) return invalid(`Precio del plan inválido: ${String(first.precio_servicio)}`);
    
    const planPriceCents = toCents(planPrice);
    const currency = typeof first.moneda_sigla === 'string' ? first.moneda_sigla.trim().toUpperCase() : '';
    const planName = typeof first.nombre_plan === 'string' && first.nombre_plan.trim() ? first.nombre_plan.trim() : '';
    if (!planName) return invalid('Nombre de plan vacío');

    const holderName = typeof first.nombre_contrato === 'string' ? first.nombre_contrato.trim() : '';
    if (!holderName) return invalid('Nombre del titular vacío');

    const holder = {
        identification,
        rawIdentification: String(first.identificacion_contrato ?? ''),
        name: holderName,
        phone: typeof first.telefono === 'string' ? first.telefono.trim() : '',
        email: typeof first.email === 'string' ? first.email.trim().toLowerCase() : '',
        address: typeof first.direccion === 'string' ? first.direccion.trim() : '',
    };

    const seenDeudaIds = new Set<string>();
    const seenPeriods = new Set<string>();
    const residualInstallments: Array<{ deudaId: string; period: string }> = [];
    const installments: ValidatedInstallmentCandidate[] = [];
    let incoherentCurrency = currency !== 'USD';

    for (const row of rows) {
        if (row.contrato_id !== expectedContractId) return invalid('Filas mezcladas de distintos contratos en la misma respuesta');
        if (row.identificacion_contrato !== first.identificacion_contrato || row.estado !== first.estado) {
            return invalid('Datos del contrato contradictorios entre filas');
        }

        const deudaId = typeof row.deuda_id === 'string' ? row.deuda_id.trim() : '';
        if (!deudaId) return invalid('Fila sin deuda_id');

        if (deudaId === '0') {
            if (rows.length > 1) return invalid('Fila sin deuda (deuda_id "0") mezclada con cuotas pendientes');
            return {
                valid: true, contractId: expectedContractId,
                contractCode: typeof first.codigo === 'string' ? first.codigo : String(expectedContractId),
                status, planName, planPriceCents, currency,
                branchCode: typeof first.sigla_sucursal === 'string' ? first.sigla_sucursal : '',
                holder, hasZeroDebtMarkerOnly: true, incoherentCurrency: false,
                residualInstallments: [], installments: [],
            };
        }

        if (seenDeudaIds.has(deudaId)) return invalid(`Cuota duplicada en la respuesta (deuda_id ${deudaId})`);
        seenDeudaIds.add(deudaId);

        const schedule = parseInstallmentSchedule(row.detalle_deuda, graceDays);
        if (!schedule) return invalid(`No se pudo interpretar detalle_deuda en cuota ${deudaId}`);
        if (seenPeriods.has(schedule.period)) return invalid(`Periodo duplicado (${schedule.period}) en el mismo contrato`);
        seenPeriods.add(schedule.period);

        const deudaNumber = typeof row.deuda === 'number' ? row.deuda : Number(row.deuda);
        if (!Number.isFinite(deudaNumber) || deudaNumber < 0) return invalid(`Monto de deuda inválido en cuota ${deudaId}`);

        const amountCents = toCents(deudaNumber);
        if (amountCents === 0) {
            residualInstallments.push({ deudaId, period: schedule.period });
            continue;
        }

        if (deudaNumber < planPrice * 0.01) incoherentCurrency = true;

        installments.push({
            deudaId, amountCents, period: schedule.period,
            dueDate: schedule.dueDate, cutoffDate: schedule.cutoffDate,
        });
    }

    installments.sort((a, b) => a.period.localeCompare(b.period) || a.deudaId.localeCompare(b.deudaId));

    return {
        valid: true, contractId: expectedContractId,
        contractCode: typeof first.codigo === 'string' ? first.codigo : String(expectedContractId),
        status, planName, planPriceCents, currency,
        branchCode: typeof first.sigla_sucursal === 'string' ? first.sigla_sucursal : '',
        holder, hasZeroDebtMarkerOnly: false, incoherentCurrency, residualInstallments, installments,
    };
}

export function minimumPeriodForWindow(windowMonths: number | null, basePeriod = currentPeriod()): string | null {
    if (!windowMonths || windowMonths <= 0) return null;
    return addMonths(basePeriod, -windowMonths);
}

export interface LedgerRow {
    readonly id_factura: unknown;
    readonly num_factura: unknown;
    readonly fecha_emision: unknown;
    readonly id_contrato: unknown;
    readonly fact_cod_contr?: unknown;
    readonly detalle_pago?: {
        readonly id_contrato?: unknown;
        readonly id_cuota?: unknown;
        readonly periodo_cuota?: unknown;
        readonly tarifa?: unknown;
        readonly valor_pago?: unknown;
        readonly saldo_cuota?: unknown;
        readonly descuento?: unknown;
    };
}

export interface LedgerEvaluation {
    readonly outcome: PaymentCheckOutcome;
    readonly reason: string;
    readonly ispBalanceCents: number | null;
    readonly ispPaidCents: number | null;
    readonly ispInvoiceNumber: string | null;
    readonly ispPaymentDate: string | null;
}

export function evaluateInvoicePaymentStatus(input: {
    readonly contractId: number;
    readonly externalDeudaId: string;
    readonly cobrixBalanceCents: number;
    readonly ledgerRows: readonly LedgerRow[];
    readonly currentContractPendingRows?: readonly RawContractInstallmentRow[];
}): LedgerEvaluation {
    const matchingRows = input.ledgerRows.filter(
        row => String(row.detalle_pago?.id_cuota ?? '') === input.externalDeudaId,
    );

    if (matchingRows.length > 0) {
        const first = matchingRows[0]!.detalle_pago!;
        const saldoNumber = Number(first.saldo_cuota);
        const pagoNumber = Number(first.valor_pago);
        const tarifaNumber = Number(first.tarifa);
        const descuentoNumber = Number(first.descuento ?? 0);

        if (!Number.isFinite(saldoNumber) || !Number.isFinite(pagoNumber) || !Number.isFinite(tarifaNumber)) {
            return {
                outcome: 'contradictory_ledger', reason: 'Valores numéricos inválidos en el libro de pagos',
                ispBalanceCents: null, ispPaidCents: null, ispInvoiceNumber: null, ispPaymentDate: null,
            };
        }

        const expectedSaldoCents = toCents(saldoNumber);
        const expectedPagoCents = toCents(pagoNumber);
        const expectedTarifaCents = toCents(tarifaNumber);
        const expectedDescuentoCents = toCents(descuentoNumber);

        for (const row of matchingRows) {
            const dp = row.detalle_pago;
            const rowContractId = Number(dp?.id_contrato ?? row.id_contrato ?? row.fact_cod_contr);
            if (
                rowContractId !== input.contractId ||
                toCents(Number(dp?.saldo_cuota)) !== expectedSaldoCents ||
                toCents(Number(dp?.valor_pago)) !== expectedPagoCents ||
                toCents(Number(dp?.tarifa)) !== expectedTarifaCents ||
                toCents(Number(dp?.descuento ?? 0)) !== expectedDescuentoCents
            ) {
                return {
                    outcome: 'contradictory_ledger', reason: 'Filas del libro de cuotas se contradicen entre sí',
                    ispBalanceCents: null, ispPaidCents: null, ispInvoiceNumber: null, ispPaymentDate: null,
                };
            }
        }

        const validInvoices = matchingRows
            .filter(r => Number(r.id_factura) > 0 && typeof r.num_factura === 'string' && r.num_factura.trim() !== '')
            .sort((a, b) => Number(b.id_factura) - Number(a.id_factura));
        const latestInvoice = validInvoices[0];

        if (expectedSaldoCents === 0 && expectedPagoCents > 0) {
            return {
                outcome: 'marked_paid',
                reason: latestInvoice ? `Pagada con factura ISP ${String(latestInvoice.num_factura)}` : 'Saldo 0 con pago registrado en el ISP',
                ispBalanceCents: 0, ispPaidCents: expectedPagoCents,
                ispInvoiceNumber: latestInvoice ? String(latestInvoice.num_factura) : null,
                ispPaymentDate: latestInvoice && typeof latestInvoice.fecha_emision === 'string' ? latestInvoice.fecha_emision : null,
            };
        }

        if (expectedSaldoCents === 0 && expectedPagoCents === 0) {
            return {
                outcome: 'exempt_not_paid', reason: 'Cuota exonerada en el ISP (saldo 0 sin monto pagado); no constituye pago',
                ispBalanceCents: 0, ispPaidCents: 0, ispInvoiceNumber: null, ispPaymentDate: null,
            };
        }

        if (expectedSaldoCents > 0 && expectedSaldoCents < input.cobrixBalanceCents) {
            return {
                outcome: 'partial_payment', reason: `Abono parcial en el ISP: saldo bajó a USD ${(expectedSaldoCents / 100).toFixed(2)}`,
                ispBalanceCents: expectedSaldoCents, ispPaidCents: expectedPagoCents,
                ispInvoiceNumber: latestInvoice ? String(latestInvoice.num_factura) : null,
                ispPaymentDate: latestInvoice && typeof latestInvoice.fecha_emision === 'string' ? latestInvoice.fecha_emision : null,
            };
        }

        return {
            outcome: 'still_open', reason: 'Sin cambios: mantiene su saldo pendiente en el ISP',
            ispBalanceCents: expectedSaldoCents, ispPaidCents: expectedPagoCents,
            ispInvoiceNumber: null, ispPaymentDate: null,
        };
    }

    const pendingRow = (input.currentContractPendingRows ?? []).find(r => String(r.deuda_id ?? '') === input.externalDeudaId);
    if (pendingRow) {
        const pendingCents = toCents(Number(pendingRow.deuda));
        if (pendingCents > 0 && pendingCents < input.cobrixBalanceCents) {
            return {
                outcome: 'partial_payment', reason: `Abono parcial en contrato: saldo bajó a USD ${(pendingCents / 100).toFixed(2)}`,
                ispBalanceCents: pendingCents, ispPaidCents: input.cobrixBalanceCents - pendingCents,
                ispInvoiceNumber: null, ispPaymentDate: null,
            };
        }
        if (pendingCents >= input.cobrixBalanceCents) {
            return {
                outcome: 'still_open', reason: 'Pendiente en el contrato sin cobros aplicados',
                ispBalanceCents: pendingCents, ispPaidCents: 0, ispInvoiceNumber: null, ispPaymentDate: null,
            };
        }
    }

    return {
        outcome: 'no_evidence', reason: 'Sin evidencia en el libro de pagos ni en cuotas pendientes del contrato',
        ispBalanceCents: null, ispPaidCents: null, ispInvoiceNumber: null, ispPaymentDate: null,
    };
}