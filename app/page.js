'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'
import {
  Sheet, Zap, Lock, Activity, ArrowRight, Plus, Copy, Download, Trash2, Database, Globe, Code2,
  Building2, Wallet, Users, Briefcase, Receipt, CheckCircle2, RefreshCw, Eye, EyeOff, LogOut, Sparkles,
  BarChart3, Search, ChevronRight, FileSpreadsheet, KeyRound, PlayCircle, Loader2, FileUp, FileText,
  Bot, Cpu, BookOpen, Terminal, ShieldCheck, ShieldOff, Clock, EyeClosed, Layers, Home, User,
  ChevronLeft, MailQuestion, X, Hash, FileJson, AlertTriangle, Upload, Filter, ListFilter,
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
import { Switch } from '@/components/ui/switch'

const DEPARTMENTS = [
  { id: 'Operations', icon: Briefcase, color: 'from-blue-500 to-cyan-500' },
  { id: 'Finance', icon: Wallet, color: 'from-emerald-500 to-teal-500' },
  { id: 'HR', icon: Users, color: 'from-pink-500 to-rose-500' },
  { id: 'Billing', icon: Receipt, color: 'from-amber-500 to-orange-500' },
  { id: 'Projects', icon: Building2, color: 'from-violet-500 to-purple-500' },
  { id: 'Custom', icon: Sparkles, color: 'from-indigo-500 to-blue-500' },
]
const deptOf = id => DEPARTMENTS.find(d => d.id === id) || DEPARTMENTS[5]

const SOURCE_TYPES = {
  google_sheet: { label: 'Google Sheet', icon: FileSpreadsheet, color: 'from-emerald-500 to-teal-500' },
  xlsx_upload: { label: 'Excel Upload', icon: FileUp, color: 'from-blue-500 to-indigo-500' },
  csv_upload: { label: 'CSV Upload', icon: FileText, color: 'from-amber-500 to-orange-500' },
}

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
  const [view, setView] = useState('landing') // landing | reset | app
  const [appPage, setAppPage] = useState('home') // home | sources | new-source | views | new-view | view-detail | profile
  const [activeView, setActiveView] = useState(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const [resetToken, setResetToken] = useState('')

  useEffect(() => {
    // LOGIN BYPASS: no authentication required. Boot straight into the shared
    // demo workspace. (Google OAuth callback is still honored if it ever happens.)
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('google_login') === '1' && sp.get('token')) {
      localStorage.setItem('sf_token', sp.get('token'))
      window.history.replaceState({}, '', '/')
    }
    if (sp.get('google_error')) {
      window.history.replaceState({}, '', '/')
    }
    setUser({ id: 'demo-workspace', name: 'Demo', email: 'demo@sheet2api.app', role: 'admin' })
    setView('app')
    setAppPage('home')
    setBooted(true)
  }, [])

  const logout = () => {
    // Login is bypassed — "logout" just returns to the workspace home.
    localStorage.removeItem('sf_token')
    setUser({ id: 'demo-workspace', name: 'Demo', email: 'demo@sheet2api.app', role: 'admin' })
    setView('app'); setAppPage('home')
  }

  if (!booted) return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-6 h-6 animate-spin" /></div>

  if (view === 'reset') {
    return <ResetPasswordScreen token={resetToken} onDone={() => { window.history.replaceState({}, '', '/'); setView('landing'); setAuthMode('login'); setAuthOpen(true) }} />
  }

  if (view === 'landing' || !user) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <PublicNav onLogin={() => { setAuthMode('login'); setAuthOpen(true) }} onSignup={() => { setAuthMode('signup'); setAuthOpen(true) }} />
        <Landing onStart={() => { setAuthMode('signup'); setAuthOpen(true) }} />
        <AuthDialog open={authOpen} onOpenChange={setAuthOpen} mode={authMode} setMode={setAuthMode}
          onAuthed={(u) => { setUser(u); setAuthOpen(false); setView('app'); setAppPage('home'); toast.success(`Welcome, ${u.name}!`) }} />
      </div>
    )
  }

  // Authed app shell
  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <Sidebar appPage={appPage} setAppPage={(p) => { setAppPage(p); setActiveView(null) }} user={user} onLogout={logout} />
      <div className="flex-1 min-w-0">
        <TopBar appPage={appPage} setAppPage={setAppPage} />
        <div className="px-6 py-6 max-w-7xl">
          {appPage === 'home' && <HomeDashboard onGo={setAppPage} onOpenView={(c) => { setActiveView(c); setAppPage('view-detail') }} />}
          {appPage === 'sources' && <SourcesPage onAdd={() => setAppPage('new-source')} />}
          {appPage === 'new-source' && <NewSource onDone={() => setAppPage('sources')} onCancel={() => setAppPage('sources')} />}
          {appPage === 'views' && <ViewsPage onAdd={() => setAppPage('new-view')} onOpen={(c) => { setActiveView(c); setAppPage('view-detail') }} />}
          {appPage === 'new-view' && <NewViewWizard onDone={(c) => { setActiveView(c); setAppPage('view-detail') }} onCancel={() => setAppPage('views')} />}
          {appPage === 'view-detail' && activeView && <ViewDetail view={activeView} onBack={() => setAppPage('views')} onUpdate={(c) => setActiveView(c)} onDeleted={() => setAppPage('views')} />}
          {appPage === 'profile' && <ProfilePage user={user} onLogout={logout} />}
        </div>
      </div>
    </div>
  )
}

// ──────────────────── Landing (Public) ────────────────────
function PublicNav({ onLogin, onSignup }) {
  return (
    <header className="border-b border-border/60 backdrop-blur sticky top-0 z-40 bg-background/80">
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center"><Sheet className="w-4 h-4 text-white" /></div>
          <span className="font-semibold text-lg tracking-tight">Sheet2API <span className="text-cyan-400">AI</span></span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onLogin}>Login</Button>
          <Button size="sm" className="bg-gradient-to-r from-indigo-500 to-cyan-500" onClick={onSignup}>Get Started <ArrowRight className="w-4 h-4 ml-1" /></Button>
        </div>
      </div>
    </header>
  )
}

