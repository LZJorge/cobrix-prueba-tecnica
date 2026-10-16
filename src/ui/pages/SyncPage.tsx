import { Download, Play, Refresh } from 'iconoir-react'
import { useEffect, useState } from 'react'

import { api, formatDateTime, type SyncRunRecord } from '../api.ts'
import { Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, DataTable, EmptyState } from '../components/ui.tsx'

export function SyncPage({ navigate }: { readonly navigate: (to: string) => void }) {
    const [runs, setRuns] = useState<SyncRunRecord[]>([])
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState<string | null>(null)
    const [confirmAction, setConfirmAction] = useState<'import' | 'update_paid' | null>(null)

    useEffect(() => {
        api.getRuns()
            .then(res => setRuns(res.runs))
            .finally(() => setLoading(false))
    }, [])

    const trigger = async (type: 'import' | 'update_paid', dryRun: boolean) => {
        setConfirmAction(null)
        setBusy(`${type}-${dryRun ? 'sim' : 'real'}`)
        try {
            const res = type === 'import' ? await api.runImport(dryRun) : await api.runUpdatePaid(dryRun)
            navigate(`/sincronizacion/corridas/${res.run.id}`)
        } finally {
            setBusy(null)
        }
    }

    return (
        <div className="flex flex-col gap-6">
            <div>
                <h1 className="text-xl font-bold text-fg">Sincronización</h1>
                <p className="text-sm text-muted mt-0.5">
                    Importación de cuotas pendientes y conciliación de pagos con el proveedor.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader title="Importar clientes y facturas" />
                    <CardBody className="flex flex-col justify-between gap-4">
                        <p className="text-sm text-muted">
                            Consulta los contratos del proveedor y registra las cuotas pendientes junto con sus titulares.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                variant="secondary"
                                disabled={busy !== null}
                                onClick={() => void trigger('import', true)}
                            >
                                <Play className="w-4 h-4" />
                                {busy === 'import-sim' ? 'Simulando…' : 'Simular importación'}
                            </Button>
                            <Button
                                variant="primary"
                                disabled={busy !== null}
                                onClick={() => setConfirmAction('import')}
                            >
                                <Download className="w-4 h-4" />
                                {busy === 'import-real' ? 'Importando…' : 'Importar'}
                            </Button>
                        </div>
                    </CardBody>
                </Card>

                <Card>
                    <CardHeader title="Actualizar facturas pagadas" />
                    <CardBody className="flex flex-col justify-between gap-4">
                        <p className="text-sm text-muted">
                            Verifica las facturas abiertas contra el libro de pagos del proveedor y actualiza las cobradas.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                variant="secondary"
                                disabled={busy !== null}
                                onClick={() => void trigger('update_paid', true)}
                            >
                                <Play className="w-4 h-4" />
                                {busy === 'update_paid-sim' ? 'Simulando…' : 'Simular actualización'}
                            </Button>
                            <Button
                                variant="primary"
                                disabled={busy !== null}
                                onClick={() => setConfirmAction('update_paid')}
                            >
                                <Refresh className="w-4 h-4" />
                                {busy === 'update_paid-real' ? 'Actualizando…' : 'Actualizar pagadas'}
                            </Button>
                        </div>
                    </CardBody>
                </Card>
            </div>

            <Card>
                <CardHeader title={`Historial de corridas (${runs.length})`} />
                {loading ? (
                    <div className="p-8 text-sm text-muted text-center">Cargando historial…</div>
                ) : (
                    <DataTable
                        data={runs}
                        keyExtractor={r => r.id}
                        defaultPageSize={10}
                        onRowClick={r => navigate(`/sincronizacion/corridas/${r.id}`)}
                        emptyState={
                            <EmptyState
                                title="Sin corridas registradas"
                                description="Ejecuta una simulación o una sincronización para ver el detalle de resultados."
                            />
                        }
                        columns={[
                            {
                                id: 'id',
                                header: 'ID',
                                sortValue: r => r.id,
                                cell: r => <span className="font-mono text-xs font-semibold">#{r.id}</span>,
                            },
                            {
                                id: 'runType',
                                header: 'Operación',
                                sortValue: r => r.runType,
                                cell: r => (
                                    <span className="font-semibold">
                                        {r.runType === 'import' ? 'Importación' : 'Actualización de pagadas'}
                                    </span>
                                ),
                            },
                            {
                                id: 'isSimulation',
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
                                id: 'startedAt',
                                header: 'Fecha',
                                sortValue: r => r.startedAt,
                                cell: r => <span className="text-xs text-muted whitespace-nowrap">{formatDateTime(r.startedAt)}</span>,
                            },
                            {
                                id: 'summaryText',
                                header: 'Resumen',
                                cell: r => <span className="text-xs text-muted">{r.summaryText}</span>,
                            },
                        ]}
                    />
                )}
            </Card>

            <ConfirmDialog
                open={confirmAction === 'import'}
                title="Importar clientes y facturas"
                description="Se registrarán en Cobrix los clientes y facturas pendientes que cumplan las reglas activas."
                confirmLabel="Importar"
                onCancel={() => setConfirmAction(null)}
                onConfirm={() => void trigger('import', false)}
            />

            <ConfirmDialog
                open={confirmAction === 'update_paid'}
                title="Actualizar facturas pagadas"
                description="Se marcarán como pagadas las facturas abiertas cuyo cobro total conste en el proveedor."
                confirmLabel="Actualizar"
                onCancel={() => setConfirmAction(null)}
                onConfirm={() => void trigger('update_paid', false)}
            />
        </div>
    )
}