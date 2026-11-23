import { useCallback, useEffect, useMemo, useState } from 'react'
import ChannelPlayer from './ChannelPlayer'
import { Activity, AlertCircle, ArrowDownToLine, ArrowDownUp, ArrowUpRight, BadgeCheck, BarChart3, Check, ChevronDown, CircleHelp, Clock3, Copy, Download, ExternalLink, FileClock, Film, Globe2, LayoutDashboard, ListVideo, LoaderCircle, LogOut, Menu, MoreHorizontal, Play, Plus, Radio, RefreshCw, Search, Settings, ShieldCheck, Signal, SlidersHorizontal, Trash2, Tv, Upload, X } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from './api'

const nav = [
  { id: 'dashboard', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'channels', label: 'Canais', icon: Tv },
  { id: 'sources', label: 'Fontes', icon: Radio },
  { id: 'history', label: 'Histórico', icon: FileClock },
  { id: 'settings', label: 'Configurações', icon: Settings },
]
const humanDate = value => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'
const number = value => new Intl.NumberFormat('pt-BR').format(Number(value || 0))
const percent = value => `${Number(value || 0).toFixed(1).replace('.', ',')}%`
const initials = value => (value || 'TV').split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase()

function useLoad(loader, dependencies = []) {
  const [state, setState] = useState({ data: null, loading: true, error: '' })
  const refresh = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: '' }))
    try { setState({ data: await loader(), loading: false, error: '' }) }
    catch (error) { setState(s => ({ ...s, loading: false, error: error.message })) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies)
  useEffect(() => { refresh() }, [refresh])
  return { ...state, refresh }
}

function Login({ onLogin }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try { await api.post('/api/auth/login', { password }); await onLogin() }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  return <main className="login-wrap"><section className="login-card"><Brand /><span className="eyebrow">ÁREA RESTRITA</span><h1>Acesse seu painel</h1><p>Entre com sua senha administrativa para gerenciar fontes e transmissões.</p><form onSubmit={submit}><label htmlFor="password">Senha administrativa</label><input autoFocus id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required/><button className="button primary full" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17}/> : <ShieldCheck size={17}/>} Entrar com segurança</button>{error && <p className="error-text">{error}</p>}</form><div className="login-note"><ShieldCheck size={15}/> Sessão protegida por cookie seguro</div></section><p className="login-foot">IPTV Manager <span>·</span> Conteúdo público e autorizado</p></main>
}

function Brand() { return <div className="brand"><div className="brand-mark"><Signal size={20}/></div><span>iptv<span className="brand-light">manager</span></span></div> }

