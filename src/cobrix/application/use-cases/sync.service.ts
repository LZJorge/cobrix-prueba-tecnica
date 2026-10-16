import { Injectable, Inject } from '@nestjs/common';
import { today } from '../../../shared/dates.ts';
import {
    evaluateContractRows,
    evaluateInvoicePaymentStatus,
    minimumPeriodForWindow,
    type RawContractInstallmentRow,
    type LedgerRow,
} from '../../domain/entities/domain.ts';
import type { SyncRunRecord, PendingRunItem } from '../../domain/interfaces/store.interfaces.ts';

export interface ConnectionTestResult {
    readonly ok: boolean;
    readonly contractsCount: number;
    readonly message: string;
}

@Injectable()
export class SyncService {
    constructor(
        @Inject('ICobrixStore') private readonly store: any, 
        @Inject('IIspApiClient') private readonly client: any,
    ) {}

    async testConnection(override?: { apiUrl?: string; apiUser?: string; apiPassword?: string }): Promise<ConnectionTestResult> {
        const cfg = this.store.getConfig();
        
        this.client.configure({
            baseUrl: override?.apiUrl ?? cfg.apiUrl,
            user: override?.apiUser ?? cfg.apiUser,
            password: override?.apiPassword && override.apiPassword.trim() !== ''
                ? override.apiPassword
                : cfg.apiPassword,
        });

        try {
            await this.client.login();
            const ids = await this.client.listContractIds();
            return {
                ok: true,
                contractsCount: ids.length,
                message: `Conexión exitosa. El proveedor reporta ${ids.length} contratos.`,
            };
        } catch (error) {
            return {
                ok: false,
                contractsCount: 0,
                message: error instanceof Error ? error.message : String(error),
            };
        }
    }

