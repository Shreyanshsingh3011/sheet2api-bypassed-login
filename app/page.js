'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Sheet, Zap, Lock, Activity, ArrowRight, Plus, Copy, Download, Trash2,
  Database, Globe, Code2, Building2, Wallet, Users, Briefcase, Receipt,
  CheckCircle2, RefreshCw, Eye, EyeOff, LogOut, Sparkles, BarChart3, Search,
  ChevronRight, FileSpreadsheet, KeyRound, PlayCircle, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'

const DEPARTMENTS = [
  { id: 'Operations', icon: Briefcase, color: 'from-blue-500 to-cyan-500' },
  { id: 'Finance', icon: Wallet, color: 'from-emerald-500 to-teal-500' },
  { id: 'HR', icon: Users, color: 'from-pink-500 to-rose-500' },
  { id: 'Billing', icon: Receipt, color: 'from-amber-500 to-orange-500' },
  { id: 'Projects', icon: Building2, color: 'from-violet-500 to-purple-500' },
  { id: 'Custom', icon: Sparkles, color: 'from-indigo-500 to-blue-500' },
]

const api = async (path, opts = {}) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('sf_token') : null
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`/api/${path}`, { ...opts, headers })
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) {
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Request failed')
    return data
  }
  const text = await res.text()
  if (!res.ok) throw new Error(text || 'Request failed')
  return text
}

export default function App() {
  const [user, setUser] = useState(null)
  const [booted, setBooted] = useState(false)
  const [route, setRoute] = useState('landing') // landing | dashboard | new | detail
  const [activeConnector, setActiveConnector] = useState(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState('login')

  useEffect(() => {
    const token = localStorage.getItem('sf_token')
    if (!token) { setBooted(true); return }
    api('auth/me').then(d => { setUser(d.user); setRoute('dashboard') })
      .catch(() => { localStorage.removeItem('sf_token') })
      .finally(() => setBooted(true))
  }, [])

  const logout = () => {
    localStorage.removeItem('sf_token')
    setUser(null)
    setRoute('landing')
    toast.success('Logged out')
  }

  if (!booted) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-6 h-6 animate-spin" /></div>
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav user={user} onLogo={() => setRoute(user ? 'dashboard' : 'landing')}
              onLogin={() => { setAuthMode('login'); setAuthOpen(true) }}
              onSignup={() => { setAuthMode('signup'); setAuthOpen(true) }}
              onLogout={logout}
              onDashboard={() => setRoute('dashboard')} />

      {route === 'landing' && (
        <Landing onStart={() => { if (user) setRoute('new'); else { setAuthMode('signup'); setAuthOpen(true) } }} />
      )}
      {route === 'dashboard' && user && (
        <Dashboard user={user}
          onNew={() => setRoute('new')}
          onOpen={(c) => { setActiveConnector(c); setRoute('detail') }} />
      )}
      {route === 'new' && user && (
        <NewConnector onDone={(c) => { setActiveConnector(c); setRoute('detail') }} onCancel={() => setRoute('dashboard')} />
      )}
      {route === 'detail' && user && activeConnector && (
        <ConnectorDetail connector={activeConnector} onBack={() => setRoute('dashboard')} onDeleted={() => setRoute('dashboard')} />
      )}

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} mode={authMode} setMode={setAuthMode}
        onAuthed={(u) => { setUser(u); setAuthOpen(false); setRoute('dashboard'); toast.success(`Welcome, ${u.name}!`) }} />
    </div>
  )
}

