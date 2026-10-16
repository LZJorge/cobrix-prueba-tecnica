import { Group, HalfMoon, HomeSimple, OpenNewWindow, Refresh, Settings, SunLight } from 'iconoir-react'
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { ConfigPage } from './pages/ConfigPage.tsx'
import { CustomersPage } from './pages/CustomersPage.tsx'
import { DashboardPage } from './pages/DashboardPage.tsx'
import { DossierPage } from './pages/DossierPage.tsx'
import { RunDetailPage } from './pages/RunDetailPage.tsx'
import { SyncPage } from './pages/SyncPage.tsx'

const NAV_ITEMS = [
    { path: '/', label: 'Resumen', icon: HomeSimple },
    { path: '/clientes', label: 'Clientes', icon: Group },
    { path: '/sincronizacion', label: 'Sincronización', icon: Refresh },
    { path: '/configuracion', label: 'Configuración', icon: Settings },
] as const

function App() {
    const [path, setPath] = useState(() => window.location.pathname.replace(/\/+$/, '') || '/')
    const [dark, setDark] = useState(() => {
        const saved = localStorage.getItem('cobrix_theme')
        return saved ? saved === 'dark' : true
    })

    useEffect(() => {
        const onPopState = () => setPath(window.location.pathname.replace(/\/+$/, '') || '/')
        window.addEventListener('popstate', onPopState)
        return () => window.removeEventListener('popstate', onPopState)
    }, [])

    useEffect(() => {
        document.documentElement.classList.toggle('dark', dark)
        localStorage.setItem('cobrix_theme', dark ? 'dark' : 'light')
    }, [dark])

    const navigate = (to: string) => {
        window.history.pushState({}, '', to)
        setPath(to.replace(/\/+$/, '') || '/')
        window.scrollTo(0, 0)
    }

    const activeNav =
        path.startsWith('/clientes')
            ? '/clientes'
            : path.startsWith('/sincronizacion')
              ? '/sincronizacion'
              : path

    let content
    if (path === '/') {
        content = <DashboardPage navigate={navigate} />
    } else if (path === '/clientes') {
        content = <CustomersPage navigate={navigate} />
    } else if (path.startsWith('/clientes/')) {
        const id = decodeURIComponent(path.slice('/clientes/'.length))
        content = <DossierPage customerId={id} navigate={navigate} />
    } else if (path === '/sincronizacion') {
        content = <SyncPage navigate={navigate} />
    } else if (path.startsWith('/sincronizacion/corridas/')) {
        const runId = Number(path.slice('/sincronizacion/corridas/'.length))
        content = <RunDetailPage runId={runId} navigate={navigate} />
    } else if (path === '/configuracion') {
        content = <ConfigPage />
    } else {
        content = (
            <div className="flex flex-col items-center justify-center h-full min-h-[50vh] text-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-surface border border-border flex items-center justify-center shadow-sm">
                    <span className="text-2xl font-bold text-muted">404</span>
                </div>
                <div>
                    <h1 className="text-xl font-bold text-fg">Página no encontrada</h1>
                    <p className="text-sm text-muted mt-1 max-w-sm mx-auto">
                        Ésta página no existe o fue movida.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => navigate('/')}
                    className="mt-2 px-4 py-2 bg-primary text-primary-fg text-sm font-semibold rounded-lg shadow-sm hover:opacity-90 transition-opacity cursor-pointer"
                >
                    Volver al Resumen
                </button>
            </div>
        )
    }

    return (
        <div className="min-h-screen flex flex-col md:flex-row bg-bg text-fg">
            <aside className="w-full md:w-60 bg-surface border-b md:border-b-0 md:border-r border-border p-4 flex flex-col gap-6 md:sticky md:top-0 md:h-screen shrink-0">
                <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-primary text-primary-fg font-bold grid place-items-center shadow-xs">
                            C
                        </div>
                        <div>
                            <div className="font-bold text-sm leading-tight">Cobrix</div>
                            <div className="text-[11px] text-muted">Facturación ISP</div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setDark(d => !d)}
                        title={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                        className="p-2 rounded-lg border border-border bg-elevated/60 text-fg hover:bg-elevated cursor-pointer transition-colors"
                    >
                        {dark ? <SunLight className="w-4 h-4" /> : <HalfMoon className="w-4 h-4" />}
                    </button>
                </div>

                <nav className="flex md:flex-col gap-1.5 overflow-x-auto">
                    {NAV_ITEMS.map(item => {
                        const Icon = item.icon
                        const active = activeNav === item.path
                        return (
                            <a
                                key={item.path}
                                href={item.path}
                                onClick={e => {
                                    e.preventDefault()
                                    navigate(item.path)
                                }}
                                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
                                    active
                                        ? 'bg-primary text-primary-fg shadow-xs'
                                        : 'text-muted hover:text-fg hover:bg-elevated'
                                }`}
                            >
                                <Icon className="w-4 h-4 shrink-0" />
                                {item.label}
                            </a>
                        )
                    })}
                </nav>

                <div className="hidden md:flex flex-col gap-1 mt-auto pt-4 border-t border-border px-2 text-xs text-muted">
                    <a
                        href="/api/cobrix/enunciado"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-between py-1 text-muted hover:text-fg transition-colors"
                    >
                        <span>Enunciado</span>
                        <OpenNewWindow className="w-3.5 h-3.5" />
                    </a>
                </div>
            </aside>

            <main className="flex-1 p-5 md:p-8 max-w-6xl w-full mx-auto">{content}</main>
        </div>
    )
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>,
)