function App() {
  const [authenticated, setAuthenticated] = useState(null)
  const [page, setPage] = useState('dashboard')
  const [mobileNav, setMobileNav] = useState(false)
  const [toast, setToast] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [tick, setTick] = useState(0)
  const notify = message => { setToast(message); window.setTimeout(() => setToast(''), 3200) }
  const loadSession = useCallback(async () => { try { const session = await api.get('/api/auth/session'); setAuthenticated(Boolean(session.authenticated)) } catch { setAuthenticated(false) } }, [])
  useEffect(() => { loadSession(); const logout = () => setAuthenticated(false); window.addEventListener('iptv:unauthorized', logout); return () => window.removeEventListener('iptv:unauthorized', logout) }, [loadSession])
  async function runSync() {
    if (syncing) return
    setSyncing(true)
    try { await api.post('/api/refresh', {}); notify('Verificação enviada ao GitHub Actions.'); window.setTimeout(() => setTick(x => x + 1), 1800) }
    catch (e) { notify(e.message) }
    finally { setSyncing(false) }
  }
  async function logout() { try { await api.post('/api/auth/logout', {}) } finally { setAuthenticated(false) } }
  if (authenticated === null) return <main className="boot"><LoaderCircle className="spin"/><span>Conectando ao painel…</span></main>
  if (!authenticated) return <Login onLogin={loadSession}/>
  const active = nav.find(item => item.id === page)
  return <div className="app-shell">
    {mobileNav && <button className="scrim" aria-label="Fechar menu" onClick={() => setMobileNav(false)}/>}
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}><Brand/><div className="workspace"><div className="workspace-icon"><Globe2 size={17}/></div><div><b>Minha operação</b><small>Ambiente seguro</small></div><ChevronDown size={15}/></div><span className="nav-caption">MENU PRINCIPAL</span><nav>{nav.map(item => <button key={item.id} onClick={() => { setPage(item.id); setMobileNav(false) }} className={`nav-item ${page === item.id ? 'selected' : ''}`}><item.icon size={18}/><span>{item.label}</span>{item.id === 'channels' && <span className="nav-tag">LIVE</span>}</button>)}</nav><div className="sidebar-bottom"><div className="plan-card"><div className="plan-icon"><ShieldCheck size={17}/></div><b>Fontes autorizadas</b><p>Gerencie transmissões públicas com segurança.</p><button onClick={() => setPage('sources')}>Ver fontes <ArrowUpRight size={14}/></button></div><div className="profile"><div className="avatar">AD</div><div className="profile-meta"><b>Administrador</b><small>Conta protegida</small></div><button className="icon-button" onClick={logout} title="Sair"><LogOut size={17}/></button></div></div></aside>
    <main className="main-area"><header className="topbar"><div className="top-left"><button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Abrir menu"><Menu size={20}/></button><div className="breadcrumbs"><span>Painel</span><span className="crumb-slash">/</span><b>{active.label}</b></div></div><div className="top-actions"><div className="live-pill"><span className="pulse"/> Sistema operacional</div><button className="button sync-button" onClick={runSync} disabled={syncing}>{syncing ? <LoaderCircle size={16} className="spin"/> : <RefreshCw size={16}/>} Atualizar agora</button></div></header>
      {page === 'dashboard' && <Dashboard key={tick} onNavigate={setPage} onNotify={notify}/>}
      {page === 'channels' && <Channels onNotify={notify}/>}
      {page === 'sources' && <Sources onNotify={notify}/>}
      {page === 'history' && <History/>}
      {page === 'settings' && <SettingsPage onNotify={notify}/>}
      <footer className="footer"><span>IPTV Manager <i>·</i> Conteúdo público e autorizado</span><span><span className="pulse"/> Serviços conectados</span></footer>
    </main>{toast && <div className="toast"><Check size={17}/>{toast}<button aria-label="Fechar" onClick={() => setToast('')}><X size={15}/></button></div>}
  </div>
}

