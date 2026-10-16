import { NavArrowDown, NavArrowLeft, NavArrowRight, NavArrowUp } from 'iconoir-react'
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useMemo, useState } from 'react'

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'mute'

const TONE_CLASSES: Record<Tone, string> = {
    ok: 'badge-ok',
    warn: 'badge-warn',
    bad: 'badge-bad',
    info: 'badge-info',
    mute: 'badge-mute',
}

export function Badge({ children, tone = 'mute' }: { readonly children: ReactNode; readonly tone?: Tone }) {
    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold border whitespace-nowrap ${TONE_CLASSES[tone]}`}>
            {children}
        </span>
    )
}

export const CONTRACT_STATUS_TONE: Record<string, Tone> = {
    ACTIVO: 'ok',
    CORTADO: 'bad',
    CORTESIA: 'info',
    RETIRADO: 'mute',
    RECHAZADO: 'mute',
    ANULADO: 'mute',
}

export const OUTCOME_META: Record<string, { readonly label: string; readonly tone: Tone }> = {
    imported: { label: 'Importada', tone: 'ok' },
    already_imported: { label: 'Ya importada', tone: 'info' },
    excluded_status: { label: 'Excluida por estado', tone: 'mute' },
    excluded_currency: { label: 'Moneda incoherente', tone: 'bad' },
    excluded_doc_type: { label: 'Documento excluido', tone: 'warn' },
    excluded_window: { label: 'Fuera de ventana', tone: 'mute' },
    excluded_max_recent: { label: 'Excede recientes', tone: 'warn' },
    excluded_residual: { label: 'Saldo residual', tone: 'mute' },
    excluded_invalid_contract: { label: 'Contrato inválido', tone: 'bad' },
    capped_invoice_count: { label: 'Tope de facturas', tone: 'warn' },
    capped_amount: { label: 'Tope de monto', tone: 'warn' },
    marked_paid: { label: 'Pagada', tone: 'ok' },
    partial_payment: { label: 'Abono parcial', tone: 'warn' },
    still_open: { label: 'Sigue abierta', tone: 'info' },
    exempt_not_paid: { label: 'Exonerada', tone: 'mute' },
    no_evidence: { label: 'Sin evidencia', tone: 'bad' },
    contradictory_ledger: { label: 'Libro contradictorio', tone: 'bad' },
}

export function OutcomeBadge({ outcome }: { readonly outcome: string }) {
    const meta = OUTCOME_META[outcome] ?? { label: outcome, tone: 'mute' as Tone }
    return <Badge tone={meta.tone}>{meta.label}</Badge>
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    readonly variant?: 'primary' | 'secondary' | 'ghost'
    readonly size?: 'sm' | 'md'
}

export function Button({ variant = 'secondary', size = 'md', className = '', children, ...props }: ButtonProps) {
    const base =
        'inline-flex items-center justify-center gap-2 font-semibold rounded-lg border transition-colors cursor-pointer select-none disabled:opacity-50 disabled:pointer-events-none'
    const variants = {
        primary: 'bg-primary text-primary-fg border-primary hover:bg-primary-hover shadow-2xs',
        secondary: 'btn-secondary shadow-2xs',
        ghost: 'bg-transparent text-muted border-transparent hover:bg-elevated hover:text-fg',
    }
    const sizes = {
        sm: 'px-3 py-1.5 text-xs',
        md: 'px-4 py-2 text-sm',
    }
    return (
        <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
            {children}
        </button>
    )
}

export function Card({ children, className = '' }: { readonly children: ReactNode; readonly className?: string }) {
    return <section className={`bg-surface border border-border rounded-xl overflow-hidden shadow-2xs ${className}`}>{children}</section>
}

export function CardHeader({ title, action }: { readonly title: ReactNode; readonly action?: ReactNode }) {
    return (
        <header className="px-5 py-3.5 border-b border-border flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-fg">{title}</div>
            {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
        </header>
    )
}

export function CardBody({ children, className = '' }: { readonly children: ReactNode; readonly className?: string }) {
    return <div className={`p-5 ${className}`}>{children}</div>
}

export function MetricTile({
    label,
    value,
    subtext,
    icon,
}: {
    readonly label: string
    readonly value: ReactNode
    readonly subtext?: ReactNode
    readonly icon?: ReactNode
}) {
    return (
        <div className="bg-surface border border-border rounded-xl p-4 flex flex-col justify-between gap-1.5 shadow-2xs">
            <div className="flex items-center justify-between text-muted text-xs font-medium">
                <span>{label}</span>
                {icon}
            </div>
            <div className="text-2xl font-bold tracking-tight tabular-nums text-fg">{value}</div>
            {subtext && <div className="text-xs text-muted">{subtext}</div>}
        </div>
    )
}

export function EmptyState({
    title,
    description,
    action,
}: {
    readonly title: string
    readonly description: string
    readonly action?: ReactNode
}) {
    return (
        <div className="py-12 px-4 text-center flex flex-col items-center justify-center gap-1.5">
            <p className="text-sm font-semibold text-fg">{title}</p>
            <p className="text-xs text-muted max-w-md">{description}</p>
            {action && <div className="mt-3">{action}</div>}
        </div>
    )
}

export interface DataTableColumn<T> {
    readonly id: string
    readonly header: ReactNode
    readonly cell: (row: T) => ReactNode
    readonly align?: 'left' | 'right'
    readonly className?: string
    readonly sortValue?: (row: T) => string | number
}

export function DataTable<T>({
    data,
    columns,
    keyExtractor,
    onRowClick,
    defaultPageSize = 10,
    pageSizeOptions = [5, 10, 25, 50],
    emptyState,
}: {
    readonly data: readonly T[]
    readonly columns: readonly DataTableColumn<T>[]
    readonly keyExtractor: (row: T) => string | number
    readonly onRowClick?: (row: T) => void
    readonly defaultPageSize?: number
    readonly pageSizeOptions?: readonly number[]
    readonly emptyState?: ReactNode
}) {
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(defaultPageSize)
    const [sortCol, setSortCol] = useState<string | null>(null)
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

    useEffect(() => {
        setPage(1)
    }, [data.length, pageSize])

    const sortedData = useMemo(() => {
        if (!sortCol) return data
        const col = columns.find(c => c.id === sortCol)
        if (!col?.sortValue) return data
        const getter = col.sortValue
        return [...data].sort((a, b) => {
            const va = getter(a)
            const vb = getter(b)
            const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
            return sortDir === 'asc' ? cmp : -cmp
        })
    }, [data, columns, sortCol, sortDir])

    if (data.length === 0) {
        return <>{emptyState ?? <EmptyState title="Sin registros" description="No hay datos para mostrar." />}</>
    }

    const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize))
    const safePage = Math.min(page, totalPages)
    const startIdx = (safePage - 1) * pageSize
    const pageRows = sortedData.slice(startIdx, startIdx + pageSize)

    const handleSort = (col: DataTableColumn<T>) => {
        if (!col.sortValue) return
        if (sortCol === col.id) {
            setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
        } else {
            setSortCol(col.id)
            setSortDir('asc')
        }
    }

    return (
        <div className="flex flex-col">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-elevated/60 text-xs text-muted border-b border-border select-none">
                        <tr>
                            {columns.map(col => {
                                const isSorted = sortCol === col.id
                                const alignClass = col.align === 'right' ? 'text-right' : 'text-left'
                                return (
                                    <th
                                        key={col.id}
                                        onClick={() => handleSort(col)}
                                        className={`py-2.5 px-4 font-semibold whitespace-nowrap ${alignClass} ${
                                            col.sortValue ? 'cursor-pointer hover:text-fg' : ''
                                        }`}
                                    >
                                        <span className="inline-flex items-center gap-1">
                                            {col.header}
                                            {isSorted &&
                                                (sortDir === 'asc' ? (
                                                    <NavArrowUp className="w-3.5 h-3.5 text-primary" />
                                                ) : (
                                                    <NavArrowDown className="w-3.5 h-3.5 text-primary" />
                                                ))}
                                        </span>
                                    </th>
                                )
                            })}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {pageRows.map(row => (
                            <tr
                                key={keyExtractor(row)}
                                onClick={onRowClick ? () => onRowClick(row) : undefined}
                                className={onRowClick ? 'hover:bg-elevated/60 cursor-pointer transition-colors' : ''}
                            >
                                {columns.map(col => (
                                    <td
                                        key={col.id}
                                        className={`py-3 px-4 ${col.align === 'right' ? 'text-right tabular-nums' : 'text-left'} ${
                                            col.className ?? ''
                                        }`}
                                    >
                                        {col.cell(row)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="px-4 py-3 border-t border-border bg-elevated/30 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
                <div className="flex items-center gap-3">
                    <span>
                        Mostrando <strong className="text-fg">{startIdx + 1}</strong>–
                        <strong className="text-fg">{Math.min(startIdx + pageSize, sortedData.length)}</strong> de{' '}
                        <strong className="text-fg">{sortedData.length}</strong>
                    </span>
                    <label className="inline-flex items-center gap-1.5">
                        <span>Filas:</span>
                        <select
                            value={pageSize}
                            onChange={e => setPageSize(Number(e.target.value))}
                            className="px-2 py-1 rounded-md bg-surface border border-border text-fg font-semibold focus:outline-2 focus:outline-primary"
                        >
                            {pageSizeOptions.map(opt => (
                                <option key={opt} value={opt}>
                                    {opt}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>

                <div className="flex items-center gap-2">
                    <span>
                        Página <strong className="text-fg">{safePage}</strong> de <strong className="text-fg">{totalPages}</strong>
                    </span>
                    <Button
                        size="sm"
                        variant="secondary"
                        disabled={safePage <= 1}
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                    >
                        <NavArrowLeft className="w-3.5 h-3.5" /> Anterior
                    </Button>
                    <Button
                        size="sm"
                        variant="secondary"
                        disabled={safePage >= totalPages}
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    >
                        Siguiente <NavArrowRight className="w-3.5 h-3.5" />
                    </Button>
                </div>
            </div>
        </div>
    )
}

export function ConfirmDialog({
    open,
    title,
    description,
    confirmLabel,
    onConfirm,
    onCancel,
}: {
    readonly open: boolean
    readonly title: string
    readonly description: string
    readonly confirmLabel: string
    readonly onConfirm: () => void
    readonly onCancel: () => void
}) {
    if (!open) return null
    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-surface border border-border rounded-xl max-w-md w-full p-6 shadow-xl flex flex-col gap-4">
                <div>
                    <h3 className="text-base font-semibold text-fg">{title}</h3>
                    <p className="text-sm text-muted mt-1">{description}</p>
                </div>
                <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={onCancel}>
                        Cancelar
                    </Button>
                    <Button variant="primary" onClick={onConfirm}>
                        {confirmLabel}
                    </Button>
                </div>
            </div>
        </div>
    )
}