    async runImport(options: { dryRun?: boolean } = {}): Promise<SyncRunRecord> {
        const dryRun = options.dryRun === true;
        const startedAt = new Date().toISOString();
        const cfg = this.store.getConfig();
        
        this.client.configure({ baseUrl: cfg.apiUrl, user: cfg.apiUser, password: cfg.apiPassword });

        const items: PendingRunItem[] = [];
        const counters = {
            contractsScanned: 0, newCustomers: 0, importedInvoices: 0, importedAmountCents: 0,
            alreadyImported: 0, excludedStatus: 0, excludedCurrency: 0, excludedDocType: 0,
            excludedWindow: 0, excludedMaxRecent: 0, excludedResidual: 0, excludedInvalidContract: 0,
            cappedInvoices: 0,
        };

        // Memory accumulation for Unit of Work transaction
        const pendingContracts: Array<{ holder: any; evaluation: any; isNewCustomer: boolean }> = [];
        const pendingInvoices: Array<{ cobrixNumber: string; customerId: string; contractId: number; inst: any }> = [];

        try {
            const contractIds = await this.client.listContractIds();
            const minPeriod = minimumPeriodForWindow(cfg.windowMonths);

            const existingInvoiceIds = new Set<string>(this.store.getAllInvoiceExternalIds());
            const existingCustomerIds = new Set<string>(this.store.getAllCustomerIds());
            const simulatedNewCustomers = new Set<string>();

            let nextInvoiceSeq = this.store.getNextInvoiceSequenceId();

            for (const contractId of contractIds) {
                counters.contractsScanned++;
                const rawRows = await this.client.getContractInstallments(contractId);
                const evaluation = evaluateContractRows(contractId, rawRows, cfg.graceDays);

                if (!evaluation.valid || !evaluation.holder) {
                    counters.excludedInvalidContract++;
                    items.push({
                        contractId, holderName: evaluation.holder?.name ?? 'Desconocido',
                        holderId: evaluation.holder?.identification.id ?? '—', externalDeudaId: '—',
                        period: '—', amountCents: 0, outcome: 'excluded_invalid_contract',
                        reason: evaluation.errorReason ?? 'Contrato inválido o respuesta inconsistente',
                    });
                    continue;
                }

                if (evaluation.hasZeroDebtMarkerOnly) continue;

                const holder = evaluation.holder;
                const statusAllowed = cfg.allowedStatuses.includes(evaluation.status);

                if (!statusAllowed) {
                    for (const inst of evaluation.installments) {
                        counters.excludedStatus++;
                        items.push({
                            contractId, holderName: holder.name, holderId: holder.identification.id,
                            externalDeudaId: inst.deudaId, period: inst.period, amountCents: inst.amountCents,
                            outcome: 'excluded_status', reason: `Estado de contrato no importable (${evaluation.status})`,
                        });
                    }
                    continue;
                }

                if (evaluation.incoherentCurrency) {
                    counters.excludedCurrency++;
                    for (const inst of evaluation.installments) {
                        items.push({
                            contractId, holderName: holder.name, holderId: holder.identification.id,
                            externalDeudaId: inst.deudaId, period: inst.period, amountCents: inst.amountCents,
                            outcome: 'excluded_currency', reason: 'Moneda incoherente (cuota menor al 1 % del precio del plan en USD)',
                        });
                    }
                    continue;
                }

                if (holder.identification.letter && cfg.excludedDocTypes.includes(holder.identification.letter)) {
                    for (const inst of evaluation.installments) {
                        counters.excludedDocType++;
                        items.push({
                            contractId, holderName: holder.name, holderId: holder.identification.id,
                            externalDeudaId: inst.deudaId, period: inst.period, amountCents: inst.amountCents,
                            outcome: 'excluded_doc_type', reason: `Tipo de documento excluido (${holder.identification.letter})`,
                        });
                    }
                    continue;
                }

                for (const res of evaluation.residualInstallments) {
                    counters.excludedResidual++;
                    items.push({
                        contractId, holderName: holder.name, holderId: holder.identification.id,
                        externalDeudaId: res.deudaId, period: res.period, amountCents: 0,
                        outcome: 'excluded_residual', reason: 'Saldo residual menor a un centavo (deuda 0)',
                    });
                }

                const inWindow = evaluation.installments.filter(inst => {
                    if (minPeriod && inst.period < minPeriod) {
                        counters.excludedWindow++;
                        items.push({
                            contractId, holderName: holder.name, holderId: holder.identification.id,
                            externalDeudaId: inst.deudaId, period: inst.period, amountCents: inst.amountCents,
                            outcome: 'excluded_window', reason: `Fuera de la ventana de importación (anterior a ${minPeriod})`,
                        });
                        return false;
                    }
                    return true;
                });

                const maxRecent = cfg.maxRecentInstallments;
                const recentCutIndex = maxRecent && maxRecent > 0 && inWindow.length > maxRecent ? inWindow.length - maxRecent : 0;

                const candidatesAfterRecent = inWindow.filter((inst, idx) => {
                    if (idx < recentCutIndex) {
                        counters.excludedMaxRecent++;
                        items.push({
                            contractId, holderName: holder.name, holderId: holder.identification.id,
                            externalDeudaId: inst.deudaId, period: inst.period, amountCents: inst.amountCents,
                            outcome: 'excluded_max_recent', reason: `Excede el máximo de ${maxRecent} cuotas más recientes del contrato`,
                        });
                        return false;
                    }
                    return true;
                });

                let contractPersisted = false;
                const ensureCustomerAndContract = (): void => {
                    if (contractPersisted) return;
                    const customerId = holder.identification.id;
                    const isNewCustomer = !existingCustomerIds.has(customerId) && !simulatedNewCustomers.has(customerId);

                    if (isNewCustomer) {
                        counters.newCustomers++;
                        simulatedNewCustomers.add(customerId);
                    }

                    if (!dryRun) {
                        // Queue mutation instead of immediate write
                        pendingContracts.push({ holder, evaluation, isNewCustomer });
                        existingCustomerIds.add(customerId);
                    }
                    contractPersisted = true;
                };

                for (const inst of candidatesAfterRecent) {
                    if (existingInvoiceIds.has(inst.deudaId)) {
                        ensureCustomerAndContract();
                        counters.alreadyImported++;
                        items.push({
                            contractId, holderName: holder.name, holderId: holder.identification.id,
                            externalDeudaId: inst.deudaId, period: inst.period, amountCents: inst.amountCents,
                            outcome: 'already_imported', reason: 'Ya importada previamente en Cobrix',
                        });
                        continue;
                    }

                    if (cfg.maxNewInvoices !== null && counters.importedInvoices + 1 > cfg.maxNewInvoices) {
                        counters.cappedInvoices++;
                        items.push({
                            contractId, holderName: holder.name, holderId: holder.identification.id,
                            externalDeudaId: inst.deudaId, period: inst.period, amountCents: inst.amountCents,
                            outcome: 'capped_invoice_count', reason: `Frenada por tope de facturas nuevas por corrida (${cfg.maxNewInvoices})`,
                        });
                        continue;
                    }

                    if (cfg.maxNewAmountCents !== null && counters.importedAmountCents + inst.amountCents > cfg.maxNewAmountCents) {
                        counters.cappedInvoices++;
                        items.push({
                            contractId, holderName: holder.name, holderId: holder.identification.id,
                            externalDeudaId: inst.deudaId, period: inst.period, amountCents: inst.amountCents,
                            outcome: 'capped_amount', reason: `Frenada por tope de monto nuevo por corrida (USD ${(cfg.maxNewAmountCents / 100).toFixed(2)})`,
                        });
                        continue;
                    }

                    ensureCustomerAndContract();
                    counters.importedInvoices++;
                    counters.importedAmountCents += inst.amountCents;
                    existingInvoiceIds.add(inst.deudaId);

                    const cobrixNumber = `CBX-${String(nextInvoiceSeq++).padStart(5, '0')}`;
                    if (!dryRun) {
                        pendingInvoices.push({ cobrixNumber, customerId: holder.identification.id, contractId: evaluation.contractId, inst });
                    }

                    items.push({
                        contractId, holderName: holder.name, holderId: holder.identification.id,
                        externalDeudaId: inst.deudaId, period: inst.period, amountCents: inst.amountCents,
                        outcome: 'imported', reason: dryRun ? 'Se importaría como factura abierta' : `Importada como factura ${cobrixNumber}`,
                    });
                }
            }

            const verb = dryRun ? 'Se importarían' : 'Importadas';
            const summaryText = `${verb} ${counters.importedInvoices} cuotas (${counters.newCustomers} clientes nuevos) por USD ${(counters.importedAmountCents / 100).toFixed(2)}`;
            
            if (!dryRun) {
                this.store.commitImportMutations(pendingContracts, pendingInvoices);
            }

            return this.store.saveSyncRun('import', dryRun, 'completed', startedAt, summaryText, null, counters, items);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return this.store.saveSyncRun('import', dryRun, 'failed', startedAt, `Falló la corrida de importación: ${msg}`, msg, counters, items);
        }
    }

