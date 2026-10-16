import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    normalizeIdentification,
    parseInstallmentSchedule,
    evaluateContractRows,
    evaluateInvoicePaymentStatus,
    minimumPeriodForWindow,
    type RawContractInstallmentRow,
    type LedgerRow,
} from './domain.ts';

describe('Domain: Clientes', () => {
    it('Normalizes standard identifications and infers person types', () => {
        assert.deepEqual(normalizeIdentification('V-12345678'), {
            id: 'V12345678', letter: 'V', digits: '12345678', personType: 'natural',
        });
        
        assert.deepEqual(normalizeIdentification('09000123'), {
            id: '9000123', letter: null, digits: '9000123', personType: 'natural',
        });

        assert.deepEqual(normalizeIdentification(' J - 50012345 . 0 '), {
            id: 'J500123450', letter: 'J', digits: '500123450', personType: 'juridico',
        });

        assert.deepEqual(normalizeIdentification('G-123456'), {
            id: 'G123456', letter: 'G', digits: '123456', personType: 'juridico',
        });
    });

    it('Rejects invalid identifications', () => {
        assert.equal(normalizeIdentification('V-123'), null);
        assert.equal(normalizeIdentification('ABC-12345678'), null);
        assert.equal(normalizeIdentification(''), null);
    });
});