// -------------------- Nav --------------------
function TopNav({ user, onLogo, onLogin, onSignup, onLogout, onDashboard }) {
  return (
    <header className="border-b border-border/60 backdrop-blur sticky top-0 z-40 bg-background/80">
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        <button onClick={onLogo} className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center">
            <Sheet className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-lg tracking-tight">SheetFlow <span className="text-cyan-400">AI</span></span>
        </button>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Button variant="ghost" size="sm" onClick={onDashboard}><BarChart3 className="w-4 h-4 mr-2" /> Dashboard</Button>
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 text-sm">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-xs text-white font-medium">
                  {user.name?.[0]?.toUpperCase()}
                </div>
                <span className="text-muted-foreground">{user.email}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={onLogout}><LogOut className="w-4 h-4" /></Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={onLogin}>Login</Button>
              <Button size="sm" className="bg-gradient-to-r from-indigo-500 to-cyan-500 hover:opacity-90" onClick={onSignup}>Get Started <ArrowRight className="w-4 h-4 ml-1" /></Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

// -------------------- Landing --------------------
function Landing({ onStart }) {
  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.15),transparent_60%),radial-gradient(ellipse_at_bottom,rgba(34,211,238,0.12),transparent_50%)]" />
        <div className="container mx-auto px-4 py-20 lg:py-32 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <Badge variant="outline" className="mb-5 border-cyan-500/40 text-cyan-300 bg-cyan-500/5">
              <Sparkles className="w-3 h-3 mr-1" /> Sheets → APIs in 30 seconds
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
              Turn any Google Sheet into a <span className="bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">secure department API</span>.
            </h1>
            <p className="mt-5 text-lg text-muted-foreground max-w-xl">
              Paste a link. Pick columns. Get a token-protected REST endpoint, Apps Script, and webhook connector your team can plug into any dashboard, BI tool, or AI system. No code.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" className="bg-gradient-to-r from-indigo-500 to-cyan-500 hover:opacity-90" onClick={onStart}>
                Connect a Sheet <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })}>
                See how it works
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
              <span className="flex items-center gap-2"><Lock className="w-4 h-4 text-cyan-400" /> Token-secured endpoints</span>
              <span className="flex items-center gap-2"><Zap className="w-4 h-4 text-cyan-400" /> Live sync</span>
              <span className="flex items-center gap-2"><Code2 className="w-4 h-4 text-cyan-400" /> Apps Script auto-gen</span>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 blur-3xl rounded-3xl" />
            <Card className="relative border-border/60 bg-card/60 backdrop-blur shadow-2xl">
              <CardHeader>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-2 h-2 rounded-full bg-red-500/70" />
                  <div className="w-2 h-2 rounded-full bg-amber-500/70" />
                  <div className="w-2 h-2 rounded-full bg-green-500/70" />
                  <span className="ml-2">finance-pending.api</span>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="text-xs md:text-sm font-mono leading-relaxed text-cyan-200/90 overflow-x-auto">
{`GET /api/public/9f3b7a...

{
  "connector": "Finance Pending",
  "department": "Finance",
  "count": 24,
  "generated_at": "2025-06-09T10:14:22Z",
  "data": [
    {
      "project_id": 101,
      "client": "Acme Co",
      "amount": 18500,
      "status": "Pending"
    },
    { ... }
  ]
}`}
                </pre>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="container mx-auto px-4 py-20 border-t border-border/40">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">From sheet to API in 3 steps</h2>
          <p className="mt-3 text-muted-foreground">No SQL. No glue code. No exposed sheets.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: FileSpreadsheet, title: '1. Paste the link', desc: 'Drop in any Google Sheets URL (public view-only). We auto-detect headers, types, and row counts.' },
            { icon: Building2, title: '2. Pick a department', desc: 'Choose columns, add filters, scope visibility per department — Finance, HR, Operations, custom.' },
            { icon: Globe, title: '3. Use the secure API', desc: 'Get a token-protected JSON endpoint + Apps Script. Plug into any dashboard, BI tool, or AI agent.' },
          ].map((s, i) => (
            <Card key={i} className="border-border/60 bg-card/50 hover:border-cyan-500/40 transition">
              <CardHeader>
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 border border-cyan-500/30 flex items-center justify-center mb-2">
                  <s.icon className="w-5 h-5 text-cyan-300" />
                </div>
                <CardTitle className="text-lg">{s.title}</CardTitle>
                <CardDescription className="text-muted-foreground">{s.desc}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      {/* Features grid */}
      <section className="container mx-auto px-4 py-20 border-t border-border/40">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { icon: Lock, t: 'Token-based security', d: 'Every connector gets a unique secret. Revoke anytime.' },
            { icon: Activity, t: 'Real-time sync', d: 'Live fetch from Google. Always up-to-date.' },
            { icon: Code2, t: 'Apps Script export', d: 'Copy-paste deployable Web App code generated for you.' },
            { icon: Database, t: 'Normalized JSON', d: 'No raw A1:C50 ranges. Clean objects, ready to consume.' },
          ].map((f, i) => (
            <div key={i} className="p-5 rounded-xl border border-border/60 bg-card/40">
              <f.icon className="w-5 h-5 text-cyan-400 mb-3" />
              <h3 className="font-semibold">{f.t}</h3>
              <p className="text-sm text-muted-foreground mt-1">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container mx-auto px-4 py-20 text-center border-t border-border/40">
        <h2 className="text-3xl md:text-4xl font-bold">Ship operational APIs today</h2>
        <p className="mt-3 text-muted-foreground">Free to try. No credit card.</p>
        <Button size="lg" className="mt-6 bg-gradient-to-r from-indigo-500 to-cyan-500" onClick={onStart}>
          Connect your first sheet <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </section>
    </main>
  )
}

// -------------------- Auth Dialog --------------------
function AuthDialog({ open, onOpenChange, mode, setMode, onAuthed }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const path = mode === 'login' ? 'auth/login' : 'auth/signup'
      const body = mode === 'login' ? { email, password } : { email, password, name }
      const data = await api(path, { method: 'POST', body: JSON.stringify(body) })
      localStorage.setItem('sf_token', data.token)
      onAuthed(data.user)
    } catch (err) {
      toast.error(err.message)
    } finally { setLoading(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'login' ? 'Welcome back' : 'Create your account'}</DialogTitle>
          <DialogDescription>
            {mode === 'login' ? 'Login to manage your connectors.' : 'Start building secure sheet APIs in seconds.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {mode === 'signup' && (
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Doe" />
            </div>
          )}
          <div>
            <Label>Email</Label>
            <Input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
          </div>
          <div>
            <Label>Password</Label>
            <div className="relative">
              <Input type={showPw ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
              <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-indigo-500 to-cyan-500">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (mode === 'login' ? 'Login' : 'Sign up')}
          </Button>
          <p className="text-sm text-center text-muted-foreground">
            {mode === 'login' ? (
              <>No account? <button type="button" onClick={() => setMode('signup')} className="text-cyan-400 hover:underline">Sign up</button></>
            ) : (
              <>Already have one? <button type="button" onClick={() => setMode('login')} className="text-cyan-400 hover:underline">Login</button></>
            )}
          </p>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// -------------------- Dashboard --------------------
function Dashboard({ user, onNew, onOpen }) {
  const [stats, setStats] = useState(null)
  const [connectors, setConnectors] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [s, c] = await Promise.all([api('stats'), api('connectors')])
      setStats(s); setConnectors(c.connectors)
    } catch (e) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => connectors.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.department.toLowerCase().includes(search.toLowerCase())
  ), [connectors, search])

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome, {user.name}</h1>
          <p className="text-muted-foreground mt-1">Manage your sheet connectors and department APIs.</p>
        </div>
        <Button onClick={onNew} className="bg-gradient-to-r from-indigo-500 to-cyan-500">
          <Plus className="w-4 h-4 mr-2" /> New Connector
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KPI icon={Database} label="Connectors" value={stats?.connectorsCount ?? '—'} color="text-cyan-400" />
        <KPI icon={Activity} label="API Calls" value={stats?.totalCalls ?? '—'} color="text-emerald-400" />
        <KPI icon={CheckCircle2} label="Active" value={stats?.activeCount ?? '—'} color="text-violet-400" />
        <KPI icon={Building2} label="Departments" value={stats ? Object.keys(stats.byDepartment).length : '—'} color="text-amber-400" />
      </div>

      {/* Connectors table */}
      <Card className="border-border/60">
        <CardHeader className="flex-row flex items-center justify-between space-y-0">
          <div>
            <CardTitle>Your Connectors</CardTitle>
            <CardDescription>Generated secure department APIs</CardDescription>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <FileSpreadsheet className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground mb-4">No connectors yet. Paste a Google Sheet to get started.</p>
              <Button onClick={onNew} className="bg-gradient-to-r from-indigo-500 to-cyan-500"><Plus className="w-4 h-4 mr-2" /> Create connector</Button>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {filtered.map(c => {
                const dept = DEPARTMENTS.find(d => d.id === c.department) || DEPARTMENTS[5]
                const Icon = dept.icon
                return (
                  <button key={c.id} onClick={() => onOpen(c)} className="w-full flex items-center gap-4 py-4 hover:bg-muted/30 px-2 -mx-2 rounded-lg transition text-left">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${dept.color} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{c.name}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="text-xs">{c.department}</Badge>
                        <span>{c.columns?.length || 'all'} cols</span>
                        <span>•</span>
                        <span>{c.callCount || 0} calls</span>
                      </div>
                    </div>
                    <div className="hidden md:block text-xs text-muted-foreground font-mono truncate max-w-xs">
                      /api/public/{c.token.slice(0, 8)}...
                    </div>
                    <Badge variant={c.status === 'active' ? 'default' : 'secondary'} className={c.status === 'active' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : ''}>{c.status}</Badge>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent activity */}
      {stats?.recentActivity?.length > 0 && (
        <Card className="border-border/60 mt-6">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.recentActivity.slice(0, 6).map(a => (
                <div key={a.id} className="flex items-center justify-between text-sm py-1">
                  <span className="text-muted-foreground"><span className="text-foreground font-medium">{a.action}</span> {a.meta?.name ? `— ${a.meta.name}` : ''}</span>
                  <span className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  )
}

function KPI({ icon: Icon, label, value, color }) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="text-2xl font-bold mt-1">{value}</div>
          </div>
          <Icon className={`w-8 h-8 ${color} opacity-80`} />
        </div>
      </CardContent>
    </Card>
  )
}

// -------------------- New Connector flow --------------------
function NewConnector({ onDone, onCancel }) {
  const [step, setStep] = useState(1)
  const [url, setUrl] = useState('')
  const [parsing, setParsing] = useState(false)
  const [sheet, setSheet] = useState(null) // parsed
  const [name, setName] = useState('')
  const [department, setDepartment] = useState('Operations')
  const [selectedCols, setSelectedCols] = useState([])
  const [filterCol, setFilterCol] = useState('')
  const [filterOp, setFilterOp] = useState('')
  const [filterVal, setFilterVal] = useState('')
  const [creating, setCreating] = useState(false)

  const parse = async () => {
    if (!url.trim()) return toast.error('Paste a Google Sheets URL')
    setParsing(true)
    try {
      const data = await api('sheets/parse', { method: 'POST', body: JSON.stringify({ url }) })
      setSheet(data)
      setSelectedCols(data.columns.map(c => c.name))
      setName(`${department} Connector`)
      setStep(2)
    } catch (e) { toast.error(e.message) }
    finally { setParsing(false) }
  }

  const create = async () => {
    if (!name.trim()) return toast.error('Give it a name')
    setCreating(true)
    try {
      const body = {
        name, department, sheetUrl: url, sheetId: sheet.sheetId, gid: sheet.gid,
        columns: selectedCols,
        filter: filterCol && filterOp ? { column: filterCol, operator: filterOp, value: filterVal } : null,
      }
      const data = await api('connectors', { method: 'POST', body: JSON.stringify(body) })
      toast.success('Connector created! 🎉')
      onDone(data.connector)
    } catch (e) { toast.error(e.message) }
    finally { setCreating(false) }
  }

  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      <button onClick={onCancel} className="text-sm text-muted-foreground hover:text-foreground mb-4">← Back to dashboard</button>
      <h1 className="text-3xl font-bold mb-2">New Connector</h1>
      <p className="text-muted-foreground mb-8">Turn a Google Sheet into a department API in two steps.</p>

      <div className="flex items-center gap-2 mb-8 text-sm">
        <StepDot n={1} active={step === 1} done={step > 1} label="Connect Sheet" />
        <div className="flex-1 h-px bg-border" />
        <StepDot n={2} active={step === 2} done={false} label="Configure & Generate" />
      </div>

      {step === 1 && (
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Paste a Google Sheets link</CardTitle>
            <CardDescription>
              Share your sheet as <strong>"Anyone with the link can view"</strong>, then paste the URL below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=0" />
            <div className="flex gap-2">
              <Button onClick={parse} disabled={parsing} className="bg-gradient-to-r from-indigo-500 to-cyan-500">
                {parsing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Reading sheet…</> : <>Read Sheet <ArrowRight className="w-4 h-4 ml-2" /></>}
              </Button>
              <Button variant="outline" onClick={() => setUrl('https://docs.google.com/spreadsheets/d/1zT-RFK8gZWLwjwDp_dxhdYLeKHGn--Ke0pQ7H5LP00g/edit?usp=sharing')}>
                Use sample sheet
              </Button>
            </div>
            <div className="text-xs text-muted-foreground border border-dashed border-border/60 rounded-md p-3 mt-2">
              <strong>Tip:</strong> In Google Sheets click <em>Share → General access → Anyone with the link → Viewer</em>. SheetFlow reads structure via Google's public visualization endpoint — your sheet never leaves Google's servers.
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && sheet && (
        <div className="space-y-6">
          {/* Detected structure */}
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <CardTitle className="text-base">Sheet detected — {sheet.rowCount} rows × {sheet.columns.length} columns</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60">
                      {sheet.columns.map(c => (
                        <th key={c.id} className="text-left py-2 px-3 font-medium">
                          {c.name} <Badge variant="outline" className="ml-1 text-[10px]">{c.type}</Badge>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.preview.map((row, i) => (
                      <tr key={i} className="border-b border-border/40">
                        {sheet.columns.map(c => <td key={c.id} className="py-2 px-3 text-muted-foreground">{String(row[c.name] ?? '')}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Configure */}
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle>Configure Connector</CardTitle>
              <CardDescription>Choose the department, pick columns, and optionally add a filter.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Connector Name</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="Finance Pending Payments" />
                </div>
                <div>
                  <Label>Department</Label>
                  <Select value={department} onValueChange={setDepartment}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DEPARTMENTS.map(d => <SelectItem key={d.id} value={d.id}>{d.id}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Expose columns ({selectedCols.length}/{sheet.columns.length})</Label>
                <div className="mt-2 grid sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {sheet.columns.map(c => (
                    <label key={c.id} className="flex items-center gap-2 p-2 rounded border border-border/60 hover:bg-muted/40 cursor-pointer">
                      <Checkbox checked={selectedCols.includes(c.name)} onCheckedChange={(v) => {
                        setSelectedCols(prev => v ? [...prev, c.name] : prev.filter(x => x !== c.name))
                      }} />
                      <span className="text-sm truncate">{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <Label>Filter (optional)</Label>
                <div className="grid md:grid-cols-3 gap-2 mt-2">
                  <Select value={filterCol || '__none__'} onValueChange={(v) => setFilterCol(v === '__none__' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Column" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— None —</SelectItem>
                      {sheet.columns.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filterOp} onValueChange={setFilterOp}>
                    <SelectTrigger><SelectValue placeholder="Operator" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equals">equals</SelectItem>
                      <SelectItem value="not_equals">not equals</SelectItem>
                      <SelectItem value="contains">contains</SelectItem>
                      <SelectItem value="greater_than">greater than</SelectItem>
                      <SelectItem value="less_than">less than</SelectItem>
                      <SelectItem value="not_empty">is not empty</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input placeholder="Value" value={filterVal} onChange={e => setFilterVal(e.target.value)} disabled={filterOp === 'not_empty'} />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={create} disabled={creating} className="bg-gradient-to-r from-indigo-500 to-cyan-500">
                  {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</> : <>Generate API <Zap className="w-4 h-4 ml-2" /></>}
                </Button>
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  )
}

function StepDot({ n, active, done, label }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
        done ? 'bg-emerald-500 text-white' : active ? 'bg-gradient-to-br from-indigo-500 to-cyan-500 text-white' : 'bg-muted text-muted-foreground'
      }`}>{done ? <CheckCircle2 className="w-4 h-4" /> : n}</div>
      <span className={active || done ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
    </div>
  )
}

// -------------------- Connector Detail --------------------
function ConnectorDetail({ connector: initial, onBack, onDeleted }) {
  const [connector, setConnector] = useState(initial)
  const [showToken, setShowToken] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [script, setScript] = useState('')

  const apiUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/public/${connector.token}`

  const copy = (text, label) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied`)
  }

  const testApi = async () => {
    setTesting(true); setTestResult(null)
    try {
      const res = await fetch(apiUrl)
      const data = await res.json()
      setTestResult({ status: res.status, data })
    } catch (e) {
      setTestResult({ status: 0, data: { error: e.message } })
    } finally { setTesting(false) }
  }

  const loadScript = async () => {
    if (script) return
    const code = await api(`connectors/${connector.id}/script`)
    setScript(code)
  }

  const downloadScript = async () => {
    if (!script) await loadScript()
    const code = script || await api(`connectors/${connector.id}/script`)
    const blob = new Blob([code], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${connector.name.replace(/\s+/g, '_')}.gs`
    a.click()
    URL.revokeObjectURL(url)
  }

  const sync = async () => {
    const d = await api(`connectors/${connector.id}/sync`, { method: 'POST' })
    setConnector({ ...connector, lastSyncAt: d.lastSyncAt })
    toast.success('Synced')
  }

  const remove = async () => {
    if (!confirm('Delete this connector? The API endpoint will stop working.')) return
    await api(`connectors/${connector.id}`, { method: 'DELETE' })
    toast.success('Connector deleted')
    onDeleted()
  }

  const dept = DEPARTMENTS.find(d => d.id === connector.department) || DEPARTMENTS[5]
  const DeptIcon = dept.icon

  return (
    <main className="container mx-auto px-4 py-8 max-w-5xl">
      <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground mb-4">← Back to dashboard</button>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${dept.color} flex items-center justify-center`}>
            <DeptIcon className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{connector.name}</h1>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <Badge variant="outline">{connector.department}</Badge>
              <span>{connector.columns?.length || 'all'} columns</span>
              <span>•</span>
              <span>{connector.callCount || 0} API calls</span>
              {connector.lastSyncAt && <><span>•</span><span>synced {new Date(connector.lastSyncAt).toLocaleTimeString()}</span></>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={sync}><RefreshCw className="w-4 h-4 mr-2" />Sync</Button>
          <Button variant="outline" size="sm" onClick={remove} className="text-destructive hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
        </div>
      </div>

      {/* Endpoint card */}
      <Card className="border-cyan-500/30 bg-gradient-to-br from-cyan-500/5 to-indigo-500/5 mb-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Globe className="w-4 h-4 text-cyan-400" /> Secure API Endpoint</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 bg-background/60 rounded-md px-3 py-2 border border-border/60 font-mono text-sm">
            <span className="text-emerald-400 font-medium">GET</span>
            <span className="truncate flex-1">{apiUrl}</span>
            <Button variant="ghost" size="sm" onClick={() => copy(apiUrl, 'URL')}><Copy className="w-4 h-4" /></Button>
          </div>
          <div className="flex items-center gap-2 bg-background/60 rounded-md px-3 py-2 border border-border/60 font-mono text-xs">
            <KeyRound className="w-3 h-3 text-amber-400" />
            <span className="text-muted-foreground">Token:</span>
            <span className="truncate flex-1">{showToken ? connector.token : '•'.repeat(connector.token.length)}</span>
            <Button variant="ghost" size="sm" onClick={() => setShowToken(s => !s)}>{showToken ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}</Button>
            <Button variant="ghost" size="sm" onClick={() => copy(connector.token, 'Token')}><Copy className="w-3 h-3" /></Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="test">
        <TabsList>
          <TabsTrigger value="test"><PlayCircle className="w-4 h-4 mr-2" />Test Console</TabsTrigger>
          <TabsTrigger value="script" onClick={loadScript}><Code2 className="w-4 h-4 mr-2" />Apps Script</TabsTrigger>
          <TabsTrigger value="config"><Building2 className="w-4 h-4 mr-2" />Config</TabsTrigger>
        </TabsList>

        <TabsContent value="test" className="space-y-4">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Live API Test</CardTitle>
              <CardDescription>Hit the endpoint and see real data from your sheet.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={testApi} disabled={testing} className="bg-gradient-to-r from-indigo-500 to-cyan-500">
                {testing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Calling…</> : <><PlayCircle className="w-4 h-4 mr-2" />Send Request</>}
              </Button>
              {testResult && (
                <div className="mt-4">
                  <div className="flex items-center gap-2 mb-2 text-sm">
                    <Badge variant={testResult.status === 200 ? 'default' : 'destructive'} className={testResult.status === 200 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : ''}>
                      {testResult.status} {testResult.status === 200 ? 'OK' : 'Error'}
                    </Badge>
                    {testResult.data?.count !== undefined && <span className="text-muted-foreground">{testResult.data.count} records</span>}
                  </div>
                  <pre className="bg-background/60 border border-border/60 rounded-md p-3 text-xs font-mono overflow-x-auto max-h-96 overflow-y-auto">
{JSON.stringify(testResult.data, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="script" className="space-y-4">
          <Card className="border-border/60">
            <CardHeader className="flex-row flex items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Google Apps Script</CardTitle>
                <CardDescription>Deploy as a Web App for direct in-Google access.</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => copy(script, 'Script')} disabled={!script}><Copy className="w-4 h-4 mr-2" />Copy</Button>
                <Button variant="outline" size="sm" onClick={downloadScript}><Download className="w-4 h-4 mr-2" />Download .gs</Button>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="bg-background/60 border border-border/60 rounded-md p-3 text-xs font-mono overflow-x-auto max-h-[500px]">
{script || 'Loading script...'}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config" className="space-y-4">
          <Card className="border-border/60">
            <CardHeader><CardTitle className="text-base">Configuration</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Sheet ID"><span className="font-mono">{connector.sheetId}</span></Row>
              <Row label="GID"><span className="font-mono">{connector.gid}</span></Row>
              <Row label="Columns">{connector.columns?.length ? connector.columns.join(', ') : 'All'}</Row>
              <Row label="Filter">
                {connector.filter?.column
                  ? <span className="font-mono">{connector.filter.column} {connector.filter.operator} {String(connector.filter.value ?? '')}</span>
                  : <span className="text-muted-foreground">None</span>}
              </Row>
              <Row label="Created">{new Date(connector.createdAt).toLocaleString()}</Row>
              <Row label="Source"><a href={connector.sheetUrl} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline truncate inline-block max-w-md">{connector.sheetUrl}</a></Row>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex items-start gap-4 py-1">
      <div className="w-32 text-muted-foreground">{label}</div>
      <div className="flex-1">{children}</div>
    </div>
  )
}