    async runUpdatePaid(options: { dryRun?: boolean } = {}): Promise<SyncRunRecord> {
        const dryRun = options.dryRun === true;
        const startedAt = new Date().toISOString();
        
        const cfg = this.store.getConfig();
        this.client.configure({ baseUrl: cfg.apiUrl, user: cfg.apiUser, password: cfg.apiPassword });

        const items: PendingRunItem[] = [];
        const counters = {
            openInvoicesChecked: 0, markedPaid: 0, paidAmountCents: 0,
            partialPayments: 0, stillOpen: 0, exemptNotPaid: 0,
            noEvidence: 0, contradictoryLedger: 0,
        };

        const pendingPayments: Array<{ id: number; customerId: string; cobrixNumber: string; externalDeudaId: string; paidDate: string; ispInvoiceNumber: string | null }> = [];

        try {
            const openInvoices = this.store.getOpenInvoices();
            const byContract = new Map<number, any[]>();
            
            for (const inv of openInvoices) {
                const contractId = Number(inv.contract_id);
                const group = byContract.get(contractId) ?? [];
                group.push(inv);
                byContract.set(contractId, group);
            }

            for (const [contractId, contractInvoices] of byContract.entries()) {
                const ledgerRows = (await this.client.getContractPaymentLedger(contractId)) as LedgerRow[];
                let fallbackPendingRows: RawContractInstallmentRow[] | undefined;

                for (const inv of contractInvoices) {
                    counters.openInvoicesChecked++;
                    const externalDeudaId = String(inv.external_deuda_id);
                    const cobrixBalanceCents = Number(inv.balance_cents);
                    const holderId = String(inv.customer_id);
                    const holderName = String(inv.holder_name);
                    const period = String(inv.period);

                    const presentInLedger = ledgerRows.some(r => String(r.detalle_pago?.id_cuota ?? '') === externalDeudaId);
                    if (!presentInLedger && fallbackPendingRows === undefined) {
                        fallbackPendingRows = await this.client.getContractInstallments(contractId);
                    }

                    const evalResult = evaluateInvoicePaymentStatus({
                        contractId, externalDeudaId, cobrixBalanceCents, ledgerRows,
                        currentContractPendingRows: fallbackPendingRows,
                    });

                    if (evalResult.outcome === 'marked_paid') {
                        counters.markedPaid++;
                        counters.paidAmountCents += cobrixBalanceCents;

                        if (!dryRun) {
                            const paidDate = evalResult.ispPaymentDate ?? today();

                            pendingPayments.push({
                                id: Number(inv.id),
                                customerId: holderId,
                                cobrixNumber: String(inv.cobrix_number),
                                externalDeudaId,
                                paidDate,
                                ispInvoiceNumber: evalResult.ispInvoiceNumber,
                            });
                        }
                    } else if (evalResult.outcome === 'partial_payment') counters.partialPayments++;
                    else if (evalResult.outcome === 'still_open') counters.stillOpen++;
                    else if (evalResult.outcome === 'exempt_not_paid') counters.exemptNotPaid++;
                    else if (evalResult.outcome === 'no_evidence') counters.noEvidence++;
                    else counters.contradictoryLedger++;

                    items.push({
                        contractId, holderName, holderId, externalDeudaId, period,
                        amountCents: cobrixBalanceCents, outcome: evalResult.outcome, reason: evalResult.reason,
                    });
                }
            }

            const verb = dryRun ? 'Se marcarían pagadas' : 'Marcadas pagadas';
            const summaryText = `${verb} ${counters.markedPaid} facturas por USD ${(counters.paidAmountCents / 100).toFixed(2)} (${counters.partialPayments} abonos parciales, ${counters.stillOpen} siguen abiertas)`;
            
            if (!dryRun) {
                this.store.commitPaymentMutations(pendingPayments);
            }

            return this.store.saveSyncRun('update_paid', dryRun, 'completed', startedAt, summaryText, null, counters, items);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return this.store.saveSyncRun('update_paid', dryRun, 'failed', startedAt, `Falló la actualización de pagadas: ${msg}`, msg, counters, items);
        }
    }
}