describe('Domain: Facturas', () => {
    it('Parses installment schedule correctly', () => {
        const schedule = parseInstallmentSchedule(['PLAN - 2026 Agosto'], 5);
        assert.ok(schedule);
        assert.equal(schedule.period, '2026-08');
        assert.equal(schedule.dueDate, '2026-08-01');
        assert.equal(schedule.cutoffDate, '2026-08-06');
    });

    it('Evaluates a valid contract with installments', () => {
        const rows: RawContractInstallmentRow[] = [{
            contrato_id: 100, codigo: 'C-100', identificacion_contrato: 'V-12345678',
            nombre_contrato: 'Juan', telefono: '', email: '', direccion: '',
            estado: 'ACTIVO', deuda: 20.50, deuda_id: 'd1', detalle_deuda: ['PLAN - 2026 Agosto'],
            precio_servicio: 20.50, nombre_plan: 'Basic', moneda_sigla: 'USD', sigla_sucursal: 'M',
        }];

        const evalResult = evaluateContractRows(100, rows, 0);
        assert.equal(evalResult.valid, true);
        assert.equal(evalResult.holder?.identification.id, 'V12345678');
        assert.equal(evalResult.installments.length, 1);
        assert.equal(evalResult.installments[0]?.amountCents, 2050);
    });

    it('Excludes zero-debt marker and residual balances', () => {
        const zeroDebtRows: RawContractInstallmentRow[] = [{
            contrato_id: 100, codigo: 'C-100', identificacion_contrato: 'V-12345678',
            nombre_contrato: 'Juan', telefono: '', email: '', direccion: '',
            estado: 'ACTIVO', deuda: 0, deuda_id: '0', detalle_deuda: [],
            precio_servicio: 20, nombre_plan: 'Basic', moneda_sigla: 'USD', sigla_sucursal: 'M',
        }];
        const zeroDebtEval = evaluateContractRows(100, zeroDebtRows, 0);
        assert.equal(zeroDebtEval.valid, true);
        assert.equal(zeroDebtEval.hasZeroDebtMarkerOnly, true);

        const residualRows: RawContractInstallmentRow[] = [{
            contrato_id: 100, codigo: 'C-100', identificacion_contrato: 'V-12345678',
            nombre_contrato: 'Juan', telefono: '', email: '', direccion: '',
            estado: 'ACTIVO', deuda: 0.001, deuda_id: 'd1', detalle_deuda: ['PLAN - 2026 Agosto'],
            precio_servicio: 20, nombre_plan: 'Basic', moneda_sigla: 'USD', sigla_sucursal: 'M',
        }];
        const residualEval = evaluateContractRows(100, residualRows, 0);
        assert.equal(residualEval.valid, true);
        assert.equal(residualEval.installments.length, 0);
        assert.equal(residualEval.residualInstallments.length, 1);
    });

    it('Detects incoherent currency', () => {
        const rows: RawContractInstallmentRow[] = [{
            contrato_id: 100, codigo: 'C-100', identificacion_contrato: 'V-12345678',
            nombre_contrato: 'Juan', telefono: '', email: '', direccion: '',
            estado: 'ACTIVO', deuda: 0.15, deuda_id: 'd1', detalle_deuda: ['PLAN - 2026 Agosto'],
            precio_servicio: 20, nombre_plan: 'Basic', moneda_sigla: 'USD', sigla_sucursal: 'M',
        }];
        const evalResult = evaluateContractRows(100, rows, 0);
        assert.equal(evalResult.valid, true);
        assert.equal(evalResult.incoherentCurrency, true);
    });

    it('Rejects contradictory or invalid rows completely', () => {
        const rows: RawContractInstallmentRow[] = [{
            contrato_id: 100, codigo: 'C-100', identificacion_contrato: 'V-12345678',
            nombre_contrato: 'Juan', telefono: '', email: '', direccion: '',
            estado: 'ESTADO_INVENTADO', deuda: 20, deuda_id: 'd1', detalle_deuda: ['PLAN - 2026 Agosto'],
            precio_servicio: 20, nombre_plan: 'Basic', moneda_sigla: 'USD', sigla_sucursal: 'M',
        }];
        const evalResult = evaluateContractRows(100, rows, 0);
        assert.equal(evalResult.valid, false);
        assert.match(evalResult.errorReason!, /desconocido/i);
    });

    it('Rejects rows that contradict each other within the same contract', () => {
        const rows: RawContractInstallmentRow[] = [
            {
                contrato_id: 100, codigo: 'C-100', identificacion_contrato: 'V-12345678',
                nombre_contrato: 'Juan', telefono: '', email: '', direccion: '',
                estado: 'ACTIVO', deuda: 20, deuda_id: 'd1', detalle_deuda: ['PLAN - 2026 Agosto'],
                precio_servicio: 20, nombre_plan: 'Basic', moneda_sigla: 'USD', sigla_sucursal: 'M',
            },
            {
                contrato_id: 100, codigo: 'C-100', identificacion_contrato: 'V-12345678',
                nombre_contrato: 'Juan', telefono: '', email: '', direccion: '',
                estado: 'CORTADO',
                deuda: 20, deuda_id: 'd2', detalle_deuda: ['PLAN - 2026 Septiembre'],
                precio_servicio: 20, nombre_plan: 'Basic', moneda_sigla: 'USD', sigla_sucursal: 'M',
            }
        ];
        const evalResult = evaluateContractRows(100, rows, 0);
        assert.equal(evalResult.valid, false);
        assert.match(evalResult.errorReason!, /contradictorios/i);
    });

    it('Rejects duplicate installments (same deuda_id)', () => {
        const rows: RawContractInstallmentRow[] = [
            {
                contrato_id: 100, codigo: 'C-100', identificacion_contrato: 'V-12345678',
                nombre_contrato: 'Juan', telefono: '', email: '', direccion: '',
                estado: 'ACTIVO', deuda: 20, deuda_id: 'd1', detalle_deuda: ['PLAN - 2026 Agosto'],
                precio_servicio: 20, nombre_plan: 'Basic', moneda_sigla: 'USD', sigla_sucursal: 'M',
            },
            {
                contrato_id: 100, codigo: 'C-100', identificacion_contrato: 'V-12345678',
                nombre_contrato: 'Juan', telefono: '', email: '', direccion: '',
                estado: 'ACTIVO', deuda: 20, deuda_id: 'd1',
                detalle_deuda: ['PLAN - 2026 Agosto'],
                precio_servicio: 20, nombre_plan: 'Basic', moneda_sigla: 'USD', sigla_sucursal: 'M',
            }
        ];
        const evalResult = evaluateContractRows(100, rows, 0);
        assert.equal(evalResult.valid, false);
        assert.match(evalResult.errorReason!, /duplicada/i);
    });
});

