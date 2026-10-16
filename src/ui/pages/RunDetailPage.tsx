import { ArrowLeft } from 'iconoir-react'
import { useEffect, useState } from 'react'

import { api, formatDate, formatDateTime, formatUsd, type SyncRunItemRecord, type SyncRunRecord } from '../api.ts'
import { Badge, Button, Card, CardHeader, DataTable, EmptyState, MetricTile, OUTCOME_META, OutcomeBadge } from '../components/ui.tsx'

const COUNTER_LABELS: Record<string, string> = {
    contractsScanned: 'Contratos revisados',
    newCustomers: 'Clientes nuevos',
    importedInvoices: 'Facturas importadas',
    importedAmountCents: 'Monto importado',
    alreadyImported: 'Ya importadas',
    excludedStatus: 'Excluidas por estado',
    excludedCurrency: 'Moneda incoherente',
    excludedDocType: 'Excluidas por documento',
    excludedWindow: 'Fuera de ventana',
    excludedMaxRecent: 'Excluidas máx. recientes',
    excludedResidual: 'Saldos residuales',
    excludedInvalidContract: 'Contratos inválidos',
    cappedInvoices: 'Frenadas por tope',
    openInvoicesChecked: 'Facturas revisadas',
    markedPaid: 'Marcadas pagadas',
    paidAmountCents: 'Monto conciliado',
    partialPayments: 'Abonos parciales',
    stillOpen: 'Siguen abiertas',
    exemptNotPaid: 'Exoneradas',
    noEvidence: 'Sin evidencia',
    contradictoryLedger: 'Libro contradictorio',
}

export function RunDetailPage({
    runId,
    navigate,
}: {
    readonly runId: number
    readonly navigate: (to: string) => void
}) {
    const [data, setData] = useState<{ run: SyncRunRecord; items: SyncRunItemRecord[] } | null>(null)
    const [outcomeFilter, setOutcomeFilter] = useState<string>('')
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        setLoading(true)
        api.getRunDetail(runId)
            .then(setData)
            .catch(() => setData(null))
            .finally(() => setLoading(false))
    }, [runId])

    if (loading) {
        return <div className="text-sm text-muted py-12">Cargando corrida…</div>
    }

    if (!data) {
        return (
            <EmptyState
                title="Corrida no encontrada"
                description={`No existe el registro #${runId}.`}
                action={<Button onClick={() => navigate('/sincronizacion')}>Volver a Sincronización</Button>}
            />
        )
    }

    const { run, items } = data
    const filteredItems = outcomeFilter ? items.filter(i => i.outcome === outcomeFilter) : items

    const countsByOutcome = new Map<string, number>()
    for (const item of items) {
        countsByOutcome.set(item.outcome, (countsByOutcome.get(item.outcome) ?? 0) + 1)
    }

    return (
        <div className="flex flex-col gap-6">
            <div>
                <Button size="sm" variant="ghost" onClick={() => navigate('/sincronizacion')} className="mb-2 -ml-2">
                    <ArrowLeft className="w-4 h-4" /> Sincronización
                </Button>
                <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="text-xl font-bold text-fg">
                        Corrida #{run.id} · {run.runType === 'import' ? 'Importación' : 'Actualización de pagadas'}
                    </h1>
                    {run.isSimulation ? <Badge tone="info">Simulación</Badge> : <Badge tone="mute">Real</Badge>}
                    {run.status === 'completed' ? <Badge tone="ok">Completada</Badge> : <Badge tone="bad">Falló</Badge>}
                </div>
                <p className="text-sm text-muted mt-1">
                    {run.summaryText} · {formatDateTime(run.startedAt)}
                </p>
            </div>

            {run.errorMessage && (
                <div className="p-4 rounded-xl badge-bad border text-sm">
                    <strong>Error:</strong> {run.errorMessage}
                </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {Object.entries(run.counters).map(([key, value]) => (
                    <MetricTile
                        key={key}
                        label={COUNTER_LABELS[key] ?? key}
                        value={key.endsWith('Cents') ? formatUsd(value) : value}
                    />
                ))}
            </div>

            <Card>
                <CardHeader
                    title={`Cuotas evaluadas (${filteredItems.length} de ${items.length})`}
                    action={
                        <div className="flex flex-wrap gap-1.5">
                            <Button
                                size="sm"
                                variant={outcomeFilter === '' ? 'primary' : 'secondary'}
                                onClick={() => setOutcomeFilter('')}
                            >
                                Todas ({items.length})
                            </Button>
                            {Array.from(countsByOutcome.entries()).map(([outcome, count]) => (
                                <Button
                                    key={outcome}
                                    size="sm"
                                    variant={outcomeFilter === outcome ? 'primary' : 'secondary'}
                                    onClick={() => setOutcomeFilter(outcome)}
                                >
                                    {OUTCOME_META[outcome]?.label ?? outcome} ({count})
                                </Button>
                            ))}
                        </div>
                    }
                />

                <DataTable
                    data={filteredItems}
                    keyExtractor={item => item.id}
                    defaultPageSize={10}
                    emptyState={
                        <EmptyState
                            title="Sin filas para mostrar"
                            description={
                                run.status === 'failed'
                                    ? 'La corrida se detuvo antes de procesar cuotas.'
                                    : 'No hay cuotas bajo este filtro.'
                            }
                        />
                    }
                    columns={[
                        {
                            id: 'contractId',
                            header: 'Contrato',
                            sortValue: i => i.contractId,
                            cell: i => <span className="font-mono text-xs">#{i.contractId}</span>,
                        },
                        {
                            id: 'holderName',
                            header: 'Titular',
                            sortValue: i => i.holderName,
                            cell: i => <span className="font-medium">{i.holderName}</span>,
                        },
                        {
                            id: 'holderId',
                            header: 'Documento',
                            sortValue: i => i.holderId,
                            cell: i => <span className="font-mono text-xs">{i.holderId}</span>,
                        },
                        {
                            id: 'externalDeudaId',
                            header: 'Cuota ISP',
                            sortValue: i => i.externalDeudaId,
                            cell: i => <span className="font-mono text-xs">{i.externalDeudaId}</span>,
                        },
                        {
                            id: 'period',
                            header: 'Periodo',
                            sortValue: i => i.period,
                            cell: i => <span className="text-xs">{i.period !== '—' ? formatDate(i.period) : '—'}</span>,
                        },
                        {
                            id: 'amountCents',
                            header: 'Monto',
                            align: 'right',
                            sortValue: i => i.amountCents,
                            cell: i => (i.amountCents > 0 ? formatUsd(i.amountCents) : '—'),
                        },
                        {
                            id: 'outcome',
                            header: 'Resultado',
                            sortValue: i => i.outcome,
                            cell: i => <OutcomeBadge outcome={i.outcome} />,
                        },
                        {
                            id: 'reason',
                            header: 'Detalle',
                            cell: i => <span className="text-xs text-muted">{i.reason}</span>,
                        },
                    ]}
                />
            </Card>
        </div>
    )
}