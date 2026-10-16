import { ArrowLeft } from 'iconoir-react'
import { useEffect, useState } from 'react'

import { api, formatDate, formatDateTime, formatUsd, type CustomerDossier } from '../api.ts'
import { Badge, Button, Card, CardBody, CardHeader, CONTRACT_STATUS_TONE, DataTable, EmptyState, MetricTile } from '../components/ui.tsx'

export function DossierPage({
    customerId,
    navigate,
}: {
    readonly customerId: string
    readonly navigate: (to: string) => void
}) {
    const [dossier, setDossier] = useState<CustomerDossier | null>(null)
    const [loading, setLoading] = useState(true)
    const [invoiceFilter, setInvoiceFilter] = useState<'all' | 'open' | 'paid'>('all')
    const [eventFilter, setEventFilter] = useState<'all' | 'invoice_paid' | 'invoice_imported' | 'customer_created'>('all')

    useEffect(() => {
        setLoading(true)
        api.getCustomerDossier(customerId)
            .then(setDossier)
            .catch(() => setDossier(null))
            .finally(() => setLoading(false))
    }, [customerId])

    if (loading) {
        return <div className="text-sm text-muted py-12">Cargando expediente…</div>
    }

    if (!dossier) {
        return (
            <Card>
                <CardBody>
                    <EmptyState
                        title="Cliente no encontrado"
                        description={`No existe un expediente asociado al documento ${customerId}.`}
                        action={<Button onClick={() => navigate('/clientes')}>Volver a Clientes</Button>}
                    />
                </CardBody>
            </Card>
        )
    }

    const { customer, contracts, invoices, events, totals } = dossier
    const filteredInvoices = invoices.filter(i => (invoiceFilter === 'all' ? true : i.status === invoiceFilter))
    const filteredEvents = events.filter(e => (eventFilter === 'all' ? true : e.eventType === eventFilter))

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <Button size="sm" variant="ghost" onClick={() => navigate('/clientes')} className="mb-2 -ml-2">
                        <ArrowLeft className="w-4 h-4" /> Clientes
                    </Button>
                    <h1 className="text-xl font-bold text-fg flex flex-wrap items-center gap-2.5">
                        {customer.name}
                        <Badge tone={customer.personType === 'juridico' ? 'info' : 'mute'}>
                            {customer.personType === 'juridico' ? 'Jurídico' : 'Natural'}
                        </Badge>
                    </h1>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricTile label="Contratos" value={totals.contractsCount} />
                <MetricTile label="Facturas abiertas" value={totals.openInvoicesCount} />
                <MetricTile label="Facturas pagadas" value={totals.paidInvoicesCount} />
                <MetricTile label="Deuda total" value={formatUsd(totals.debtCents)} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader title="Datos del titular" />
                    <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        <div>
                            <div className="text-xs text-muted">Documento</div>
                            <div className="font-mono font-semibold mt-0.5">
                                {customer.id}
                                {customer.rawIdentification !== customer.id && (
                                    <span className="text-xs font-normal text-muted ml-1.5">({customer.rawIdentification})</span>
                                )}
                            </div>
                        </div>
                        <div>
                            <div className="text-xs text-muted">Origen</div>
                            <div className="mt-0.5">
                                <Badge tone="info">{customer.origin}</Badge>
                            </div>
                        </div>
                        <div>
                            <div className="text-xs text-muted">Correo electrónico</div>
                            <div className="mt-0.5 break-all">{customer.email || '—'}</div>
                        </div>
                        <div>
                            <div className="text-xs text-muted">Teléfono</div>
                            <div className="font-mono mt-0.5">{customer.phone || '—'}</div>
                        </div>
                        <div className="sm:col-span-2">
                            <div className="text-xs text-muted">Dirección</div>
                            <div className="mt-0.5">{customer.address || '—'}</div>
                        </div>
                    </CardBody>
                </Card>

                <Card>
                    <CardHeader title={`Contratos (${contracts.length})`} />
                    <DataTable
                        data={contracts}
                        keyExtractor={ct => ct.id}
                        defaultPageSize={5}
                        columns={[
                            {
                                id: 'id',
                                header: 'Contrato',
                                sortValue: ct => ct.id,
                                cell: ct => (
                                    <span className="font-mono text-xs font-semibold">
                                        #{ct.id} <span className="text-muted font-normal">({ct.code})</span>
                                    </span>
                                ),
                            },
                            {
                                id: 'status',
                                header: 'Estado',
                                sortValue: ct => ct.status,
                                cell: ct => <Badge tone={CONTRACT_STATUS_TONE[ct.status] ?? 'mute'}>{ct.status}</Badge>,
                            },
                            {
                                id: 'plan',
                                header: 'Plan',
                                sortValue: ct => ct.planName,
                                cell: ct => <span className="font-mono text-xs">{ct.planName}</span>,
                            },
                            {
                                id: 'price',
                                header: 'Tarifa',
                                align: 'right',
                                sortValue: ct => ct.planPriceCents,
                                cell: ct => formatUsd(ct.planPriceCents),
                            },
                            {
                                id: 'branch',
                                header: 'Sucursal',
                                cell: ct => <Badge tone="mute">{ct.branchCode}</Badge>,
                            },
                        ]}
                    />
                </Card>
            </div>

            <Card>
                <CardHeader
                    title={`Facturas (${filteredInvoices.length})`}
                    action={
                        <div className="flex flex-wrap gap-1.5">
                            {(
                                [
                                    ['all', `Todas (${invoices.length})`],
                                    ['open', `Abiertas (${totals.openInvoicesCount})`],
                                    ['paid', `Pagadas (${totals.paidInvoicesCount})`],
                                ] as const
                            ).map(([key, label]) => (
                                <Button
                                    key={key}
                                    size="sm"
                                    variant={invoiceFilter === key ? 'primary' : 'secondary'}
                                    onClick={() => setInvoiceFilter(key)}
                                >
                                    {label}
                                </Button>
                            ))}
                        </div>
                    }
                />
                <DataTable
                    data={filteredInvoices}
                    keyExtractor={inv => inv.id}
                    defaultPageSize={5}
                    columns={[
                        {
                            id: 'cobrixNumber',
                            header: 'N.º Cobrix',
                            sortValue: inv => inv.cobrixNumber,
                            cell: inv => <span className="font-mono text-xs font-semibold">{inv.cobrixNumber}</span>,
                        },
                        {
                            id: 'externalDeudaId',
                            header: 'Cuota ISP',
                            sortValue: inv => inv.externalDeudaId,
                            cell: inv => <span className="font-mono text-xs">{inv.externalDeudaId}</span>,
                        },
                        {
                            id: 'contractId',
                            header: 'Contrato',
                            sortValue: inv => inv.contractId,
                            cell: inv => <span className="font-mono text-xs">#{inv.contractId}</span>,
                        },
                        {
                            id: 'period',
                            header: 'Periodo',
                            sortValue: inv => inv.period,
                            cell: inv => formatDate(inv.period),
                        },
                        {
                            id: 'dueDate',
                            header: 'Vencimiento',
                            sortValue: inv => inv.dueDate,
                            cell: inv => <span className="text-xs">{formatDate(inv.dueDate)}</span>,
                        },
                        {
                            id: 'cutoffDate',
                            header: 'Corte',
                            sortValue: inv => inv.cutoffDate,
                            cell: inv => <span className="text-xs">{formatDate(inv.cutoffDate)}</span>,
                        },
                        {
                            id: 'totalCents',
                            header: 'Total',
                            align: 'right',
                            sortValue: inv => inv.totalCents,
                            cell: inv => formatUsd(inv.totalCents),
                        },
                        {
                            id: 'balanceCents',
                            header: 'Saldo',
                            align: 'right',
                            sortValue: inv => inv.balanceCents,
                            cell: inv => <span className="font-semibold">{formatUsd(inv.balanceCents)}</span>,
                        },
                        {
                            id: 'status',
                            header: 'Estado',
                            sortValue: inv => inv.status,
                            cell: inv =>
                                inv.status === 'paid' ? <Badge tone="ok">Pagada</Badge> : <Badge tone="warn">Abierta</Badge>,
                        },
                        {
                            id: 'paidAt',
                            header: 'Pago registrado',
                            cell: inv =>
                                inv.status === 'paid' ? (
                                    <span className="text-xs text-muted">
                                        {formatDate(inv.paidAt)}
                                        {inv.ispInvoiceNumber ? ` · Fact. ${inv.ispInvoiceNumber}` : ''}
                                    </span>
                                ) : (
                                    <span className="text-xs text-muted">—</span>
                                ),
                        },
                    ]}
                />
            </Card>

            <Card>
                <CardHeader
                    title={`Historial (${filteredEvents.length})`}
                    action={
                        <div className="flex flex-wrap gap-1.5">
                            {(
                                [
                                    ['all', 'Todos'],
                                    ['invoice_paid', 'Pagos ISP'],
                                    ['invoice_imported', 'Importaciones'],
                                    ['customer_created', 'Alta'],
                                ] as const
                            ).map(([key, label]) => (
                                <Button
                                    key={key}
                                    size="sm"
                                    variant={eventFilter === key ? 'primary' : 'secondary'}
                                    onClick={() => setEventFilter(key)}
                                >
                                    {label}
                                </Button>
                            ))}
                        </div>
                    }
                />
                <DataTable
                    data={filteredEvents}
                    keyExtractor={ev => ev.id}
                    defaultPageSize={5}
                    columns={[
                        {
                            id: 'occurredAt',
                            header: 'Fecha',
                            sortValue: ev => ev.occurredAt,
                            cell: ev => <span className="font-mono text-xs text-muted whitespace-nowrap">{formatDateTime(ev.occurredAt)}</span>,
                        },
                        {
                            id: 'eventType',
                            header: 'Evento',
                            sortValue: ev => ev.eventType,
                            cell: ev =>
                                ev.eventType === 'invoice_paid' ? (
                                    <Badge tone="ok">Pago ISP</Badge>
                                ) : ev.eventType === 'invoice_imported' ? (
                                    <Badge tone="info">Importación</Badge>
                                ) : (
                                    <Badge tone="mute">Alta</Badge>
                                ),
                        },
                        {
                            id: 'description',
                            header: 'Detalle',
                            cell: ev => ev.description,
                        },
                    ]}
                />
            </Card>
        </div>
    )
}