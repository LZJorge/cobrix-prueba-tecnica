import { CheckCircle, Clock, Download, Group, OpenNewWindow, Page, Play, Refresh, WarningTriangle } from 'iconoir-react'
import { useEffect, useState } from 'react'

import { api, formatDate, formatDateTime, formatUsd, type OverviewResponse } from '../api.ts'
import { Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, CONTRACT_STATUS_TONE, EmptyState, MetricTile, DataTable } from '../components/ui.tsx'

export function DashboardPage({ navigate }: { readonly navigate: (to: string) => void }) {
    const [data, setData] = useState<OverviewResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [busyAction, setBusyAction] = useState<string | null>(null)
    const [confirmAction, setConfirmAction] = useState<'import' | 'update_paid' | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        setLoading(true)
        api.getOverview()
            .then(res => {
                setData(res)
                setError(null)
            })
            .catch(err => setError(err instanceof Error ? err.message : String(err)))
            .finally(() => setLoading(false))
    }, [])

    const executeSync = async (type: 'import' | 'update_paid', dryRun: boolean) => {
        setConfirmAction(null)
        setBusyAction(`${type}-${dryRun ? 'sim' : 'real'}`)
        try {
            const res = type === 'import' ? await api.runImport(dryRun) : await api.runUpdatePaid(dryRun)
            navigate(`/sincronizacion/corridas/${res.run.id}`)
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
            setBusyAction(null)
        }
    }

    if (loading && !data) {
        return <div className="text-sm text-muted py-12">Cargando resumen…</div>
    }

    if (!data) {
        return <div className="p-4 rounded-lg bg-rose-500/15 text-rose-500 text-sm">{error ?? 'No se pudo cargar el resumen'}</div>
    }

    const { summary, radar, config, recentRuns } = data

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-fg">Resumen</h1>
                    <p className="text-sm text-muted mt-0.5">Estado general de la cartera y sincronización con el proveedor.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant="secondary"
                        disabled={busyAction !== null}
                        onClick={() => void executeSync('import', true)}
                    >
                        <Play className="w-4 h-4" />
                        {busyAction === 'import-sim' ? 'Simulando…' : 'Simular importación'}
                    </Button>
                    <Button
                        variant="primary"
                        disabled={busyAction !== null}
                        onClick={() => setConfirmAction('import')}
                    >
                        <Download className="w-4 h-4" />
                        {busyAction === 'import-real' ? 'Importando…' : 'Importar'}
                    </Button>
                    <Button
                        variant="secondary"
                        disabled={busyAction !== null}
                        onClick={() => setConfirmAction('update_paid')}
                    >
                        <Refresh className="w-4 h-4" />
                        {busyAction === 'update_paid-real' ? 'Actualizando…' : 'Actualizar pagadas'}
                    </Button>
                </div>
            </div>

            {error && (
                <div className="p-3.5 rounded-lg bg-rose-100 border border-rose-300 text-rose-900 dark:bg-rose-500/15 dark:border-rose-500/30 dark:text-rose-300 text-sm">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricTile
                    label="Clientes"
                    value={summary.customersCount}
                    subtext={`${summary.contractsCount} contratos asociados`}
                    icon={<Group className="w-4 h-4" />}
                />
                <MetricTile
                    label="Facturas abiertas"
                    value={summary.openInvoicesCount}
                    subtext="Pendientes de cobro"
                    icon={<Page className="w-4 h-4" />}
                />
                <MetricTile
                    label="Por cobrar"
                    value={formatUsd(summary.openAmountCents)}
                    subtext="Saldo abierto total"
                    icon={<WarningTriangle className="w-4 h-4 text-amber-500" />}
                />
                <MetricTile
                    label="Facturas pagadas"
                    value={summary.paidInvoicesCount}
                    subtext={`Cobrado: ${formatUsd(summary.paidAmountCents)}`}
                    icon={<CheckCircle className="w-4 h-4 text-emerald-500" />}
                />
            </div>

            {summary.openInvoicesCount > 0 && (
                <Card>
                    <CardHeader
                        title={`Estado de vencimientos · ${formatDate(radar.today)}`}
                        action={
                            <Button size="sm" variant="secondary" onClick={() => navigate('/clientes')}>
                                Ver cartera
                            </Button>
                        }
                    />
                    <CardBody className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-lg bg-elevated/50 border border-border flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <WarningTriangle className="w-5 h-5 text-rose-500 shrink-0" />
                                <div>
                                    <div className="text-xs text-muted">Fecha de corte superada</div>
                                    <div className="text-sm font-semibold text-fg">
                                        {radar.cutoffReachedCount} facturas · {formatUsd(radar.cutoffReachedAmountCents)}
                                    </div>
                                </div>
                            </div>
                            <Badge tone="bad">En corte</Badge>
                        </div>

                        <div className="p-4 rounded-lg bg-elevated/50 border border-border flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <Clock className="w-5 h-5 text-amber-500 shrink-0" />
                                <div>
                                    <div className="text-xs text-muted">En periodo de gracia ({config.graceDays} días)</div>
                                    <div className="text-sm font-semibold text-fg">
                                        {radar.inGraceCount} facturas · {formatUsd(radar.inGraceAmountCents)}
                                    </div>
                                </div>
                            </div>
                            <Badge tone="warn">En gracia</Badge>
                        </div>
                    </CardBody>
                </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-1">
                    <CardHeader
                        title="Proveedor"
                        action={
                            <Button size="sm" variant="secondary" onClick={() => navigate('/configuracion')}>
                                Configurar
                            </Button>
                        }
                    />
                    <CardBody className="flex flex-col gap-3 text-sm">
                        <div className="flex justify-between gap-2">
                            <span className="text-muted">Empresa</span>
                            <span className="font-medium text-right">{config.companyName}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                            <span className="text-muted">RIF</span>
                            <span className="font-mono text-xs">{config.companyRif}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                            <span className="text-muted">Endpoint</span>
                            <span className="font-mono text-xs truncate max-w-[180px]">{config.apiUrl}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                            <span className="text-muted">Usuario</span>
                            <span className="font-mono text-xs">{config.apiUser}</span>
                        </div>
                        <div className="flex justify-between items-center gap-2">
                            <span className="text-muted">Estados</span>
                            <div className="flex flex-wrap gap-1 justify-end">
                                {config.allowedStatuses.map(st => (
                                    <Badge key={st} tone={CONTRACT_STATUS_TONE[st] ?? 'mute'}>
                                        {st}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                        <div className="flex justify-between items-center gap-2">
                            <span className="text-muted">Ejecución diaria</span>
                            {config.autoRunEnabled ? (
                                <Badge tone="ok">{config.autoRunTime} CCS</Badge>
                            ) : (
                                <Badge tone="mute">Inactiva</Badge>
                            )}
                        </div>
                        <div className="pt-3 border-t border-border flex justify-between items-center text-xs">
                            <span className="text-muted">Documentación API</span>
                            <a
                                href={`${config.simulatorUrl}/docs`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-primary font-semibold hover:underline"
                            >
                                Swagger <OpenNewWindow className="w-3.5 h-3.5" />
                            </a>
                        </div>
                    </CardBody>
                </Card>

                <Card className="lg:col-span-2">
                    <CardHeader
                        title="Últimas corridas"
                        action={
                            <Button size="sm" variant="secondary" onClick={() => navigate('/sincronizacion')}>
                                Ver historial
                            </Button>
                        }
                    />
                    <DataTable
                        data={recentRuns}
                        keyExtractor={run => run.id}
                        defaultPageSize={5}
                        onRowClick={run => navigate(`/sincronizacion/corridas/${run.id}`)}
                        emptyState={
                            <EmptyState
                                title="Sin corridas registradas"
                                description="Inicia una importación para sincronizar los contratos y facturas del proveedor."
                            />
                        }
                        columns={[
                            {
                                id: 'id',
                                header: 'Corrida',
                                sortValue: r => r.id,
                                cell: r => (
                                    <span className="font-semibold">
                                        #{r.id} · {r.runType === 'import' ? 'Importación' : 'Pagos'}
                                    </span>
                                ),
                            },
                            {
                                id: 'mode',
                                header: 'Modo',
                                cell: r =>
                                    r.isSimulation ? <Badge tone="info">Simulación</Badge> : <Badge tone="mute">Real</Badge>,
                            },
                            {
                                id: 'status',
                                header: 'Estado',
                                cell: r =>
                                    r.status === 'completed' ? (
                                        <Badge tone="ok">Completada</Badge>
                                    ) : (
                                        <Badge tone="bad">Falló</Badge>
                                    ),
                            },
                            {
                                id: 'summary',
                                header: 'Resultado',
                                cell: r => <span className="text-muted text-xs truncate block max-w-xs">{r.summaryText}</span>,
                            },
                            {
                                id: 'date',
                                header: 'Fecha',
                                align: 'right',
                                sortValue: r => r.startedAt,
                                cell: r => <span className="text-xs text-muted whitespace-nowrap">{formatDateTime(r.startedAt)}</span>,
                            },
                        ]}
                    />
                </Card>
            </div>

            <ConfirmDialog
                open={confirmAction === 'import'}
                title="Importar clientes y facturas"
                description="Se consultarán los contratos del proveedor y se registrarán las facturas pendientes que cumplan las reglas activas."
                confirmLabel="Importar"
                onCancel={() => setConfirmAction(null)}
                onConfirm={() => void executeSync('import', false)}
            />

            <ConfirmDialog
                open={confirmAction === 'update_paid'}
                title="Actualizar facturas pagadas"
                description="Se verificará el libro de pagos del proveedor para marcar como pagadas las facturas conciliadas."
                confirmLabel="Actualizar"
                onCancel={() => setConfirmAction(null)}
                onConfirm={() => void executeSync('update_paid', false)}
            />
        </div>
    )
}