function PageHeading({ eyebrow, title, description, action }) { return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div> }
function Loading({ error, retry }) { return <div className="loading-state">{error ? <><AlertCircle size={20}/><span>{error}</span>{retry && <button className="text-button" onClick={retry}>Tentar novamente</button>}</> : <><LoaderCircle className="spin" size={20}/><span>Carregando dados…</span></>}</div> }
function StatCard({ label, value, note, icon: Icon, tone = '', trend }) { return <article className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={19}/></div><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-note">{trend && <span className="trend"><ArrowUpRight size={13}/>{trend}</span>}{note}</div></article> }
function Dashboard({ onNavigate, onNotify }) {
  const { data, loading, error, refresh } = useLoad(() => api.get('/api/dashboard'), [])
  if (loading || error) return <><PageHeading eyebrow="CENTRAL DE CONTROLE" title="Visão geral" description="Acompanhe a saúde e disponibilidade das suas transmissões."/><Loading error={error} retry={refresh}/></>
  const stats = data.stats || data
  const chart = data.availabilityHistory || data.history || []
  const recent = data.recentChecks || data.recent || []
  const categories = data.categories || []
  const total = stats.totalChannels ?? stats.total ?? 0
  const available = stats.availability ?? stats.availabilityPercent ?? (total ? (stats.online || 0) / total * 100 : 0)
  return <div className="page-content"><PageHeading eyebrow="CENTRAL DE CONTROLE" title="Visão geral" description="Acompanhe a saúde e disponibilidade das suas transmissões." action={<button className="button secondary" onClick={() => onNavigate('channels')}><ListVideo size={16}/> Ver canais <ArrowUpRight size={14}/></button>}/>
    <div className="stat-grid"><StatCard label="Total de canais" value={number(total)} icon={Tv} note={`${number(stats.categories)} categorias`} tone="violet"/><StatCard label="Online agora" value={number(stats.online)} icon={Signal} note="Verificados recentemente" tone="green" trend={stats.onlineTrend}/><StatCard label="Offline" value={number(stats.offline)} icon={Activity} note="Precisam de atenção" tone="red"/><StatCard label="Pendentes" value={number(stats.pending)} icon={Clock3} note="Aguardando verificação" tone="amber"/></div>
    <div className="dashboard-grid"><section className="panel availability-panel"><div className="panel-heading"><div><h2>Disponibilidade</h2><p>Saúde da rede ao longo do tempo</p></div><span className="period-select">Últimos 7 dias <ChevronDown size={14}/></span></div><div className="availability-summary"><strong>{percent(available)}</strong><span className="trend"><ArrowUpRight size={14}/>{data.availabilityChange || 'Disponibilidade atual'}</span><small>Taxa de canais online</small></div>{chart.length ? <div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chart} margin={{ top: 16, right: 8, bottom: 0, left: -18 }}><defs><linearGradient id="fillAvail" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b7f36b" stopOpacity={0.22}/><stop offset="95%" stopColor="#b7f36b" stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#242832" strokeDasharray="3 5"/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#8d95a5', fontSize: 11 }}/><YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#8d95a5', fontSize: 11 }} tickFormatter={v => `${v}%`}/><Tooltip contentStyle={{ background: '#151922', border: '1px solid #2b303b', borderRadius: 8, color: '#f3f4f6' }} formatter={v => [`${v}%`, 'Disponibilidade']}/><Area type="monotone" dataKey="availability" stroke="#b7f36b" strokeWidth={2.5} fill="url(#fillAvail)"/></AreaChart></ResponsiveContainer></div> : <Empty icon={BarChart3} title="Sem histórico de disponibilidade" detail="Os dados aparecerão após as primeiras verificações."/>}</section>
      <section className="panel category-panel"><div className="panel-heading"><div><h2>Por categoria</h2><p>Distribuição dos canais</p></div><button className="icon-button" onClick={() => onNavigate('channels')}><MoreHorizontal size={18}/></button></div>{categories.length ? <div className="category-list">{categories.slice(0, 6).map((row, i) => <div className="category-row" key={row.name}><span className={`category-dot color-${i % 5}`}/><span className="category-name">{row.name}</span><div className="category-track"><i style={{ width: `${total ? Math.min(100, row.count / total * 100) : 0}%` }}/></div><b>{number(row.count)}</b></div>)}</div> : <Empty icon={Film} title="Nenhuma categoria" detail="Categorias aparecem após importar uma fonte."/>}<button className="subtle-link" onClick={() => onNavigate('channels')}>Explorar categorias <ArrowUpRight size={14}/></button></section></div>
    <section className="panel recent-panel"><div className="panel-heading"><div><h2>Atividade recente</h2><p>Últimas verificações de transmissão</p></div><button className="text-button" onClick={() => onNavigate('history')}>Ver histórico completo <ArrowUpRight size={14}/></button></div>{recent.length ? <div className="table-wrap"><table><thead><tr><th>CANAL</th><th>FONTE</th><th>STATUS</th><th>ÚLTIMA VERIFICAÇÃO</th><th>DURAÇÃO</th></tr></thead><tbody>{recent.slice(0, 5).map((row, i) => <tr key={row.id || `${row.name}-${i}`}><td><div className="channel-cell"><div className="channel-logo small">{row.logo ? <img src={row.logo} alt=""/> : initials(row.name)}</div><b>{row.name}</b></div></td><td className="muted-cell">{row.sourceName || row.source || '—'}</td><td><Status status={row.status}/></td><td className="muted-cell">{humanDate(row.checkedAt || row.lastChecked)}</td><td className="muted-cell">{row.duration || '—'}</td></tr>)}</tbody></table></div> : <Empty icon={Activity} title="Nenhuma atividade" detail="O histórico será exibido após uma execução real do verificador."/>}</section>
    <section className="status-strip"><div className="status-strip-icon"><BadgeCheck size={18}/></div><div><b>Última atualização da lista</b><span>{humanDate(data.lastUpdated || stats.lastUpdated)}</span></div><span className="strip-divider"/><div><b>Próxima verificação automática</b><span>{data.nextScheduled ? humanDate(data.nextScheduled) : 'Conforme agenda do GitHub Actions'}</span></div><button className="icon-button" onClick={() => onNotify('A agenda automática é configurada no GitHub Actions.')} title="Informação"><CircleHelp size={17}/></button></section>
  </div>
}
function Status({ status }) { const raw = String(status || 'pending').toLowerCase(); const key = raw.includes('online') || raw === 'ok' ? 'online' : raw.includes('offline') || raw === 'error' ? 'offline' : 'pending'; const label = key === 'online' ? 'Online' : key === 'offline' ? 'Offline' : 'Pendente'; return <span className={`status-badge ${key}`}><i/>{label}</span> }
function RunStatus({ status }) { const key = status === 'success' ? 'online' : status === 'failure' ? 'offline' : 'pending'; const label = status === 'success' ? 'Concluída' : status === 'failure' ? 'Falhou' : 'Parcial'; return <span className={`status-badge ${key}`}><i/>{label}</span> }
function Empty({ icon: Icon, title, detail, action }) { return <div className="empty"><div><Icon size={19}/></div><b>{title}</b><span>{detail}</span>{action}</div> }

function Channels({ onNotify }) {
  const [selected, setSelected] = useState(null)
  const closePlayer = useCallback(() => setSelected(null), [])
  const [search, setSearch] = useState(''); const [status, setStatus] = useState(''); const [category, setCategory] = useState(''); const [source, setSource] = useState(''); const [page, setPage] = useState(1)
  const [settledSearch, setSettledSearch] = useState(search)
  useEffect(() => { const timer = window.setTimeout(() => setSettledSearch(search), 300); return () => window.clearTimeout(timer) }, [search])
  const query = useMemo(() => new URLSearchParams({ ...(settledSearch && { q: settledSearch }), ...(status && { status }), ...(category && { category }), ...(source && { source }), page: String(page) }), [settledSearch, status, category, source, page])
  const { data, loading, error, refresh } = useLoad(() => api.get(`/api/channels?${query}`), [query.toString()])
  const channels = Array.isArray(data) ? data : data?.channels || []
  const categories = data?.filters?.categories || data?.categories || []
  const sources = data?.filters?.sources || []
  const pages = data?.pagination?.pages || data?.pages || 1
  return <div className="page-content"><PageHeading eyebrow="CATÁLOGO" title="Canais" description="Pesquise e acompanhe os canais de todas as fontes conectadas." action={<div className="channel-heading-actions"><a className="button primary" href="/playlist.m3u" download="iptv-manager.m3u"><ArrowDownToLine size={16}/> Baixar M3U</a><button className="button secondary" onClick={async () => { try { const response = await fetch('/playlist.m3u'); if (!response.ok) throw new Error(`Falha HTTP ${response.status}`); await navigator.clipboard.writeText(await response.text()); onNotify('Playlist copiada para a área de transferência.') } catch (e) { onNotify(`Não foi possível copiar a playlist: ${e.message}`) } }}><Copy size={16}/> Copiar playlist</button></div>}/>
    <section className="panel list-panel"><div className="toolbar"><div className="search-box"><Search size={17}/><input placeholder="Buscar canal…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}/><kbd>⌘ K</kbd></div><div className="filters"><SlidersHorizontal size={16}/><select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}><option value="">Todos os status</option><option value="online">Online</option><option value="offline">Offline</option><option value="pending">Pendente</option></select><select value={category} onChange={e => { setCategory(e.target.value); setPage(1) }}><option value="">Todas categorias</option>{categories.map(x => <option key={x.id || x.name} value={x.name || x}>{x.name || x}</option>)}</select><select value={source} onChange={e => { setSource(e.target.value); setPage(1) }}><option value="">Todas as fontes</option>{sources.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div></div>{loading || error ? <Loading error={error} retry={refresh}/> : channels.length ? <><div className="table-wrap"><table className="channels-table"><thead><tr><th><input type="checkbox" aria-label="Selecionar todos" disabled/></th><th>NOME DO CANAL <ArrowDownUp size={12}/></th><th>CATEGORIA</th><th>FONTE</th><th>STATUS</th><th>ÚLTIMA VERIFICAÇÃO</th><th></th></tr></thead><tbody>{channels.map((row, i) => <tr key={row.id || i}><td><input type="checkbox" aria-label={`Selecionar ${row.name}`} disabled/></td><td><div className="channel-cell"><div className="channel-logo">{row.logo ? <img src={row.logo} alt="" loading="lazy"/> : initials(row.name)}</div><div><button type="button" className="channel-name-button" aria-label={`Reproduzir ${row.name || 'canal sem nome'}`} onClick={() => setSelected(row)}>{row.name || 'Canal sem nome'}</button><small>{row.groupTitle || row.group || row.category || 'Sem categoria'}</small></div></div></td><td><span className="table-tag">{row.category || row.groupTitle || row.group || 'Outros'}</span></td><td className="muted-cell">{row.sourceName || row.source || '—'}</td><td><Status status={row.status}/></td><td className="muted-cell">{humanDate(row.checkedAt || row.lastChecked)}</td><td><button className="icon-button" title="Mais opções" onClick={() => onNotify('A edição de canais é feita na fonte M3U original.')}><MoreHorizontal size={17}/></button></td></tr>)}</tbody></table></div><div className="pagination"><span>Exibindo {channels.length} de {number(data?.pagination?.total ?? data?.total ?? channels.length)} canais</span><div><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button><span className="page-number">{page}</span><button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Próxima</button></div></div></> : <Empty icon={Tv} title="Nenhum canal encontrado" detail="Adicione uma fonte M3U autorizada ou ajuste os filtros." action={<button className="button secondary" onClick={() => { setSearch(''); setStatus(''); setCategory(''); setSource(''); setPage(1) }}>Limpar filtros</button>}/>}</section>
    {selected && <ChannelPlayer channel={selected} onClose={closePlayer}/>}
  </div>
}

function Sources({ onNotify }) {
  const { data, loading, error, refresh } = useLoad(async () => { const [sources, settings] = await Promise.all([api.get('/api/sources'), api.get('/api/dashboard').catch(() => ({}))]); return { sources: Array.isArray(sources) ? sources : sources.sources || [], summary: settings.stats || settings } }, [])
  const [modal, setModal] = useState(null); const [busyId, setBusyId] = useState('')
  async function remove(row) { if (!window.confirm(`Remover a fonte “${row.name}”?`)) return; setBusyId(row.id); try { await api.delete(`/api/sources/${encodeURIComponent(row.id)}`); onNotify('Fonte removida.'); refresh() } catch (e) { onNotify(e.message) } finally { setBusyId('') } }
  async function toggle(row) { try { await api.put(`/api/sources/${encodeURIComponent(row.id)}`, { ...row, enabled: !row.enabled }); onNotify(row.enabled ? 'Fonte pausada.' : 'Fonte ativada.'); refresh() } catch (e) { onNotify(e.message) } }
  return <div className="page-content"><PageHeading eyebrow="ORIGENS DE CONTEÚDO" title="Fontes" description="Conecte playlists M3U/M3U8 públicas e autorizadas." action={<button className="button primary" onClick={() => setModal({})}><Plus size={17}/> Adicionar fonte</button>}/>
    {loading || error ? <section className="panel"><Loading error={error} retry={refresh}/></section> : <><div className="stat-grid source-stats"><StatCard label="Fontes conectadas" value={number(data.sources.length)} icon={Radio} note="Playlists cadastradas" tone="violet"/><StatCard label="Fontes ativas" value={number(data.sources.filter(x => x.enabled !== false).length)} icon={Signal} note="Incluídas na sincronização" tone="green"/><StatCard label="Total de canais" value={number(data.summary.totalChannels ?? data.summary.total)} icon={Tv} note="Agregados das fontes" tone="amber"/><StatCard label="Removidas por falhas" value={number(data.summary.removedSources)} icon={Trash2} note="Após 2 falhas consecutivas" tone="red"/></div><section className="panel sources-panel"><div className="panel-heading"><div><h2>Suas fontes</h2><p>Fontes são verificadas a cada 12 horas</p></div><span className="secure-label"><ShieldCheck size={15}/> URLs e arquivos privados</span></div>{data.sources.length ? <div className="source-list">{data.sources.map((row, i) => <article className="source-row" key={row.id || i}><div className="source-logo"><Radio size={20}/></div><div className="source-info"><div className="source-title"><b>{row.name}</b><span className={`status-badge ${row.enabled === false ? 'pending' : 'online'}`}><i/>{row.enabled === false ? 'Pausada' : 'Ativa'}</span></div><span className="source-url">{row.type === 'file' ? 'Arquivo local salvo (R2)' : row.url || 'URL protegida'}</span><div className="source-meta"><span><ListVideo size={13}/>{number(row.channelCount)} canais</span><span><Clock3 size={13}/>Verificada {row.lastChecked ? humanDate(row.lastChecked) : 'ainda não'}</span><span className={row.consecutiveFailures ? 'bad-meta' : ''}><Activity size={13}/>{row.consecutiveFailures || 0} falhas seguidas</span></div></div><div className="source-actions"><button className="button quiet" onClick={() => toggle(row)}>{row.enabled === false ? 'Ativar' : 'Pausar'}</button><button className="icon-button" title="Editar fonte" onClick={() => setModal(row)}><Settings size={16}/></button><button className="icon-button danger-hover" title="Remover fonte" disabled={busyId === row.id} onClick={() => remove(row)}><Trash2 size={16}/></button></div></article>)}</div> : <Empty icon={Radio} title="Nenhuma fonte cadastrada" detail="Adicione uma playlist pública para começar a validar transmissões." action={<button className="button primary" onClick={() => setModal({})}><Plus size={16}/> Adicionar primeira fonte</button>}/>}</section></>}
    {modal && <SourceModal source={modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); onNotify(modal.id ? 'Fonte atualizada.' : 'Fonte cadastrada.') }}/>}
  </div>
}
function SourceModal({ source, onClose, onSaved }) {
  const [form, setForm] = useState({ name: source.name || '', url: source.url || '', epgUrl: source.epgUrl || '', enabled: source.enabled !== false, ...(source.id && { id: source.id }) })
  const [mode, setMode] = useState(source.type === 'file' ? 'file' : 'url')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      if (source.id) await api.put(`/api/sources/${encodeURIComponent(source.id)}`, form)
      else if (mode === 'file') { const body = new FormData(); body.set('name', form.name); body.set('epgUrl', form.epgUrl); body.set('file', file); await api.upload('/api/sources/upload', body) }
      else await api.post('/api/sources', form)
      onSaved()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><section className="modal"><div className="modal-heading"><div className="modal-icon"><Radio size={19}/></div><div><h2>{source.id ? 'Editar fonte' : 'Adicionar fonte'}</h2><p>Use playlist pública ou arquivo que você tem autorização para usar.</p></div><button className="icon-button" onClick={onClose}><X size={19}/></button></div><form onSubmit={submit}>
    <label>Nome da fonte<input required maxLength="120" placeholder="Ex.: TV Pública Brasil" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></label>
    {!source.id && <div className="source-mode" role="group" aria-label="Origem da playlist"><button type="button" className={mode === 'url' ? 'selected' : ''} onClick={() => setMode('url')}><Globe2 size={15}/> URL online</button><button type="button" className={mode === 'file' ? 'selected' : ''} onClick={() => setMode('file')}><Upload size={15}/> Arquivo local</button></div>}
    {source.id && source.type === 'file' ? <div className="file-kept"><Upload size={16}/> Playlist armazenada em arquivo privado. Edite nome e EPG.</div> : mode === 'url' ? <label>URL da playlist M3U/M3U8<input required type="url" placeholder="https://exemplo.org/playlist.m3u8" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })}/><small>Use apenas fontes públicas ou autorizadas.</small></label> : <label>Arquivo M3U/M3U8<input required type="file" accept=".m3u,.m3u8,audio/x-mpegurl,application/vnd.apple.mpegurl" onChange={e => setFile(e.target.files?.[0] || null)}/><small>UTF-8, máximo 10 MB. O arquivo fica privado. Depois, clique em Atualizar agora para validar no GitHub Actions.</small></label>}
    <label>URL do guia EPG/XMLTV <span className="optional">OPCIONAL</span><input type="url" placeholder="https://exemplo.org/epg.xml" value={form.epgUrl} onChange={e => setForm({ ...form, epgUrl: e.target.value })}/></label>
    {source.id && <label className="check-label"><input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })}/> Incluir fonte nas verificações automáticas</label>}
    {error && <p className="error-text">{error}</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={busy || (!source.id && mode === 'file' && !file)}>{busy ? <LoaderCircle size={16} className="spin"/> : <Check size={16}/>} {source.id ? 'Salvar alterações' : 'Adicionar fonte'}</button></div></form></section></div>
}