function Landing({ onStart }) {
  return (
    <main>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.15),transparent_60%),radial-gradient(ellipse_at_bottom,rgba(34,211,238,0.12),transparent_50%)]" />
        <div className="container mx-auto px-4 py-20 lg:py-28 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <Badge variant="outline" className="mb-5 border-cyan-500/40 text-cyan-300 bg-cyan-500/5"><Sparkles className="w-3 h-3 mr-1" /> Sheets, Excel & CSVs → APIs + MCP for AI</Badge>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">Turn any spreadsheet into a <span className="bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">secure department API</span>.</h1>
            <p className="mt-5 text-lg text-muted-foreground max-w-xl">Pick a source. Choose columns. Get a token-protected REST endpoint, MCP server for AI agents, OpenAPI spec, and ready-to-paste code — all in 30 seconds.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" className="bg-gradient-to-r from-indigo-500 to-cyan-500" onClick={onStart}>Start Free <ArrowRight className="w-4 h-4 ml-2" /></Button>
              <Button size="lg" variant="outline" onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })}>How it works</Button>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
              <span className="flex items-center gap-2"><Lock className="w-4 h-4 text-cyan-400" /> Token-secured</span>
              <span className="flex items-center gap-2"><Bot className="w-4 h-4 text-cyan-400" /> Claude / Cursor MCP</span>
              <span className="flex items-center gap-2"><BookOpen className="w-4 h-4 text-cyan-400" /> OpenAPI spec</span>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 blur-3xl rounded-3xl" />
            <Card className="relative border-border/60 bg-card/60 backdrop-blur shadow-2xl">
              <CardHeader>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-2 h-2 rounded-full bg-red-500/70" /><div className="w-2 h-2 rounded-full bg-amber-500/70" /><div className="w-2 h-2 rounded-full bg-green-500/70" />
                  <span className="ml-2">finance-pending.api</span>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="text-xs md:text-sm font-mono leading-relaxed text-cyan-200/90 overflow-x-auto">{`GET /api/public/9f3b7a...?sort=-amount&limit=5

{
  "connector": "Finance Pending",
  "department": "Finance",
  "count": 5, "total": 24,
  "fromCache": false,
  "data": [
    { "project_id": 101, "client": "Acme Co",
      "amount": 18500, "status": "Pending" },
    { ... }
  ]
}`}</pre>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section id="how" className="container mx-auto px-4 py-20 border-t border-border/40">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold">From spreadsheet to API in 3 steps</h2>
          <p className="mt-3 text-muted-foreground">No SQL. No glue code. No exposed sheets.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: Database, title: '1. Connect a source', desc: 'Google Sheet link, Excel (.xlsx), or CSV. Auto-detect headers, types, and row counts.' },
            { icon: Layers, title: '2. Build a scoped view', desc: 'Pick department, columns, filters, masked fields. Caching and expiry built-in.' },
            { icon: Globe, title: '3. Get your endpoints', desc: 'REST API + MCP server + OpenAPI + code snippets. Drop into any tool or AI agent.' },
          ].map((s, i) => (
            <Card key={i} className="border-border/60 bg-card/50 hover:border-cyan-500/40 transition">
              <CardHeader>
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 border border-cyan-500/30 flex items-center justify-center mb-2"><s.icon className="w-5 h-5 text-cyan-300" /></div>
                <CardTitle className="text-lg">{s.title}</CardTitle>
                <CardDescription>{s.desc}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="container mx-auto px-4 py-20 border-t border-border/40">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { icon: Lock, t: 'Token security', d: 'Rotate, revoke, set expiry anytime.' },
            { icon: EyeClosed, t: 'Field masking', d: 'Hide PII columns at the API layer.' },
            { icon: Bot, t: 'AI-ready MCP', d: 'Plug into Claude, Cursor, ChatGPT.' },
            { icon: Cpu, t: 'Live or cached', d: 'TTL caching to protect rate limits.' },
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
        <Button size="lg" className="mt-6 bg-gradient-to-r from-indigo-500 to-cyan-500" onClick={onStart}>Get Started <ArrowRight className="w-4 h-4 ml-2" /></Button>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 mt-10">
        <div className="container mx-auto px-4 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center"><Sheet className="w-3.5 h-3.5 text-white" /></div>
            <span>Sheet2API <span className="text-cyan-400 font-semibold">AI</span></span>
          </div>
          <div className="text-muted-foreground text-center md:text-right">
            <div>Developed by <span className="text-foreground font-medium">Sthapana Technologies Pvt Ltd</span></div>
            <div className="text-xs mt-0.5">© {new Date().getFullYear()} Sthapana Technologies Pvt Ltd. All rights reserved.</div>
          </div>
        </div>
      </footer>
    </main>
  )
}

