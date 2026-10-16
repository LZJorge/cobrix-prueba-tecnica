import { Download, Search, Xmark } from 'iconoir-react'
import { useEffect, useState } from 'react'

import { api, formatDate, formatUsd, type CustomerListItem } from '../api.ts'
import { Badge, Button, Card, CardHeader, DataTable, EmptyState } from '../components/ui.tsx'

export function CustomersPage({ navigate }: { readonly navigate: (to: string) => void }) {
    const [customers, setCustomers] = useState<CustomerListItem[]>([])
    const [search, setSearch] = useState('')
    const [filter, setFilter] = useState<'all' | 'debt' | 'natural' | 'juridico'>('all')
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let active = true
        setLoading(true)
        api.getCustomers(search)
            .then(res => {
                if (active) setCustomers(res.customers)
            })
            .finally(() => {
                if (active) setLoading(false)
            })
        return () => {
            active = false
        }
    }, [search])

    const filtered = customers.filter(c => {
        if (filter === 'debt') return c.debtCents > 0
        if (filter === 'natural') return c.personType === 'natural'
        if (filter === 'juridico') return c.personType === 'juridico'
        return true
    })

    const totalDebtCents = filtered.reduce((acc, c) => acc + c.debtCents, 0)

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-fg flex items-center gap-2.5">
                        Clientes <Badge tone="info">{filtered.length}</Badge>
                    </h1>
                    <p className="text-sm text-muted mt-0.5">
                        Deuda acumulada en vista: <strong className="text-fg">{formatUsd(totalDebtCents)}</strong>
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <a
                        href={`/api/cobrix/customers.csv?q=${encodeURIComponent(search)}`}
                        className="btn-secondary inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors shadow-2xs"
                    >
                        <Download className="w-4 h-4" /> Exportar CSV
                    </a>
                </div>
            </div>

            <Card>
                <CardHeader
                    title={
                        <div className="relative w-full sm:w-80">
                            <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Buscar por nombre, cédula o RIF…"
                                className="w-full pl-9 pr-8 py-1.5 text-sm bg-bg border border-border rounded-lg text-fg font-normal focus:outline-2 focus:outline-primary"
                            />
                            {search && (
                                <button
                                    type="button"
                                    onClick={() => setSearch('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-fg cursor-pointer"
                                >
                                    <Xmark className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    }
                    action={
                        <div className="flex flex-wrap gap-1.5">
                            {(
                                [
                                    ['all', 'Todos'],
                                    ['debt', 'Con deuda'],
                                    ['natural', 'Naturales'],
                                    ['juridico', 'Jurídicos'],
                                ] as const
                            ).map(([key, label]) => (
                                <Button
                                    key={key}
                                    size="sm"
                                    variant={filter === key ? 'primary' : 'secondary'}
                                    onClick={() => setFilter(key)}
                                >
                                    {label}
                                </Button>
                            ))}
                        </div>
                    }
                />

                {loading && customers.length === 0 ? (
                    <div className="p-8 text-sm text-muted text-center">Cargando clientes…</div>
                ) : (
                    <DataTable
                        data={filtered}
                        keyExtractor={c => c.id}
                        defaultPageSize={10}
                        onRowClick={c => navigate(`/clientes/${encodeURIComponent(c.id)}`)}
                        emptyState={
                            <EmptyState
                                title={search ? 'Sin resultados' : 'No hay clientes importados'}
                                description={
                                    search
                                        ? 'No se encontraron titulares que coincidan con la búsqueda.'
                                        : 'Ejecuta una importación en Sincronización para cargar los clientes del proveedor.'
                                }
                                action={
                                    !search ? (
                                        <Button variant="primary" onClick={() => navigate('/sincronizacion')}>
                                            Ir a Sincronización
                                        </Button>
                                    ) : undefined
                                }
                            />
                        }
                        columns={[
                            {
                                id: 'name',
                                header: 'Nombre',
                                sortValue: c => c.name,
                                cell: c => <span className="font-semibold text-fg">{c.name}</span>,
                            },
                            {
                                id: 'id',
                                header: 'Documento',
                                sortValue: c => c.id,
                                cell: c => <span className="font-mono text-xs">{c.id}</span>,
                            },
                            {
                                id: 'personType',
                                header: 'Tipo',
                                sortValue: c => c.personType,
                                cell: c =>
                                    c.personType === 'juridico' ? (
                                        <Badge tone="info">Jurídico</Badge>
                                    ) : (
                                        <Badge tone="mute">Natural</Badge>
                                    ),
                            },
                            {
                                id: 'contractsCount',
                                header: 'Contratos',
                                align: 'right',
                                sortValue: c => c.contractsCount,
                                cell: c => c.contractsCount,
                            },
                            {
                                id: 'openInvoicesCount',
                                header: 'Abiertas',
                                align: 'right',
                                sortValue: c => c.openInvoicesCount,
                                cell: c =>
                                    c.openInvoicesCount > 0 ? <Badge tone="warn">{c.openInvoicesCount}</Badge> : '0',
                            },
                            {
                                id: 'paidInvoicesCount',
                                header: 'Pagadas',
                                align: 'right',
                                sortValue: c => c.paidInvoicesCount,
                                cell: c =>
                                    c.paidInvoicesCount > 0 ? <Badge tone="ok">{c.paidInvoicesCount}</Badge> : '0',
                            },
                            {
                                id: 'debtCents',
                                header: 'Deuda',
                                align: 'right',
                                sortValue: c => c.debtCents,
                                cell: c => <span className="font-semibold">{formatUsd(c.debtCents)}</span>,
                            },
                            {
                                id: 'oldestDueDate',
                                header: 'Vencimiento más antiguo',
                                sortValue: c => c.oldestDueDate ?? '9999-99-99',
                                cell: c => (
                                    <span className="text-xs text-muted">
                                        {c.oldestDueDate ? formatDate(c.oldestDueDate) : 'Al día'}
                                    </span>
                                ),
                            },
                        ]}
                    />
                )}
            </Card>
        </div>
    )
}