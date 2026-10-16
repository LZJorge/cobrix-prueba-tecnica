import { Check, Flash } from 'iconoir-react'
import { type FormEvent, useEffect, useState } from 'react'

import { api } from '../api.ts'
import { Badge, Button, Card, CardBody, CardHeader, CONTRACT_STATUS_TONE } from '../components/ui.tsx'

const ALL_STATUSES = ['ACTIVO', 'CORTADO', 'CORTESIA', 'RETIRADO', 'RECHAZADO', 'ANULADO'] as const
const ALL_DOC_TYPES = ['V', 'E', 'J', 'G', 'P'] as const

export function ConfigPage() {
    const [companyName, setCompanyName] = useState('')
    const [companyRif, setCompanyRif] = useState('')
    const [companyEmail, setCompanyEmail] = useState('')
    const [apiUrl, setApiUrl] = useState('')
    const [apiUser, setApiUser] = useState('')
    const [apiPassword, setApiPassword] = useState('')
    const [allowedStatuses, setAllowedStatuses] = useState<string[]>(['ACTIVO', 'CORTADO'])
    const [excludedDocTypes, setExcludedDocTypes] = useState<string[]>([])
    const [windowMonths, setWindowMonths] = useState<string>('')
    const [maxRecentInstallments, setMaxRecentInstallments] = useState<string>('')
    const [graceDays, setGraceDays] = useState<string>('5')
    const [maxNewInvoices, setMaxNewInvoices] = useState<string>('')
    const [maxNewAmountUsd, setMaxNewAmountUsd] = useState<string>('')
    const [autoRunEnabled, setAutoRunEnabled] = useState(false)
    const [autoRunTime, setAutoRunTime] = useState('06:00')

    const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
    const [testing, setTesting] = useState(false)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        api.getConfig().then(cfg => {
            setCompanyName(cfg.companyName)
            setCompanyRif(cfg.companyRif)
            setCompanyEmail(cfg.companyEmail)
            setApiUrl(cfg.apiUrl)
            setApiUser(cfg.apiUser)
            setAllowedStatuses([...cfg.allowedStatuses])
            setExcludedDocTypes([...cfg.excludedDocTypes])
            setWindowMonths(cfg.windowMonths ? String(cfg.windowMonths) : '')
            setMaxRecentInstallments(cfg.maxRecentInstallments ? String(cfg.maxRecentInstallments) : '')
            setGraceDays(String(cfg.graceDays))
            setMaxNewInvoices(cfg.maxNewInvoices ? String(cfg.maxNewInvoices) : '')
            setMaxNewAmountUsd(cfg.maxNewAmountCents ? (cfg.maxNewAmountCents / 100).toFixed(2) : '')
            setAutoRunEnabled(cfg.autoRunEnabled)
            setAutoRunTime(cfg.autoRunTime)
        })
    }, [])

    const toggleItem = (list: string[], item: string, setter: (next: string[]) => void) => {
        setter(list.includes(item) ? list.filter(i => i !== item) : [...list, item])
    }

    const handleTestConnection = async () => {
        setTesting(true)
        setFeedback(null)
        try {
            const res = await api.testConnection({ apiUrl, apiUser, apiPassword })
            setFeedback({ ok: res.ok, text: res.message })
        } catch (err) {
            setFeedback({ ok: false, text: err instanceof Error ? err.message : String(err) })
        } finally {
            setTesting(false)
        }
    }

    const handleSave = async (e: FormEvent) => {
        e.preventDefault()
        setSaving(true)
        setFeedback(null)
        try {
            await api.updateConfig({
                companyName,
                companyRif,
                companyEmail,
                apiUrl,
                apiUser,
                apiPassword,
                allowedStatuses,
                excludedDocTypes,
                windowMonths: windowMonths ? Number(windowMonths) : null,
                maxRecentInstallments: maxRecentInstallments ? Number(maxRecentInstallments) : null,
                graceDays: Number(graceDays),
                maxNewInvoices: maxNewInvoices ? Number(maxNewInvoices) : null,
                maxNewAmountCents: maxNewAmountUsd ? Math.round(Number(maxNewAmountUsd) * 100) : null,
                autoRunEnabled,
                autoRunTime,
            })
            setApiPassword('')
            setFeedback({ ok: true, text: 'Configuración actualizada.' })
        } catch (err) {
            setFeedback({ ok: false, text: err instanceof Error ? err.message : String(err) })
        } finally {
            setSaving(false)
        }
    }

    const inputClass =
        'w-full px-3 py-2 text-sm bg-bg border border-border rounded-lg text-fg font-normal focus:outline-2 focus:outline-primary'

    return (
        <form onSubmit={e => void handleSave(e)} className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-fg">Configuración</h1>
                    <p className="text-sm text-muted mt-0.5">Parámetros de conexión y reglas de sincronización.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button type="button" variant="secondary" disabled={testing} onClick={() => void handleTestConnection()}>
                        <Flash className="w-4 h-4" />
                        {testing ? 'Probando…' : 'Probar conexión'}
                    </Button>
                    <Button type="submit" variant="primary" disabled={saving}>
                        <Check className="w-4 h-4" />
                        {saving ? 'Guardando…' : 'Guardar cambios'}
                    </Button>
                </div>
            </div>

            {feedback && (
                <div
                    className={`p-3.5 rounded-xl border text-sm font-medium ${
                        feedback.ok
                            ? 'bg-emerald-100 border-emerald-300 text-emerald-900 dark:bg-emerald-500/15 dark:border-emerald-500/30 dark:text-emerald-300'
                            : 'bg-rose-100 border-rose-300 text-rose-900 dark:bg-rose-500/15 dark:border-rose-500/30 dark:text-rose-300'
                    }`}
                >
                    {feedback.text}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader title="Empresa" />
                    <CardBody className="flex flex-col gap-4">
                        <label className="flex flex-col gap-1.5 text-xs font-semibold">
                            Nombre o razón social
                            <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} required className={inputClass} />
                        </label>
                        <label className="flex flex-col gap-1.5 text-xs font-semibold">
                            RIF
                            <input type="text" value={companyRif} onChange={e => setCompanyRif(e.target.value)} required className={inputClass} />
                        </label>
                        <label className="flex flex-col gap-1.5 text-xs font-semibold">
                            Correo de cobranza
                            <input type="email" value={companyEmail} onChange={e => setCompanyEmail(e.target.value)} required className={inputClass} />
                        </label>
                    </CardBody>
                </Card>

                <Card>
                    <CardHeader title="Proveedor" />
                    <CardBody className="flex flex-col gap-4">
                        <label className="flex flex-col gap-1.5 text-xs font-semibold">
                            URL de la API
                            <input type="url" value={apiUrl} onChange={e => setApiUrl(e.target.value)} required className={inputClass} />
                        </label>
                        <label className="flex flex-col gap-1.5 text-xs font-semibold">
                            Usuario
                            <input type="text" value={apiUser} onChange={e => setApiUser(e.target.value)} required className={inputClass} />
                        </label>
                        <label className="flex flex-col gap-1.5 text-xs font-semibold">
                            Contraseña
                            <input
                                type="password"
                                value={apiPassword}
                                onChange={e => setApiPassword(e.target.value)}
                                placeholder="••••••••"
                                autoComplete="new-password"
                                className={inputClass}
                            />
                        </label>
                    </CardBody>
                </Card>
            </div>

            <Card>
                <CardHeader title="Reglas de importación" />
                <CardBody className="flex flex-col gap-6">
                    <div>
                        <div className="text-xs font-semibold mb-2.5">Estados de contrato a importar</div>
                        <div className="flex flex-wrap gap-2.5">
                            {ALL_STATUSES.map(st => {
                                const active = allowedStatuses.includes(st)
                                return (
                                    <label
                                        key={st}
                                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                                            active ? 'border-primary bg-primary/10' : 'border-border bg-bg'
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={active}
                                            onChange={() => toggleItem(allowedStatuses, st, setAllowedStatuses)}
                                            className="accent-primary"
                                        />
                                        <Badge tone={CONTRACT_STATUS_TONE[st] ?? 'mute'}>{st}</Badge>
                                    </label>
                                )
                            })}
                        </div>
                    </div>

                    <div>
                        <div className="text-xs font-semibold mb-2.5">Excluir por tipo de documento</div>
                        <div className="flex flex-wrap gap-2.5">
                            {ALL_DOC_TYPES.map(dt => {
                                const excluded = excludedDocTypes.includes(dt)
                                return (
                                    <label
                                        key={dt}
                                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                                            excluded ? 'border-amber-500/50 bg-amber-500/10' : 'border-border bg-bg'
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={excluded}
                                            onChange={() => toggleItem(excludedDocTypes, dt, setExcludedDocTypes)}
                                            className="accent-primary"
                                        />
                                        <span className="font-mono font-bold">{dt}</span>
                                        <span className="text-muted">{dt === 'J' || dt === 'G' ? 'Jurídico' : 'Natural'}</span>
                                    </label>
                                )
                            })}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <label className="flex flex-col gap-1.5 text-xs font-semibold">
                            Ventana de importación
                            <select value={windowMonths} onChange={e => setWindowMonths(e.target.value)} className={inputClass}>
                                <option value="">Sin límite de meses</option>
                                <option value="3">Últimos 3 meses</option>
                                <option value="6">Últimos 6 meses</option>
                                <option value="9">Últimos 9 meses</option>
                                <option value="12">Últimos 12 meses</option>
                            </select>
                        </label>

                        <label className="flex flex-col gap-1.5 text-xs font-semibold">
                            Máximo de cuotas recientes por contrato
                            <input
                                type="number"
                                min={1}
                                max={60}
                                value={maxRecentInstallments}
                                onChange={e => setMaxRecentInstallments(e.target.value)}
                                placeholder="Todas"
                                className={inputClass}
                            />
                        </label>

                        <label className="flex flex-col gap-1.5 text-xs font-semibold">
                            Días de gracia para corte
                            <input
                                type="number"
                                min={0}
                                max={60}
                                value={graceDays}
                                onChange={e => setGraceDays(e.target.value)}
                                required
                                className={inputClass}
                            />
                        </label>

                        <label className="flex flex-col gap-1.5 text-xs font-semibold">
                            Tope de facturas nuevas por corrida
                            <input
                                type="number"
                                min={1}
                                value={maxNewInvoices}
                                onChange={e => setMaxNewInvoices(e.target.value)}
                                placeholder="Sin límite"
                                className={inputClass}
                            />
                        </label>

                        <label className="flex flex-col gap-1.5 text-xs font-semibold">
                            Tope de monto nuevo por corrida (USD)
                            <input
                                type="number"
                                min={1}
                                step="0.01"
                                value={maxNewAmountUsd}
                                onChange={e => setMaxNewAmountUsd(e.target.value)}
                                placeholder="Sin límite"
                                className={inputClass}
                            />
                        </label>
                    </div>
                </CardBody>
            </Card>

            <Card>
                <CardHeader title="Programación automática" />
                <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                    <label className="inline-flex items-center gap-2.5 text-sm font-medium cursor-pointer">
                        <input
                            type="checkbox"
                            checked={autoRunEnabled}
                            onChange={e => setAutoRunEnabled(e.target.checked)}
                            className="accent-primary w-4 h-4"
                        />
                        Habilitar sincronización diaria automática
                    </label>
                    <label className="flex flex-col gap-1.5 text-xs font-semibold sm:max-w-xs">
                        Hora de ejecución (America/Caracas)
                        <input
                            type="time"
                            value={autoRunTime}
                            onChange={e => setAutoRunTime(e.target.value)}
                            required
                            className={inputClass}
                        />
                    </label>
                </CardBody>
            </Card>
        </form>
    )
}