function History() {
  const { data, loading, error, refresh } = useLoad(() => api.get('/api/history'), [])
    const records = Array.isArray(data) ? data : data?.runs || data?.history || []
  const removed = Array.isArray(data?.removed) ? data.removed : []
  return <div className="page-content"><PageHeading eyebrow="LOGS DO SISTEMA" title="Histórico" description="Execuções, falhas e alterações da sua playlist."/>{loading || error ? <section className="panel"><Loading error={error} retry={refresh}/></section> : <><div className="stat-grid"><StatCard label="Verificações realizadas" value={number(data?.summary?.totalChecks ?? records.length)} icon={Activity} note="Execuções registradas" tone="violet"/><StatCard label="Falhas registradas" value={number(data?.summary?.failures)} icon={AlertCircle} note="Streams ou fontes com falha" tone="red"/><StatCard label="Canais removidos" value={number(data?.summary?.removedChannels)} icon={Trash2} note="Após falhas consecutivas" tone="amber"/><StatCard label="Última execução" value={records.length ? humanDate(records[0].startedAt || records[0].createdAt) : '—'} icon={Clock3} note="Horário do servidor" tone="green"/></div><section className="panel recent-panel"><div className="panel-heading"><div><h2>Execuções recentes</h2><p>Registro real recebido do verificador</p></div><button className="icon-button" onClick={refresh} title="Atualizar"><RefreshCw size={16}/></button></div>{records.length ? <div className="table-wrap"><table><thead><tr><th>INÍCIO</th><th>STATUS</th><th>CANAIS VERIFICADOS</th><th>ONLINE</th><th>FALHAS</th><th>DURAÇÃO</th></tr></thead><tbody>{records.map((row, i) => <tr key={row.id || i}><td className="muted-cell">{humanDate(row.startedAt || row.createdAt)}</td><td><RunStatus status={row.status}/></td><td>{number(row.checked ?? row.checkedCount)}</td><td>{number(row.online ?? row.onlineCount)}</td><td>{number(row.failed ?? row.failedCount)}</td><td className="muted-cell">{row.duration || '—'}</td></tr>)}</tbody></table></div> : <Empty icon={FileClock} title="Nenhuma execução registrada" detail="Os logs serão exibidos após uma execução real do GitHub Actions."/>}</section><section className="panel recent-panel"><div className="panel-heading"><div><h2>Canais removidos</h2><p>Canais retirados após falhas consecutivas.</p></div></div>{removed.length ? <div className="table-wrap"><table><thead><tr><th>CANAL</th><th>FONTE</th><th>DATA DA REMOÇÃO</th></tr></thead><tbody>{removed.map((row, i) => <tr key={row.id || i}><td>{row.channel_name || "—"}</td><td className="muted-cell">{row.source_name || "—"}</td><td className="muted-cell">{humanDate(row.removed_at)}</td></tr>)}</tbody></table></div> : <Empty icon={Trash2} title="Nenhum canal removido" detail="Canais removidos após falhas serão listados aqui."/>}</section></>}</div>
}