// ──────────────────── Auth (Google-only) ────────────────────
function AuthDialog({ open, onOpenChange, mode, setMode, onAuthed }) {
  const goGoogle = () => { window.location.href = '/api/auth/google/start' }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-3 w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center"><Sheet className="w-7 h-7 text-white" /></div>
          <DialogTitle className="text-center text-xl">{mode === 'login' ? 'Welcome back' : 'Get started in seconds'}</DialogTitle>
          <DialogDescription className="text-center">
            {mode === 'login' ? 'Sign in to your Sheet2API AI workspace.' : 'Create your account with Google — no password to remember.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Button onClick={goGoogle} size="lg" className="w-full bg-white text-slate-900 hover:bg-slate-100 border border-slate-300 font-medium">
            <svg className="w-5 h-5 mr-3" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.7 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.2 5.2C40.9 36 44 30.5 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg>
            Continue with Google
          </Button>
          <div className="text-xs text-center text-muted-foreground space-y-1">
            <p>We'll create your account on first sign-in — instantly.</p>
            <p>Your spreadsheets stay private and encrypted with AES-256.</p>
          </div>
          <Separator />
          <div className="text-xs text-center text-muted-foreground">
            By continuing, you agree to our terms. <br />
            <span className="text-muted-foreground/70">© {new Date().getFullYear()} Sthapana Technologies Pvt Ltd</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ResetPasswordScreen({ token, onDone }) {
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [loading, setLoading] = useState(false)
  const submit = async () => {
    if (pw !== pw2) return toast.error("Passwords don't match")
    if (pw.length < 6) return toast.error('Password too short (min 6)')
    setLoading(true)
    try { await api('auth/reset', { method: 'POST', body: JSON.stringify({ token, password: pw }) }); toast.success('Password updated. Please sign in.'); onDone() }
    catch (err) { toast.error(err.message) } finally { setLoading(false) }
  }
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-md border-border/60">
        <CardHeader>
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>Choose a strong password to secure your account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div><Label>New password</Label><Input type="password" value={pw} onChange={e => setPw(e.target.value)} /></div>
          <div><Label>Confirm password</Label><Input type="password" value={pw2} onChange={e => setPw2(e.target.value)} /></div>
          <Button onClick={submit} disabled={loading} className="w-full bg-gradient-to-r from-indigo-500 to-cyan-500">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update password'}</Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ──────────────────── Sidebar + TopBar ────────────────────
function Sidebar({ appPage, setAppPage, user, onLogout }) {
  const items = [
    { id: 'home', label: 'Dashboard', icon: Home },
    { id: 'sources', label: 'Sources', icon: Database },
    { id: 'views', label: 'Scoped Views', icon: Layers },
    { id: 'profile', label: 'Profile', icon: User },
  ]
  return (
    <aside className="w-60 shrink-0 border-r border-border/60 bg-card/30 min-h-screen sticky top-0 hidden md:flex md:flex-col">
      <div className="p-4 border-b border-border/60">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center"><Sheet className="w-4 h-4 text-white" /></div>
          <div><div className="font-semibold leading-tight">Sheet2API <span className="text-cyan-400">AI</span></div></div>
        </div>
      </div>
      <nav className="p-3 flex-1 space-y-1">
        {items.map(i => {
          const active = appPage === i.id || (i.id === 'sources' && appPage === 'new-source') || (i.id === 'views' && (appPage === 'new-view' || appPage === 'view-detail'))
          return (
            <button key={i.id} onClick={() => setAppPage(i.id)} className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition ${active ? 'bg-gradient-to-r from-indigo-500/15 to-cyan-500/15 text-foreground border border-cyan-500/30' : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'}`}>
              <i.icon className="w-4 h-4" /> {i.label}
            </button>
          )
        })}
      </nav>
      <div className="p-3 border-t border-border/60">
        <div className="flex items-center gap-2 px-2 py-2 text-sm">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-xs text-white font-medium">{user.name?.[0]?.toUpperCase()}</div>
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{user.name}</div>
            <div className="text-xs text-muted-foreground truncate">{user.email}</div>
          </div>
          <button onClick={onLogout} className="text-muted-foreground hover:text-foreground"><LogOut className="w-4 h-4" /></button>
        </div>
        <div className="text-[10px] text-muted-foreground/70 px-2 pt-2 leading-tight">
          © {new Date().getFullYear()} <span className="text-muted-foreground">Sthapana Technologies Pvt Ltd</span>
        </div>
      </div>
    </aside>
  )
}

function TopBar({ appPage, setAppPage }) {
  const labels = { home: 'Dashboard', sources: 'Sources', 'new-source': 'New Source', views: 'Scoped Views', 'new-view': 'New Scoped View', 'view-detail': 'View Details', profile: 'Profile' }
  return (
    <header className="border-b border-border/60 h-14 px-6 flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur z-30">
      <div className="text-sm text-muted-foreground flex items-center gap-2">
        <button onClick={() => setAppPage('home')} className="hover:text-foreground">Home</button>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground">{labels[appPage] || ''}</span>
      </div>
    </header>
  )
}

// ──────────────────── Home Dashboard ────────────────────
function HomeDashboard({ onGo, onOpenView }) {
  const [stats, setStats] = useState(null)
  const [connectors, setConnectors] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try { const [s, c] = await Promise.all([api('stats'), api('connectors')]); setStats(s); setConnectors(c.connectors) }
    catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const deptChartData = stats ? Object.entries(stats.callsByDept || {}).map(([department, calls]) => ({ department, calls })) : []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Your sources, views, and live API traffic.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onGo('new-source')}><Database className="w-4 h-4 mr-2" />Add Source</Button>
          <Button className="bg-gradient-to-r from-indigo-500 to-cyan-500" onClick={() => onGo('new-view')}><Plus className="w-4 h-4 mr-2" />New Scoped View</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI icon={Database} label="Sources" value={stats?.sourcesCount ?? '—'} color="text-cyan-400" />
        <KPI icon={Layers} label="Scoped Views" value={stats?.connectorsCount ?? '—'} color="text-violet-400" />
        <KPI icon={Activity} label="API Calls" value={stats?.totalCalls ?? '—'} color="text-emerald-400" />
        <KPI icon={CheckCircle2} label="Active Tokens" value={stats?.activeCount ?? '—'} color="text-amber-400" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="border-border/60 lg:col-span-2">
          <CardHeader><CardTitle className="text-base">API calls — last 14 days</CardTitle></CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats?.timeseries || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="calls" stroke="#22d3ee" strokeWidth={2.5} dot={{ r: 3, fill: '#22d3ee' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardHeader><CardTitle className="text-base">Calls by department</CardTitle></CardHeader>
          <CardContent>
            <div className="h-56">
              {deptChartData.length === 0 ? <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No calls yet</div> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deptChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="department" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="calls" radius={[6, 6, 0, 0]}>
                      {deptChartData.map((d, i) => <Cell key={i} fill={['#6366f1','#22d3ee','#10b981','#f59e0b','#a855f7','#ec4899'][i % 6]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60">
        <CardHeader className="flex-row flex items-center justify-between space-y-0">
          <CardTitle className="text-base">Recent scoped views</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => onGo('views')}>View all <ChevronRight className="w-4 h-4 ml-1" /></Button>
        </CardHeader>
        <CardContent>
          {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto py-4" /> : connectors.length === 0 ? (
            <div className="py-10 text-center">
              <Layers className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground mb-3">No scoped views yet.</p>
              <Button onClick={() => onGo('new-view')} className="bg-gradient-to-r from-indigo-500 to-cyan-500"><Plus className="w-4 h-4 mr-2" />Create your first view</Button>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {connectors.slice(0, 5).map(c => <ConnectorRow key={c.id} c={c} onOpen={() => onOpenView(c)} />)}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function KPI({ icon: Icon, label, value, color }) {
  return (
    <Card className="border-border/60"><CardContent className="p-5">
      <div className="flex items-center justify-between">
        <div><div className="text-sm text-muted-foreground">{label}</div><div className="text-2xl font-bold mt-1">{value}</div></div>
        <Icon className={`w-8 h-8 ${color} opacity-80`} />
      </div>
    </CardContent></Card>
  )
}

function ConnectorRow({ c, onOpen }) {
  const d = deptOf(c.department); const Icon = d.icon
  return (
    <button onClick={onOpen} className="w-full flex items-center gap-4 py-3 hover:bg-muted/30 px-2 -mx-2 rounded-lg transition text-left">
      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${d.color} flex items-center justify-center flex-shrink-0`}><Icon className="w-5 h-5 text-white" /></div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{c.name}</div>
        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
          <Badge variant="outline" className="text-xs">{c.department}</Badge>
          <span>{c.columns?.length || 'all'} cols</span><span>•</span>
          <span>{c.callCount || 0} calls</span>
          {c.cacheMode === 'cached' && (<><span>•</span><span className="text-amber-300">cached</span></>)}
        </div>
      </div>
      <Badge variant="outline" className={c.revoked ? 'border-red-500/40 text-red-400' : 'border-emerald-500/40 text-emerald-300'}>{c.revoked ? 'revoked' : 'active'}</Badge>
      <ChevronRight className="w-4 h-4 text-muted-foreground" />
    </button>
  )
}

// ──────────────────── Sources Page ────────────────────
function SourcesPage({ onAdd }) {
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(true)
  const load = async () => { setLoading(true); try { const d = await api('sources'); setSources(d.sources) } catch (e) { toast.error(e.message) } finally { setLoading(false) } }
  useEffect(() => { load() }, [])
  const remove = async (id) => { if (!confirm('Delete this source? Linked scoped views may break.')) return; await api(`sources/${id}`, { method: 'DELETE' }); toast.success('Source deleted'); load() }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Sources</h1><p className="text-sm text-muted-foreground mt-1">Google Sheets, Excel files, and CSV uploads.</p></div>
        <Button onClick={onAdd} className="bg-gradient-to-r from-indigo-500 to-cyan-500"><Plus className="w-4 h-4 mr-2" />Add Source</Button>
      </div>
      {loading ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : sources.length === 0 ? (
        <Card className="border-dashed border-border/60"><CardContent className="py-16 text-center">
          <Database className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground mb-4">No sources yet. Connect a spreadsheet to begin.</p>
          <Button onClick={onAdd} className="bg-gradient-to-r from-indigo-500 to-cyan-500"><Plus className="w-4 h-4 mr-2" />Add your first source</Button>
        </CardContent></Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sources.map(s => {
            const t = SOURCE_TYPES[s.type] || SOURCE_TYPES.csv_upload; const Icon = t.icon
            return (
              <Card key={s.id} className="border-border/60 hover:border-cyan-500/40 transition">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${t.color} flex items-center justify-center`}><Icon className="w-5 h-5 text-white" /></div>
                    <button onClick={() => remove(s.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <div className="font-medium truncate">{s.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">{t.label} • {s.rowCount} rows • {s.columnsMeta?.length || 0} cols</div>
                  <div className="text-xs text-muted-foreground mt-1">{new Date(s.createdAt).toLocaleDateString()}</div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ──────────────────── New Source ────────────────────
function NewSource({ onDone, onCancel }) {
  const [type, setType] = useState(null) // google_sheet | xlsx_upload | csv_upload
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [parsed, setParsed] = useState(null) // {columns, rows, fileName?}
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  const onFile = async (f, kind) => {
    if (!f) return
    setBusy(true)
    try {
      const buf = await f.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const arr = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: false })
      if (!arr.length) throw new Error('Empty file')
      const headers = (arr[0] || []).map((h, i) => ({ id: `col${i}`, name: String(h ?? `Column ${i + 1}`), type: 'string' }))
      const rows = arr.slice(1)
      setParsed({ columns: headers, rows, fileName: f.name })
      if (!name) setName(f.name.replace(/\.(xlsx|csv|xls)$/i, ''))
    } catch (e) { toast.error('Could not read file: ' + e.message) } finally { setBusy(false) }
  }

  const parseGS = async () => {
    setBusy(true)
    try {
      const d = await api('sheets/parse', { method: 'POST', body: JSON.stringify({ url }) })
      setParsed({ columns: d.columns, rows: [], rowCount: d.rowCount, preview: d.preview, sheetId: d.sheetId, gid: d.gid })
      if (!name) setName('Google Sheet')
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const save = async () => {
    setBusy(true)
    try {
      let body
      if (type === 'google_sheet' && parsed?.private) {
        body = { type: 'google_sheet_private', name, spreadsheetId: parsed.spreadsheetId, sheetTitle: parsed.sheetTitle }
      } else if (type === 'google_sheet') {
        body = { type, name, url }
      } else {
        body = { type, name, fileName: parsed.fileName, columns: parsed.columns, rows: parsed.rows }
      }
      await api('sources', { method: 'POST', body: JSON.stringify(body) })
      toast.success('Source added')
      onDone()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  if (!type) {
    return (
      <div className="max-w-4xl space-y-6">
        <div>
          <button onClick={onCancel} className="text-sm text-muted-foreground hover:text-foreground mb-2 flex items-center"><ChevronLeft className="w-4 h-4" />Back</button>
          <h1 className="text-2xl font-bold">Add a Source</h1>
          <p className="text-sm text-muted-foreground mt-1">Pick where your data lives.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {Object.entries(SOURCE_TYPES).map(([k, v]) => {
            const Icon = v.icon
            return (
              <button key={k} onClick={() => setType(k)} className="text-left group">
                <Card className="border-border/60 group-hover:border-cyan-500/50 transition h-full">
                  <CardContent className="p-6">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${v.color} flex items-center justify-center mb-4`}><Icon className="w-6 h-6 text-white" /></div>
                    <div className="font-semibold">{v.label}</div>
                    <div className="text-sm text-muted-foreground mt-1">{k === 'google_sheet' ? 'Connect via public share link (Anyone with link, Viewer)' : k === 'xlsx_upload' ? 'Upload .xlsx / .xls file as snapshot' : 'Upload .csv file as snapshot'}</div>
                  </CardContent>
                </Card>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <button onClick={() => setType(null)} className="text-sm text-muted-foreground hover:text-foreground mb-2 flex items-center"><ChevronLeft className="w-4 h-4" />Change source type</button>
        <h1 className="text-2xl font-bold">Add: {SOURCE_TYPES[type].label}</h1>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-6 space-y-4">
          <div><Label>Source name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Employee Master 2025" /></div>

          {type === 'google_sheet' && (
            <GoogleSheetConfigurator
              setParsed={setParsed}
              parsed={parsed}
              url={url}
              setUrl={setUrl}
              setName={setName}
              name={name}
              parseGS={parseGS}
              busy={busy}
            />
          )}

          {(type === 'xlsx_upload' || type === 'csv_upload') && (
            <>
              <Label>{type === 'xlsx_upload' ? 'Excel file (.xlsx / .xls)' : 'CSV file (.csv)'}</Label>
              <div onClick={() => fileRef.current?.click()} className="border-2 border-dashed border-border/60 rounded-lg p-8 text-center hover:border-cyan-500/50 cursor-pointer transition">
                <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <div className="text-sm">{parsed?.fileName ? <>Loaded: <strong>{parsed.fileName}</strong></> : 'Click to choose a file'}</div>
                <div className="text-xs text-muted-foreground mt-1">Parsed locally — never uploaded raw</div>
              </div>
              <input ref={fileRef} type="file" className="hidden" accept={type === 'xlsx_upload' ? '.xlsx,.xls' : '.csv'} onChange={e => onFile(e.target.files?.[0], type)} />
            </>
          )}

          {parsed && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-2 text-emerald-300 mb-3"><CheckCircle2 className="w-4 h-4" /><span className="font-medium">{parsed.columns.length} columns, {parsed.rowCount ?? parsed.rows.length} rows detected</span></div>
              <div className="text-xs text-muted-foreground flex flex-wrap gap-1.5">{parsed.columns.slice(0, 12).map(c => <Badge key={c.id} variant="outline">{c.name}</Badge>)}{parsed.columns.length > 12 && <Badge variant="outline">+{parsed.columns.length - 12} more</Badge>}</div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button onClick={save} disabled={busy || !name || (!parsed && type !== 'google_sheet') || (type === 'google_sheet' && !parsed)} className="bg-gradient-to-r from-indigo-500 to-cyan-500">Save source</Button>
            <Button variant="outline" onClick={onCancel}>Cancel</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ──────────────────── Views Page (Connectors list) ────────────────────
function ViewsPage({ onAdd, onOpen }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const load = async () => { setLoading(true); try { const d = await api('connectors'); setItems(d.connectors) } catch (e) { toast.error(e.message) } finally { setLoading(false) } }
  useEffect(() => { load() }, [])
  const filtered = useMemo(() => items.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.department.toLowerCase().includes(search.toLowerCase())), [items, search])
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold">Scoped Views</h1><p className="text-sm text-muted-foreground mt-1">Each view exposes a token-protected slice of a source.</p></div>
        <Button onClick={onAdd} className="bg-gradient-to-r from-indigo-500 to-cyan-500"><Plus className="w-4 h-4 mr-2" />New Scoped View</Button>
      </div>
      <Card className="border-border/60">
        <CardHeader className="flex-row flex items-center justify-end space-y-0">
          <div className="relative w-64"><Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input className="pl-8" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        </CardHeader>
        <CardContent>
          {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto py-6" /> : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Layers className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground mb-4">No views yet.</p>
              <Button onClick={onAdd} className="bg-gradient-to-r from-indigo-500 to-cyan-500"><Plus className="w-4 h-4 mr-2" />Create your first view</Button>
            </div>
          ) : (
            <div className="divide-y divide-border/60">{filtered.map(c => <ConnectorRow key={c.id} c={c} onOpen={() => onOpen(c)} />)}</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ──────────────────── New View Wizard (3 steps) ────────────────────
function NewViewWizard({ onDone, onCancel }) {
  const [step, setStep] = useState(1)
  const [sources, setSources] = useState([])
  const [src, setSrc] = useState(null) // selected source obj
  const [preview, setPreview] = useState(null)
  const [name, setName] = useState('')
  const [department, setDepartment] = useState('Operations')
  const [cols, setCols] = useState([])
  const [masked, setMasked] = useState([])
  const [filterCol, setFilterCol] = useState(''); const [filterOp, setFilterOp] = useState(''); const [filterVal, setFilterVal] = useState('')
  const [cacheMode, setCacheMode] = useState('live'); const [cacheTTL, setCacheTTL] = useState(300)
  const [expiresAt, setExpiresAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState(null)

  useEffect(() => { api('sources').then(d => setSources(d.sources)).catch(() => {}) }, [])

  const pickSource = async (s) => {
    setBusy(true)
    try {
      const d = await api(`sources/${s.id}`)
      setSrc(d.source); setPreview(d.preview)
      setCols((d.source.columnsMeta || []).map(c => c.name))
      setName(`${s.name} — view`)
      setStep(2)
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const create = async () => {
    setBusy(true)
    try {
      const body = { sourceId: src.id, name, department, columns: cols, maskedColumns: masked,
        filter: filterCol && filterOp ? { column: filterCol, operator: filterOp, value: filterVal } : null,
        cacheMode, cacheTTLSeconds: parseInt(cacheTTL) || 300,
        expiresAt: expiresAt || null,
      }
      const d = await api('connectors', { method: 'POST', body: JSON.stringify(body) })
      setCreated(d.connector); setStep(3)
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const columns = src?.columnsMeta || []

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <button onClick={onCancel} className="text-sm text-muted-foreground hover:text-foreground mb-2 flex items-center"><ChevronLeft className="w-4 h-4" />Back</button>
        <h1 className="text-2xl font-bold">New Scoped View</h1>
        <p className="text-sm text-muted-foreground mt-1">Token-protected slice of a source for a department or use case.</p>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <StepDot n={1} active={step === 1} done={step > 1} label="Source" />
        <div className="flex-1 h-px bg-border" />
        <StepDot n={2} active={step === 2} done={step > 2} label="Configure" />
        <div className="flex-1 h-px bg-border" />
        <StepDot n={3} active={step === 3} done={false} label="Endpoints" />
      </div>

      {step === 1 && (
        <Card className="border-border/60">
          <CardHeader><CardTitle>Pick a source</CardTitle><CardDescription>Choose one of your connected spreadsheets.</CardDescription></CardHeader>
          <CardContent>
            {sources.length === 0 ? (
              <div className="text-center py-10">
                <Database className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground mb-3">You don't have any sources yet.</p>
                <Button onClick={onCancel} variant="outline">Go add a source first</Button>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {sources.map(s => {
                  const t = SOURCE_TYPES[s.type] || SOURCE_TYPES.csv_upload; const Icon = t.icon
                  return (
                    <button key={s.id} onClick={() => pickSource(s)} disabled={busy} className="text-left">
                      <Card className="border-border/60 hover:border-cyan-500/50 transition">
                        <CardContent className="p-4 flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${t.color} flex items-center justify-center flex-shrink-0`}><Icon className="w-5 h-5 text-white" /></div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{s.name}</div>
                            <div className="text-xs text-muted-foreground">{t.label} • {s.rowCount} rows • {s.columnsMeta?.length || 0} cols</div>
                          </div>
                          {busy && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                        </CardContent>
                      </Card>
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === 2 && src && (
        <div className="space-y-4">
          <Card className="border-border/60">
            <CardHeader><CardTitle>Configure scope</CardTitle><CardDescription>Choose department, columns, filters, masking, and cache behavior.</CardDescription></CardHeader>
            <CardContent className="space-y-5">
              <div className="grid md:grid-cols-2 gap-3">
                <div><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
                <div><Label>Department</Label>
                  <Select value={department} onValueChange={setDepartment}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DEPARTMENTS.map(d => <SelectItem key={d.id} value={d.id}>{d.id}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1"><Label>Expose columns ({cols.length}/{columns.length})</Label>
                  <div className="text-xs text-cyan-400 flex gap-2">
                    <button onClick={() => setCols(columns.map(c => c.name))}>Select all</button>
                    <button onClick={() => setCols([])}>Clear</button>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                  {columns.map(c => (
                    <label key={c.id} className="flex items-center gap-2 p-2 rounded border border-border/60 hover:bg-muted/40 cursor-pointer">
                      <Checkbox checked={cols.includes(c.name)} onCheckedChange={(v) => setCols(prev => v ? [...prev, c.name] : prev.filter(x => x !== c.name))} />
                      <span className="text-sm truncate">{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <Label className="flex items-center gap-2"><EyeClosed className="w-3.5 h-3.5" /> Mask sensitive columns (PII)</Label>
                <p className="text-xs text-muted-foreground mb-2">Values will be returned as <code className="text-amber-300">J***e</code></p>
                <div className="flex flex-wrap gap-2">
                  {cols.map(name => (
                    <button key={name} onClick={() => setMasked(p => p.includes(name) ? p.filter(x => x !== name) : [...p, name])}
                      className={`px-3 py-1 rounded-full border text-xs ${masked.includes(name) ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-border/60 text-muted-foreground'}`}>
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <Label className="flex items-center gap-2"><Filter className="w-3.5 h-3.5" /> Row filter (optional)</Label>
                <div className="grid md:grid-cols-3 gap-2 mt-2">
                  <Select value={filterCol || '__'} onValueChange={v => setFilterCol(v === '__' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Column" /></SelectTrigger>
                    <SelectContent><SelectItem value="__">— None —</SelectItem>{columns.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={filterOp} onValueChange={setFilterOp}>
                    <SelectTrigger><SelectValue placeholder="Operator" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equals">equals</SelectItem><SelectItem value="not_equals">not equals</SelectItem>
                      <SelectItem value="contains">contains</SelectItem><SelectItem value="greater_than">&gt;</SelectItem>
                      <SelectItem value="less_than">&lt;</SelectItem><SelectItem value="not_empty">is not empty</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input placeholder="Value" value={filterVal} onChange={e => setFilterVal(e.target.value)} disabled={filterOp === 'not_empty'} />
                </div>
              </div>

              <Separator />

              <div className="grid md:grid-cols-3 gap-3">
                <div>
                  <Label className="flex items-center gap-2"><Cpu className="w-3.5 h-3.5" /> Mode</Label>
                  <Select value={cacheMode} onValueChange={setCacheMode}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="live">Live</SelectItem><SelectItem value="cached">Cached</SelectItem></SelectContent>
                  </Select>
                </div>
                {cacheMode === 'cached' && (
                  <div><Label>Cache TTL (seconds)</Label><Input type="number" value={cacheTTL} onChange={e => setCacheTTL(e.target.value)} /></div>
                )}
                <div><Label className="flex items-center gap-2"><Clock className="w-3.5 h-3.5" /> Expires at (optional)</Label><Input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} /></div>
              </div>

              {preview?.length > 0 && (
                <details className="rounded-md border border-border/60 p-3">
                  <summary className="cursor-pointer text-sm text-muted-foreground">Preview first 5 rows</summary>
                  <div className="mt-3 overflow-x-auto"><table className="text-xs w-full"><thead><tr className="border-b border-border/60">{Object.keys(preview[0]).map(k => <th key={k} className="text-left py-1 px-2">{k}</th>)}</tr></thead>
                    <tbody>{preview.map((r, i) => <tr key={i} className="border-b border-border/40">{Object.keys(preview[0]).map(k => <td key={k} className="py-1 px-2 text-muted-foreground">{String(r[k] ?? '')}</td>)}</tr>)}</tbody>
                  </table></div>
                </details>
              )}

              <div className="flex gap-2 pt-2">
                <Button onClick={create} disabled={busy || cols.length === 0} className="bg-gradient-to-r from-indigo-500 to-cyan-500">{busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating…</> : <>Generate endpoints <Zap className="w-4 h-4 ml-2" /></>}</Button>
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {step === 3 && created && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardHeader><div className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-400" /><CardTitle>Your endpoints are live!</CardTitle></div></CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">Open the view to access REST URL, MCP server config, OpenAPI spec, and code snippets.</p>
            <Button onClick={() => onDone(created)} className="bg-gradient-to-r from-indigo-500 to-cyan-500">Open scoped view <ArrowRight className="w-4 h-4 ml-2" /></Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StepDot({ n, active, done, label }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${done ? 'bg-emerald-500 text-white' : active ? 'bg-gradient-to-br from-indigo-500 to-cyan-500 text-white' : 'bg-muted text-muted-foreground'}`}>{done ? <CheckCircle2 className="w-4 h-4" /> : n}</div>
      <span className={active || done ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
    </div>
  )
}

// ──────────────────── View Detail ────────────────────
function ViewDetail({ view: initial, onBack, onUpdate, onDeleted }) {
  const [c, setC] = useState(initial)
  const [showToken, setShowToken] = useState(false)
  const [testing, setTesting] = useState(false); const [testResult, setTestResult] = useState(null)
  const [testQuery, setTestQuery] = useState('')
  const [script, setScript] = useState(''); const [mcp, setMcp] = useState(''); const [openapi, setOpenapi] = useState(null)
  const [audit, setAudit] = useState([])

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const apiUrl = `${baseUrl}/api/public/${c.token}`

  const refresh = async () => { const d = await api(`connectors/${c.id}`); setC(d.connector); onUpdate(d.connector) }
  const copy = (t, l) => { navigator.clipboard.writeText(t); toast.success(`${l} copied`) }

  const testApi = async () => {
    setTesting(true); setTestResult(null)
    try {
      const res = await fetch(apiUrl + (testQuery ? (testQuery.startsWith('?') ? testQuery : '?' + testQuery) : ''))
      const data = await res.json(); setTestResult({ status: res.status, data })
    } catch (err) { setTestResult({ status: 0, data: { error: err.message } }) } finally { setTesting(false) }
  }

  const loadScript = async () => { if (!script) setScript(await api(`connectors/${c.id}/script`)) }
  const loadMcp = async () => { if (!mcp) setMcp(await api(`connectors/${c.id}/mcp`)) }
  const loadOpenapi = async () => { if (!openapi) setOpenapi(await api(`connectors/${c.id}/openapi`)) }
  const loadAudit = async () => { const d = await api(`connectors/${c.id}/audit`); setAudit(d.audit) }

  const dl = (text, fname) => { const b = new Blob([text], { type: 'text/plain' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = fname; a.click(); URL.revokeObjectURL(u) }

  const rotate = async () => { if (!confirm('Rotate the API token? The current URL will stop working.')) return; const d = await api(`connectors/${c.id}/rotate-token`, { method: 'POST' }); setC(d.connector); onUpdate(d.connector); toast.success('Token rotated') }
  const revoke = async () => { if (!confirm('Revoke this token? API will return 401 for all callers.')) return; await api(`connectors/${c.id}/revoke`, { method: 'POST' }); await refresh(); toast.success('Token revoked') }
  const unrevoke = async () => { await api(`connectors/${c.id}/unrevoke`, { method: 'POST' }); await refresh(); toast.success('Token re-enabled') }
  const remove = async () => { if (!confirm('Delete this scoped view? The API URL will stop working.')) return; await api(`connectors/${c.id}`, { method: 'DELETE' }); toast.success('Deleted'); onDeleted() }
  const sync = async () => { const d = await api(`connectors/${c.id}/sync`, { method: 'POST' }); setC({ ...c, lastSyncAt: d.lastSyncAt }); toast.success('Cache cleared, will refetch on next call') }

  const updField = async (patch) => { const d = await api(`connectors/${c.id}`, { method: 'PATCH', body: JSON.stringify(patch) }); setC(d.connector); onUpdate(d.connector); toast.success('Saved') }

  const dept = deptOf(c.department); const DI = dept.icon

  return (
    <div className="space-y-6">
      <div>
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground mb-3 flex items-center"><ChevronLeft className="w-4 h-4" />Back to views</button>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${dept.color} flex items-center justify-center`}><DI className="w-7 h-7 text-white" /></div>
            <div>
              <h1 className="text-2xl font-bold">{c.name}</h1>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
                <Badge variant="outline">{c.department}</Badge>
                <span>{c.columns?.length || 'all'} cols</span>
                <span>•</span><span>{c.callCount || 0} calls</span>
                <span>•</span><span>{c.cacheMode}</span>
                {c.revoked && <Badge className="bg-red-500/15 text-red-300 border-red-500/30">Revoked</Badge>}
                {c.expiresAt && new Date(c.expiresAt) < new Date() && <Badge className="bg-red-500/15 text-red-300">Expired</Badge>}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={sync}><RefreshCw className="w-4 h-4 mr-2" />Sync</Button>
            <Button variant="outline" size="sm" onClick={remove} className="text-destructive hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>

      {/* Endpoint hero card */}
      <Card className="border-cyan-500/30 bg-gradient-to-br from-cyan-500/5 to-indigo-500/5">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Globe className="w-4 h-4 text-cyan-400" /> Secure REST API</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 bg-background/60 rounded-md px-3 py-2 border border-border/60 font-mono text-sm">
            <span className="text-emerald-400 font-medium">GET</span>
            <span className="truncate flex-1">{apiUrl}</span>
            <Button variant="ghost" size="sm" onClick={() => copy(apiUrl, 'URL')}><Copy className="w-4 h-4" /></Button>
          </div>
          <div className="flex items-center gap-2 bg-background/60 rounded-md px-3 py-2 border border-border/60 font-mono text-xs">
            <KeyRound className="w-3 h-3 text-amber-400" /><span className="text-muted-foreground">Token:</span>
            <span className="truncate flex-1">{showToken ? c.token : '•'.repeat(c.token.length)}</span>
            <Button variant="ghost" size="sm" onClick={() => setShowToken(s => !s)}>{showToken ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}</Button>
            <Button variant="ghost" size="sm" onClick={() => copy(c.token, 'Token')}><Copy className="w-3 h-3" /></Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="test">
        <TabsList className="flex-wrap">
          <TabsTrigger value="test"><PlayCircle className="w-4 h-4 mr-1.5" />Test</TabsTrigger>
          <TabsTrigger value="snippets" onClick={() => {}}><Terminal className="w-4 h-4 mr-1.5" />Snippets</TabsTrigger>
          <TabsTrigger value="mcp" onClick={loadMcp}><Bot className="w-4 h-4 mr-1.5" />MCP</TabsTrigger>
          <TabsTrigger value="openapi" onClick={loadOpenapi}><BookOpen className="w-4 h-4 mr-1.5" />OpenAPI</TabsTrigger>
          <TabsTrigger value="script" onClick={loadScript}><Code2 className="w-4 h-4 mr-1.5" />Apps Script</TabsTrigger>
          <TabsTrigger value="audit" onClick={loadAudit}><Activity className="w-4 h-4 mr-1.5" />Audit</TabsTrigger>
          <TabsTrigger value="governance"><ShieldCheck className="w-4 h-4 mr-1.5" />Governance</TabsTrigger>
        </TabsList>

        <TabsContent value="test" className="space-y-3">
          <Card className="border-border/60"><CardContent className="p-5 space-y-3">
            <Label className="text-xs">Query params (optional) — examples: <code>sort=-amount&limit=5</code>, <code>q=acme</code>, <code>fields=client,amount</code></Label>
            <div className="flex gap-2">
              <Input className="font-mono text-xs" placeholder="?sort=-amount&limit=5" value={testQuery} onChange={e => setTestQuery(e.target.value)} />
              <Button onClick={testApi} disabled={testing} className="bg-gradient-to-r from-indigo-500 to-cyan-500 whitespace-nowrap">{testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <><PlayCircle className="w-4 h-4 mr-2" />Send</>}</Button>
            </div>
            {testResult && (
              <div>
                <div className="flex items-center gap-2 my-2 text-sm">
                  <Badge className={testResult.status === 200 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-red-500/20 text-red-300 border-red-500/40'}>{testResult.status || 'ERR'}</Badge>
                  {testResult.data?.count !== undefined && <span className="text-muted-foreground">{testResult.data.count} of {testResult.data.total} records {testResult.data.fromCache ? '(cached)' : '(live)'}</span>}
                </div>
                <pre className="bg-background/60 border border-border/60 rounded-md p-3 text-xs font-mono overflow-x-auto max-h-96">{JSON.stringify(testResult.data, null, 2)}</pre>
              </div>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="snippets">
          <CodeSnippets apiUrl={apiUrl} />
        </TabsContent>

        <TabsContent value="mcp" className="space-y-3">
          <Card className="border-border/60">
            <CardHeader className="flex-row flex items-center justify-between space-y-0">
              <div><CardTitle className="text-base">MCP Server</CardTitle><CardDescription>Drop into Claude Desktop, Cursor, or any MCP-compatible AI agent.</CardDescription></div>
              <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => copy(mcp, 'MCP code')} disabled={!mcp}><Copy className="w-4 h-4 mr-2" />Copy</Button><Button size="sm" variant="outline" onClick={() => dl(mcp, `sheet2api-${c.name.replace(/\s+/g, '_')}.mjs`)} disabled={!mcp}><Download className="w-4 h-4 mr-2" />Download .mjs</Button></div>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground border-l-2 border-cyan-500/40 pl-3 mb-3">
                <strong>Setup (Claude Desktop):</strong> Save the file, run <code>npm install @modelcontextprotocol/sdk</code>, then add to <code>~/Library/Application Support/Claude/claude_desktop_config.json</code> on macOS (instructions inside the file).
              </div>
              <pre className="bg-background/60 border border-border/60 rounded-md p-3 text-xs font-mono overflow-x-auto max-h-[500px]">{mcp || 'Loading…'}</pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="openapi" className="space-y-3">
          <Card className="border-border/60">
            <CardHeader className="flex-row flex items-center justify-between space-y-0">
              <div><CardTitle className="text-base">OpenAPI 3.1 Spec</CardTitle><CardDescription>Import into Swagger UI, Postman, Insomnia, or any OpenAPI tool.</CardDescription></div>
              <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => copy(JSON.stringify(openapi, null, 2), 'Spec')} disabled={!openapi}><Copy className="w-4 h-4 mr-2" />Copy</Button><Button size="sm" variant="outline" onClick={() => dl(JSON.stringify(openapi, null, 2), `${c.name.replace(/\s+/g, '_')}-openapi.json`)} disabled={!openapi}><Download className="w-4 h-4 mr-2" />Download</Button></div>
            </CardHeader>
            <CardContent><pre className="bg-background/60 border border-border/60 rounded-md p-3 text-xs font-mono overflow-x-auto max-h-[500px]">{openapi ? JSON.stringify(openapi, null, 2) : 'Loading…'}</pre></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="script" className="space-y-3">
          <Card className="border-border/60">
            <CardHeader className="flex-row flex items-center justify-between space-y-0">
              <div><CardTitle className="text-base">Google Apps Script</CardTitle><CardDescription>Deploy directly inside Google for in-Google access.</CardDescription></div>
              <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => copy(script, 'Script')} disabled={!script}><Copy className="w-4 h-4 mr-2" />Copy</Button><Button size="sm" variant="outline" onClick={() => dl(script, `${c.name.replace(/\s+/g, '_')}.gs`)} disabled={!script}><Download className="w-4 h-4 mr-2" />Download .gs</Button></div>
            </CardHeader>
            <CardContent><pre className="bg-background/60 border border-border/60 rounded-md p-3 text-xs font-mono overflow-x-auto max-h-[500px]">{script || 'Loading…'}</pre></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card className="border-border/60">
            <CardHeader><CardTitle className="text-base">Audit Log</CardTitle><CardDescription>Last 200 events for this scoped view.</CardDescription></CardHeader>
            <CardContent>
              {audit.length === 0 ? <p className="text-muted-foreground text-sm py-4 text-center">No activity yet.</p> : (
                <div className="space-y-1.5">{audit.map(a => (
                  <div key={a.id} className="flex items-center gap-3 text-xs py-1.5 border-b border-border/40 last:border-0">
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{a.action}</Badge>
                    {a.meta?.count !== undefined && <span className="text-muted-foreground">{a.meta.count} rows</span>}
                    {a.meta?.fromCache && <Badge variant="outline" className="text-[10px] text-amber-300 border-amber-500/40">cached</Badge>}
                    {a.meta?.ip && <span className="font-mono text-muted-foreground">{a.meta.ip}</span>}
                    <span className="ml-auto text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</span>
                  </div>
                ))}</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="governance" className="space-y-3">
          <Card className="border-border/60">
            <CardHeader><CardTitle className="text-base">Token Governance</CardTitle><CardDescription>Rotate, revoke, set expiry.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-3 gap-3">
                <Button variant="outline" onClick={rotate}><RefreshCw className="w-4 h-4 mr-2" />Rotate Token</Button>
                {c.revoked ? <Button variant="outline" onClick={unrevoke} className="border-emerald-500/40 text-emerald-300"><ShieldCheck className="w-4 h-4 mr-2" />Un-revoke</Button> : <Button variant="outline" onClick={revoke} className="border-red-500/40 text-red-400"><ShieldOff className="w-4 h-4 mr-2" />Revoke</Button>}
                <div><Label>Expires at</Label>
                  <div className="flex gap-2"><Input type="datetime-local" value={c.expiresAt ? c.expiresAt.slice(0,16) : ''} onChange={e => setC({ ...c, expiresAt: e.target.value })} />
                  <Button size="sm" onClick={() => updField({ expiresAt: c.expiresAt || null })}>Save</Button></div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader><CardTitle className="text-base">Cache</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-3">
              <div className="flex items-center gap-3"><Label className="flex-1">Mode</Label>
                <Select value={c.cacheMode} onValueChange={(v) => updField({ cacheMode: v })}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="live">Live</SelectItem><SelectItem value="cached">Cached</SelectItem></SelectContent>
                </Select>
              </div>
              {c.cacheMode === 'cached' && (
                <div className="flex items-center gap-2"><Label className="flex-1">TTL (sec)</Label><Input type="number" value={c.cacheTTLSeconds} onChange={e => setC({ ...c, cacheTTLSeconds: parseInt(e.target.value) || 60 })} className="w-32" /><Button size="sm" onClick={() => updField({ cacheTTLSeconds: c.cacheTTLSeconds })}>Save</Button></div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader><CardTitle className="text-base">Field Masking</CardTitle><CardDescription>Mark columns to be returned as <code>J***e</code>.</CardDescription></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {(c.columns || []).map(name => {
                  const on = (c.maskedColumns || []).includes(name)
                  return <button key={name} onClick={() => { const next = on ? (c.maskedColumns || []).filter(x => x !== name) : [ ...(c.maskedColumns || []), name ]; updField({ maskedColumns: next }) }} className={`px-3 py-1 rounded-full border text-xs ${on ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-border/60 text-muted-foreground'}`}>{name}</button>
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function CodeSnippets({ apiUrl }) {
  const [tab, setTab] = useState('curl')
  const snippets = {
    curl: `curl -s "${apiUrl}?sort=-amount&limit=10" | jq`,
    python: `import requests

r = requests.get("${apiUrl}", params={"sort": "-amount", "limit": 10})
data = r.json()
print(data["count"], "records")
for row in data["data"]:
    print(row)`,
    javascript: `const res = await fetch("${apiUrl}?sort=-amount&limit=10");
const { data, count, total } = await res.json();
console.log(\`Got \${count} of \${total}\`, data);`,
    nextjs: `// Server Component (Next.js App Router)
export default async function Page() {
  const res = await fetch("${apiUrl}", { next: { revalidate: 60 } });
  const { data } = await res.json();
  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}`,
  }
  return (
    <Card className="border-border/60">
      <CardHeader><CardTitle className="text-base">Copy-paste code</CardTitle><CardDescription>Get up and running in seconds.</CardDescription></CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList><TabsTrigger value="curl">cURL</TabsTrigger><TabsTrigger value="python">Python</TabsTrigger><TabsTrigger value="javascript">JavaScript</TabsTrigger><TabsTrigger value="nextjs">Next.js</TabsTrigger></TabsList>
          {Object.entries(snippets).map(([k, v]) => (
            <TabsContent key={k} value={k}>
              <div className="relative">
                <pre className="bg-background/60 border border-border/60 rounded-md p-3 text-xs font-mono overflow-x-auto">{v}</pre>
                <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(v); toast.success('Copied') }} className="absolute top-2 right-2"><Copy className="w-3 h-3" /></Button>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  )
}

// ──────────────────── Google Sheet Configurator (private picker + public URL fallback) ────────────────────
function GoogleSheetConfigurator({ setParsed, parsed, url, setUrl, name, setName, parseGS, busy }) {
  const [gMode, setGMode] = useState('private') // 'private' or 'public'
  const [gStatus, setGStatus] = useState(null) // {connected, googleId, connectedAt}
  const [sheets, setSheets] = useState([])
  const [loadingSheets, setLoadingSheets] = useState(false)
  const [selSheet, setSelSheet] = useState(null) // {id, name}
  const [tabs, setTabs] = useState([])
  const [selTab, setSelTab] = useState(null) // {sheetId, title}
  const [loadingTabs, setLoadingTabs] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(false)

  const loadStatus = async () => {
    try { const s = await api('auth/google/status'); setGStatus(s); if (s.connected) loadSheets() } catch (e) { setGStatus({ connected: false }) }
  }
  const loadSheets = async () => {
    setLoadingSheets(true)
    try { const d = await api('google/sheets'); setSheets(d.sheets) } catch (e) { toast.error(e.message) } finally { setLoadingSheets(false) }
  }
  useEffect(() => { loadStatus() }, [])

  const pickSheet = async (s) => {
    setSelSheet(s); setTabs([]); setSelTab(null); setLoadingTabs(true)
    try {
      const d = await api(`google/sheets/${s.id}/meta`)
      setTabs(d.tabs)
      if (d.tabs.length === 1) { await pickTab(s, d.tabs[0]) }
    } catch (e) { toast.error(e.message) } finally { setLoadingTabs(false) }
  }
  const pickTab = async (sheet, tab) => {
    setSelTab(tab); setLoadingPreview(true)
    try {
      // Save as parsed (private mode). The actual structure verification happens server-side when source is saved.
      // Use rowCount estimate from tab metadata.
      setParsed({ private: true, spreadsheetId: sheet.id, sheetTitle: tab.title, title: sheet.name,
                  columns: Array.from({ length: tab.columnCount || 0 }, (_, i) => ({ id: `col${i}`, name: `Column ${i+1}`, type: 'string' })),
                  rowCount: Math.max(0, (tab.rowCount || 1) - 1) })
      if (!name) setName(`${sheet.name} / ${tab.title}`)
      toast.success('Sheet selected. Click "Save source" to confirm.')
    } catch (e) { toast.error(e.message) } finally { setLoadingPreview(false) }
  }

  const startOAuth = () => {
    // Link to current account
    const tok = localStorage.getItem('sf_token')
    window.location.href = `/api/auth/google/start?link=self&_=${Date.now()}`
    // Note: server reads Bearer for link mode. We need to pass token via header — but redirect can't send headers.
    // For link mode, use a cookie or pass token in query. Simplest: put token in localStorage and on callback redirect back.
    // The server route uses Bearer header; since we can't set headers on a redirect, we add token in a header via a workaround:
    // simplest: change to login mode (will reuse email-match logic to link)
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 p-1 bg-muted/40 rounded-md w-fit">
        <button onClick={() => setGMode('private')} className={`px-3 py-1 text-sm rounded ${gMode === 'private' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>Private (via Google)</button>
        <button onClick={() => setGMode('public')} className={`px-3 py-1 text-sm rounded ${gMode === 'public' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>Public link</button>
      </div>

      {gMode === 'private' && (
        <div className="space-y-3">
          {!gStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : !gStatus.connected ? (
            <div className="rounded-md border border-border/60 bg-card/40 p-4 text-center">
              <p className="text-sm text-muted-foreground mb-3">Sign in with Google to securely access your private spreadsheets.</p>
              <Button variant="outline" onClick={() => { const tok = localStorage.getItem('sf_token'); window.location.href = `/api/auth/google/start?link_token=${tok || ''}` }}>
                <svg className="w-4 h-4 mr-2" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.7 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.2 5.2C40.9 36 44 30.5 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg>
                Connect Google
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs">
                <span className="text-emerald-300 flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3" /> Google connected</span>
                <button onClick={loadSheets} className="text-cyan-400 hover:underline">Refresh list</button>
              </div>
              <div>
                <Label>Choose a spreadsheet</Label>
                {loadingSheets ? <Loader2 className="w-4 h-4 animate-spin my-2" /> : sheets.length === 0 ? <p className="text-sm text-muted-foreground">No spreadsheets found.</p> : (
                  <div className="max-h-48 overflow-y-auto border border-border/60 rounded-md divide-y divide-border/60">
                    {sheets.map(s => (
                      <button key={s.id} onClick={() => pickSheet(s)} className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40 ${selSheet?.id === s.id ? 'bg-cyan-500/10' : ''}`}>
                        <FileSpreadsheet className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        <span className="flex-1 truncate">{s.name}</span>
                        <span className="text-xs text-muted-foreground">{new Date(s.modifiedTime).toLocaleDateString()}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selSheet && (
                <div>
                  <Label>Choose a tab</Label>
                  {loadingTabs ? <Loader2 className="w-4 h-4 animate-spin my-2" /> : (
                    <Select value={selTab?.title || ''} onValueChange={(v) => { const t = tabs.find(x => x.title === v); if (t) pickTab(selSheet, t) }}>
                      <SelectTrigger><SelectValue placeholder="Pick a tab..." /></SelectTrigger>
                      <SelectContent>{tabs.map(t => <SelectItem key={t.sheetId} value={t.title}>{t.title} ({t.rowCount} × {t.columnCount})</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                </div>
              )}
              {parsed?.private && selTab && (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span><strong>{selSheet.name}</strong> → <strong>{selTab.title}</strong> ready. {parsed.rowCount} rows × {tabs.find(t => t.title === selTab.title)?.columnCount || '?'} cols.</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {gMode === 'public' && (
        <>
          <div><Label>Google Sheets URL</Label><Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=0" /></div>
          <div className="text-xs text-muted-foreground">Share as <strong>Anyone with the link → Viewer</strong>.</div>
          <Button onClick={parseGS} disabled={busy || !url} variant="outline">{busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Reading…</> : 'Verify sheet'}</Button>
        </>
      )}
    </div>
  )
}

// ──────────────────── Profile ────────────────────
function ProfilePage({ user, onLogout }) {
  const [gStatus, setGStatus] = useState(null)
  useEffect(() => { api('auth/google/status').then(setGStatus).catch(() => setGStatus({ connected: false })) }, [])
  const disconnect = async () => { if (!confirm('Disconnect Google? Private sheet sources will stop working.')) return; await api('auth/google/disconnect', { method: 'POST' }); toast.success('Google disconnected'); setGStatus({ connected: false }) }
  const connect = () => { const tok = localStorage.getItem('sf_token'); window.location.href = `/api/auth/google/start?link_token=${tok || ''}` }
  return (
    <div className="max-w-2xl space-y-6">
      <div><h1 className="text-2xl font-bold">Profile</h1><p className="text-sm text-muted-foreground mt-1">Account info & connected services.</p></div>
      <Card className="border-border/60">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-2xl text-white font-bold">{user.name?.[0]?.toUpperCase()}</div>
            <div><div className="font-semibold text-lg">{user.name}</div><div className="text-muted-foreground">{user.email}</div><Badge variant="outline" className="mt-1">{user.role}</Badge></div>
          </div>
          <Separator />
          <div>
            <div className="font-medium mb-2">Connected Services</div>
            <div className="flex items-center gap-3 p-3 rounded-md border border-border/60">
              <svg className="w-6 h-6" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.7 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.2 5.2C40.9 36 44 30.5 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg>
              <div className="flex-1">
                <div className="font-medium text-sm">Google</div>
                <div className="text-xs text-muted-foreground">{gStatus?.connected ? `Connected${gStatus.connectedAt ? ' on ' + new Date(gStatus.connectedAt).toLocaleDateString() : ''} • Sheets read-only` : 'Connect to access private Google Sheets'}</div>
              </div>
              {gStatus?.connected ? <Button size="sm" variant="outline" onClick={disconnect}>Disconnect</Button> : <Button size="sm" variant="outline" onClick={connect}>Connect</Button>}
            </div>
          </div>
          <Separator />
          <Button variant="outline" onClick={onLogout}><LogOut className="w-4 h-4 mr-2" />Sign out</Button>
        </CardContent>
      </Card>
    </div>
  )
}