describe('Domain: Pagos', () => {
    it('Marks paid when balance is 0 and paid amount > 0', () => {
        const ledgerRows: LedgerRow[] = [{
            id_factura: 1, num_factura: 'F-001', fecha_emision: '2026-10-10', id_contrato: 100,
            detalle_pago: { id_contrato: 100, id_cuota: 'd1', saldo_cuota: 0, valor_pago: 20, tarifa: 20, descuento: 0 },
        }];
        const result = evaluateInvoicePaymentStatus({
            contractId: 100, externalDeudaId: 'd1', cobrixBalanceCents: 2000, ledgerRows,
        });
        assert.equal(result.outcome, 'marked_paid');
        assert.equal(result.ispPaidCents, 2000);
        assert.equal(result.ispInvoiceNumber, 'F-001');
    });

    it('Detects partial payments', () => {
        const ledgerRows: LedgerRow[] = [{
            id_factura: 1, num_factura: 'F-001', fecha_emision: '2026-10-10', id_contrato: 100,
            detalle_pago: { id_contrato: 100, id_cuota: 'd1', saldo_cuota: 10, valor_pago: 10, tarifa: 20, descuento: 0 },
        }];
        const result = evaluateInvoicePaymentStatus({
            contractId: 100, externalDeudaId: 'd1', cobrixBalanceCents: 2000, ledgerRows,
        });
        assert.equal(result.outcome, 'partial_payment');
        assert.equal(result.ispBalanceCents, 1000);
    });

    it('Detects exempt quotas (saldo 0, valor_pago 0)', () => {
        const ledgerRows: LedgerRow[] = [{
            id_factura: 1, num_factura: 'F-001', fecha_emision: '2026-10-10', id_contrato: 100,
            detalle_pago: { id_contrato: 100, id_cuota: 'd1', saldo_cuota: 0, valor_pago: 0, tarifa: 20, descuento: 0 },
        }];
        const result = evaluateInvoicePaymentStatus({
            contractId: 100, externalDeudaId: 'd1', cobrixBalanceCents: 2000, ledgerRows,
        });
        assert.equal(result.outcome, 'exempt_not_paid');
    });

    it('Falls back to pending rows for no_evidence', () => {
        const result = evaluateInvoicePaymentStatus({
            contractId: 100, externalDeudaId: 'd1', cobrixBalanceCents: 2000, ledgerRows: [],
            currentContractPendingRows: [{
                contrato_id: 100, codigo: '', identificacion_contrato: '', nombre_contrato: '',
                telefono: '', email: '', direccion: '', estado: '', deuda: 20, deuda_id: 'd1',
                detalle_deuda: [], precio_servicio: 20, nombre_plan: '', moneda_sigla: '', sigla_sucursal: '',
            }],
        });
        assert.equal(result.outcome, 'still_open');
    });

    it('Detects contradictory ledger rows for the same installment', () => {
        const ledgerRows: LedgerRow[] = [
            {
                id_factura: 1, num_factura: 'F-001', fecha_emision: '2026-10-10', id_contrato: 100,
                detalle_pago: { id_contrato: 100, id_cuota: 'd1', saldo_cuota: 0, valor_pago: 20, tarifa: 20, descuento: 0 },
            },
            {
                id_factura: 2, num_factura: 'F-002', fecha_emision: '2026-10-11', id_contrato: 100,
                detalle_pago: { id_contrato: 100, id_cuota: 'd1', saldo_cuota: 10, valor_pago: 10, tarifa: 20, descuento: 0 },
            }
        ];
        const result = evaluateInvoicePaymentStatus({
            contractId: 100, externalDeudaId: 'd1', cobrixBalanceCents: 2000, ledgerRows,
        });
        assert.equal(result.outcome, 'contradictory_ledger');
    });

    it('Rejects ledger rows with invalid numeric values', () => {
        const ledgerRows: LedgerRow[] = [{
            id_factura: 1, num_factura: 'F-001', fecha_emision: '2026-10-10', id_contrato: 100,
            detalle_pago: { id_contrato: 100, id_cuota: 'd1', saldo_cuota: 'NaN', valor_pago: 20, tarifa: 20, descuento: 0 },
        }];
        const result = evaluateInvoicePaymentStatus({
            contractId: 100, externalDeudaId: 'd1', cobrixBalanceCents: 2000, ledgerRows,
        });
        assert.equal(result.outcome, 'contradictory_ledger');
        assert.match(result.reason, /numéricos inválidos/i);
    });
});

describe('Domain: Utilidades', () => {
    it('Calculates minimum period for import windows', () => {
        assert.equal(minimumPeriodForWindow(null), null);
        assert.equal(minimumPeriodForWindow(0), null);
        
        const min3Months = minimumPeriodForWindow(3, '2026-10');
        assert.equal(min3Months, '2026-07');

        const min12Months = minimumPeriodForWindow(12, '2026-10');
        assert.equal(min12Months, '2025-10');
    });
});