function SettingsPage({ onNotify }) {
  const { data, loading, error, refresh } = useLoad(() => api.get('/api/settings'), [])
  const [form, setForm] = useState(null); const [busy, setBusy] = useState(false)
  useEffect(() => { if (data) setForm(data.settings || data) }, [data])
  async function save(e) { e.preventDefault(); setBusy(true); try { await api.put('/api/settings', form); onNotify('Configurações salvas.'); refresh() } catch (err) { onNotify(err.message) } finally { setBusy(false) } }
  return <div className="page-content"><PageHeading eyebrow="PREFERÊNCIAS" title="Configurações" description="Ajuste comportamento, disponibilidade e acesso do sistema."/>{loading || error ? <section className="panel"><Loading error={error} retry={refresh}/></section> : <form onSubmit={save} className="settings-layout"><div><section className="panel settings-panel"><div className="panel-heading"><div><h2>Verificação de streams</h2><p>Limites fixos usados pelo verificador no GitHub Actions.</p></div><div className="settings-heading-icon"><SlidersHorizontal size={18}/></div></div><label>Intervalo de atualização<div className="input-with-suffix"><input type="number" min="1" max="24" value={12} disabled/><span>horas</span></div><small>Atualização automática a cada 12 horas.</small></label><label>Timeout por stream<div className="input-with-suffix"><input type="number" min="1" max="30" value={12} disabled/><span>segundos</span></div><small>FFprobe encerra cada verificação após 12 segundos.</small></label><label>Verificações simultâneas<div className="input-with-suffix"><input type="number" min="1" max="5" value={5} disabled/><span>streams</span></div><small>Até 5 processos FFprobe em paralelo.</small></label></section><section className="panel settings-panel"><div className="panel-heading"><div><h2>Playlist e EPG</h2><p>Preferências de exportação para seus aplicativos IPTV.</p></div></div><label>Nome da playlist<input maxLength="80" value={form?.playlistName || ''} placeholder="Minha playlist IPTV" onChange={e => setForm({ ...form, playlistName: e.target.value })}/></label><label>URL XMLTV global <span className="optional">OPCIONAL</span><input type="url" value={form?.epgUrl || ''} placeholder="https://exemplo.org/epg.xml" onChange={e => setForm({ ...form, epgUrl: e.target.value })}/></label></section><div className="save-row"><span><ShieldCheck size={15}/> Configuração salva com segurança</span><button className="button primary" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin"/> : <Check size={16}/>} Salvar configurações</button></div></div><aside className="settings-aside"><div className="settings-aside-icon"><ShieldCheck size={21}/></div><h3>Seus tokens ficam protegidos</h3><p>Credenciais administrativas e tokens de integração permanecem no backend. Eles não são enviados ao navegador.</p><div className="aside-rule"/><div className="aside-row"><span>Autenticação</span><b className="green-text"><i/>Ativa</b></div><div className="aside-row"><span>Processamento</span><b>GitHub Actions</b></div><div className="aside-row"><span>Armazenamento</span><b>Cloudflare D1</b></div><a href="https://github.com" target="_blank" rel="noreferrer">Ver workflow <ExternalLink size={13}/></a></aside></form>}</div>
}

export default App
