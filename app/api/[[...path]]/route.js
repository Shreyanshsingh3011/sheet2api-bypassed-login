import { NextResponse } from 'next/server'
import { getSupaDb } from '@/lib/supadb'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'

const MONGO_URL = process.env.MONGO_URL
const DB_NAME = process.env.DB_NAME || 'sheetflow_ai'
const JWT_SECRET = process.env.JWT_SECRET || 'sheetflow_dev_secret'
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI // optional - falls back to request origin
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || ''

// Derive base + redirect URI from the request (so it works on any deployed domain)
function getOriginFromRequest(request) {
  try {
    const xfHost = request.headers.get('x-forwarded-host')
    const xfProto = request.headers.get('x-forwarded-proto') || 'https'
    if (xfHost) return `${xfProto}://${xfHost}`
    return new URL(request.url).origin
  } catch { return BASE_URL }
}
function getRedirectUri(request) {
  if (GOOGLE_REDIRECT_URI) return GOOGLE_REDIRECT_URI
  return `${getOriginFromRequest(request)}/api/auth/google/callback`
}

// AES-256-GCM encryption for OAuth tokens at rest
const ENC_KEY = crypto.createHash('sha256').update(JWT_SECRET + '|sf_enc').digest()
function encryptStr(plaintext) {
  if (plaintext == null) return null
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv)
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}
function decryptStr(b64) {
  if (!b64) return null
  try {
    const buf = Buffer.from(b64, 'base64')
    const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), enc = buf.subarray(28)
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
  } catch (e) { return null }
}

let cachedClient = null
async function getDb() {
  // Backed by Supabase (PostgREST) via a MongoDB-compatible adapter.
  return getSupaDb()
}

const j = (data, status = 200) => NextResponse.json(data, { status, headers: { 'Access-Control-Allow-Origin': '*' } })
const e = (m, s = 400) => j({ error: m }, s)

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  }})
}

// ───────── Google Sheets utils ─────────
function extractSheetId(url) { const m = String(url||'').match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/); return m ? m[1] : null }
function extractGid(url) { const m = String(url||'').match(/[?&#]gid=([0-9]+)/); return m ? m[1] : '0' }

async function fetchGvizJson(sheetId, gid) {
  const gidPart = (gid !== undefined && gid !== null && gid !== '') ? `&gid=${gid}` : ''
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json${gidPart}&_cb=${Date.now()}`
  const res = await fetch(url, { cache: 'no-store', redirect: 'follow' })
  if (!res.ok) throw new Error(`Cannot read sheet (HTTP ${res.status}). Ensure share = "Anyone with link, Viewer".`)
  const text = await res.text()
  const a = text.indexOf('{'), b = text.lastIndexOf('}')
  if (a === -1 || b === -1) throw new Error('Invalid response from Google. Make sure the sheet link is public.')
  const p = JSON.parse(text.substring(a, b + 1))
  if (p.status === 'error') throw new Error('Sheet error: ' + (p.errors?.[0]?.detailed_message || 'unknown').replace(/<[^>]+>/g, ''))
  return p
}

// Discover every tab (gid) of a PUBLIC spreadsheet without OAuth, by scraping the
// htmlview page. Best-effort: returns [] on any failure.
async function listSheetGids(sheetId) {
  try {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/htmlview`, { cache: 'no-store', redirect: 'follow' })
    if (!res.ok) return []
    const html = await res.text()
    const gids = []
    const re = /[#?&]gid=(\d+)/g
    let m
    while ((m = re.exec(html)) !== null) { if (!gids.includes(m[1])) gids.push(m[1]) }
    return gids
  } catch { return [] }
}

// Robustly read a Google Sheet: always returns the tab that actually holds the data.
// 1) try the configured gid; 2) fall back to the default (first) sheet;
// 3) scan all tabs and pick the one with the most data rows.
async function fetchSheetSmart(sheetId, preferredGid) {
  // Fast path: the configured tab has rows.
  if (preferredGid !== undefined && preferredGid !== null && preferredGid !== '') {
    try { const p = parseGviz(await fetchGvizJson(sheetId, preferredGid)); if (p.rows.length) return p } catch {}
  }
  const collected = []
  // Default (first) sheet — handles the very common case where the data tab's gid changed.
  try { const p = parseGviz(await fetchGvizJson(sheetId)); if (p.rows.length) collected.push(p) } catch {}
  // Every other tab.
  const gids = await listSheetGids(sheetId)
  for (const gid of gids) {
    if (String(gid) === String(preferredGid)) continue
    try { const p = parseGviz(await fetchGvizJson(sheetId, gid)); if (p.rows.length) collected.push(p) } catch {}
  }
  if (collected.length) return collected.sort((a, b) => b.rows.length - a.rows.length)[0]
  // Last resort: return the configured tab even if empty (keeps column metadata).
  try { return parseGviz(await fetchGvizJson(sheetId, preferredGid)) } catch { return { columns: [], rows: [], rowCount: 0 } }
}

function parseGviz(g) {
  const t = g.table || {}
  const cols = (t.cols || []).map((c, i) => ({ id: c.id || `col${i}`, name: (c.label && c.label.trim()) || c.id || `Column ${i+1}`, type: c.type || 'string' }))
  let rows = (t.rows || []).map(r => (r.c || []).map(c => c ? c.v : null))
  const labelsEmpty = cols.every(c => !c.name || /^col\d+$|^Column \d+$/.test(c.name) || c.name === c.id)
  if (labelsEmpty && rows.length > 0) {
    const h = rows.shift()
    h.forEach((v, i) => { if (v && cols[i]) cols[i].name = String(v) })
  }
  return { columns: cols, rows, rowCount: rows.length }
}

const rowToObj = (cols, row, allowed) => {
  const o = {}; cols.forEach((c, i) => { if (!allowed || !allowed.length || allowed.includes(c.name)) o[c.name] = row[i] ?? null }); return o
}

// ───────── Query helpers ─────────
function applyFilter(records, filter) {
  if (!filter || !filter.column || !filter.operator) return records
  const { column, operator, value } = filter
  return records.filter(r => {
    const v = r[column]
    switch (operator) {
      case 'equals': return String(v) === String(value)
      case 'not_equals': return String(v) !== String(value)
      case 'contains': return String(v ?? '').toLowerCase().includes(String(value ?? '').toLowerCase())
      case 'greater_than': return Number(v) > Number(value)
      case 'less_than': return Number(v) < Number(value)
      case 'not_empty': return v !== null && v !== '' && v !== undefined
      default: return true
    }
  })
}

function applyQueryParams(records, sp) {
  // Search (q): substring match across all fields
  const q = sp.get('q')
  if (q) { const s = q.toLowerCase(); records = records.filter(r => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(s))) }
  // ?field=value style filtering
  for (const [k, v] of sp.entries()) {
    if (['q','sort','page','limit','offset','fields','format'].includes(k)) continue
    records = records.filter(r => String(r[k] ?? '').toLowerCase() === String(v).toLowerCase())
  }
  // Sort
  const sort = sp.get('sort')
  if (sort) {
    const desc = sort.startsWith('-')
    const key = desc ? sort.slice(1) : sort
    records = [...records].sort((a, b) => {
      const x = a[key], y = b[key]
      if (typeof x === 'number' && typeof y === 'number') return desc ? y - x : x - y
      return desc ? String(y ?? '').localeCompare(String(x ?? '')) : String(x ?? '').localeCompare(String(y ?? ''))
    })
  }
  // Fields projection (intersect with allowed)
  const fields = sp.get('fields')
  if (fields) {
    const ff = fields.split(',').map(s => s.trim()).filter(Boolean)
    records = records.map(r => { const o = {}; ff.forEach(f => { if (f in r) o[f] = r[f] }); return o })
  }
  // Pagination
  const limit = Math.min(parseInt(sp.get('limit') || '0') || 0, 5000)
  const page = parseInt(sp.get('page') || '0') || 0
  const offset = parseInt(sp.get('offset') || '0') || 0
  const total = records.length
  if (limit > 0) {
    const start = page > 0 ? (page - 1) * limit : offset
    records = records.slice(start, start + limit)
  }
  return { records, total }
}

function applyMasking(records, masked) {
  if (!masked?.length) return records
  return records.map(r => {
    const o = { ...r }
    masked.forEach(col => {
      if (col in o && o[col] !== null && o[col] !== undefined && o[col] !== '') {
        const s = String(o[col])
        o[col] = s.length <= 2 ? '***' : s[0] + '***' + s.slice(-1)
      }
    })
    return o
  })
}

// ───────── Auth ─────────
const signToken = u => jwt.sign({ id: u.id, email: u.email, name: u.name, role: u.role || 'admin' }, JWT_SECRET, { expiresIn: '30d' })

// LOGIN BYPASS: a fixed shared workspace user. Every request is treated as this
// user, so all features work without signing in. Data is scoped to this one account.
const DEMO_USER = { id: 'demo-workspace', email: 'demo@sheet2api.app', name: 'Demo', role: 'admin' }
function getAuthUser(request) {
  // If a real Bearer token is present and valid, honor it; otherwise fall back to the
  // shared demo workspace so the app is fully usable with no login.
  const auth = request.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (token) {
    try { return jwt.verify(token, JWT_SECRET) } catch { /* fall through to demo */ }
  }
  return DEMO_USER
}
const logAct = async (db, userId, action, meta = {}) => { await db.collection('activity').insertOne({ id: uuidv4(), userId, action, meta, createdAt: new Date().toISOString() }) }

// ───────── Generators ─────────
function gen_appsScript(c) {
  const cols = JSON.stringify(c.columns || []), filt = JSON.stringify(c.filter || {}), mask = JSON.stringify(c.maskedColumns || [])
  return `/**
 * Sheet2API AI - Auto-generated Apps Script
 * Connector: ${c.name} (${c.department})
 * Deploy: Extensions > Apps Script > Deploy > New deployment > Web app
 *   Execute as: Me, Who has access: Anyone
 * Then call: WEBAPP_URL?token=${c.token}
 */
const SECRET_TOKEN='${c.token}', SHEET_ID='${c.sheetId}', GID='${c.gid || '0'}';
const COLUMNS=${cols}, FILTER=${filt}, MASK=${mask};
function doGet(e){
  if(((e&&e.parameter&&e.parameter.token)||'')!==SECRET_TOKEN) return _j({error:'Unauthorized'});
  var ss=SpreadsheetApp.openById(SHEET_ID);
  var sh=ss.getSheets().filter(function(s){return String(s.getSheetId())===String(GID);})[0]||ss.getSheets()[0];
  var v=sh.getDataRange().getValues(); if(v.length<2) return _j({count:0,data:[]});
  var h=v[0].map(String), rows=v.slice(1);
  var data=rows.map(function(r){var o={};h.forEach(function(k,i){if(!COLUMNS.length||COLUMNS.indexOf(k)!==-1)o[k]=r[i]});return o;});
  if(FILTER&&FILTER.column&&FILTER.operator) data=data.filter(function(r){return _m(r[FILTER.column],FILTER.operator,FILTER.value);});
  if(MASK.length) data=data.map(function(r){MASK.forEach(function(k){if(r[k]!=null){var s=String(r[k]);r[k]=s.length<=2?'***':s[0]+'***'+s.slice(-1);}});return r;});
  return _j({connector:'${c.name}',department:'${c.department}',count:data.length,generated_at:new Date().toISOString(),data:data});
}
function _m(v,o,V){switch(o){case'equals':return String(v)===String(V);case'not_equals':return String(v)!==String(V);case'contains':return String(v||'').toLowerCase().indexOf(String(V||'').toLowerCase())!==-1;case'greater_than':return Number(v)>Number(V);case'less_than':return Number(v)<Number(V);case'not_empty':return v!=null&&v!=='';default:return true;}}
function _j(o){return ContentService.createTextOutput(JSON.stringify(o,null,2)).setMimeType(ContentService.MimeType.JSON);}
`
}

function gen_mcpServer(c, baseUrl) {
  const apiUrl = `${baseUrl}/api/public/${c.token}`
  const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')
  return `#!/usr/bin/env node
/**
 * Sheet2API AI - MCP Server for "${c.name}" (${c.department})
 *
 * Setup:
 *   1. Save this file as sheet2api-${slug}.mjs
 *   2. Run: npm install @modelcontextprotocol/sdk
 *   3. Add to Claude Desktop's claude_desktop_config.json:
 *        {
 *          "mcpServers": {
 *            "${slug}": {
 *              "command": "node",
 *              "args": ["/absolute/path/to/sheet2api-${slug}.mjs"]
 *            }
 *          }
 *        }
 *   4. Restart Claude Desktop. Your AI can now query this data.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const API_URL = '${apiUrl}';
const NAME = '${c.name}';

const server = new Server(
  { name: 'sheet2api-${slug}', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'query_${slug}',
      description: 'Query data from the "' + NAME + '" Sheet2API connector. Supports search, filtering, sorting, and pagination.',
      inputSchema: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Substring search across all fields' },
          sort: { type: 'string', description: 'Column to sort by; prefix with "-" for descending' },
          limit: { type: 'number', description: 'Max rows to return' }
        }
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const args = req.params.arguments || {};
  const url = new URL(API_URL);
  if (args.search) url.searchParams.set('q', args.search);
  if (args.sort) url.searchParams.set('sort', args.sort);
  if (args.limit) url.searchParams.set('limit', String(args.limit));
  const res = await fetch(url.toString());
  const data = await res.json();
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('Sheet2API MCP server "${slug}" running.');
`
}

function gen_openApi(c, baseUrl) {
  const cols = c.columns?.length ? c.columns : ['*']
  const props = {}
  ;(c.columns || []).forEach(name => { props[name] = { type: 'string', nullable: true } })
  return {
    openapi: '3.1.0',
    info: { title: `${c.name} API`, description: `Auto-generated by Sheet2API AI for ${c.department}.`, version: '1.0.0' },
    servers: [{ url: baseUrl }],
    paths: {
      [`/api/public/${c.token}`]: {
        get: {
          summary: `Fetch ${c.name} data`,
          description: `Returns ${c.department} records${c.filter?.column ? ` filtered where ${c.filter.column} ${c.filter.operator} ${c.filter.value}` : ''}.`,
          parameters: [
            { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Substring search across all fields' },
            { name: 'sort', in: 'query', schema: { type: 'string' }, description: 'Column to sort by; prefix - for desc' },
            { name: 'fields', in: 'query', schema: { type: 'string' }, description: 'Comma-separated columns to return' },
            { name: 'limit', in: 'query', schema: { type: 'integer' }, description: 'Page size (max 5000)' },
            { name: 'page', in: 'query', schema: { type: 'integer' }, description: 'Page number (1-based)' },
            { name: 'offset', in: 'query', schema: { type: 'integer' }, description: 'Offset (alternative to page)' },
          ],
          responses: {
            '200': {
              description: 'Success',
              content: { 'application/json': { schema: {
                type: 'object',
                properties: {
                  connector: { type: 'string' }, department: { type: 'string' }, count: { type: 'integer' }, total: { type: 'integer' },
                  generated_at: { type: 'string', format: 'date-time' },
                  data: { type: 'array', items: { type: 'object', properties: props } }
                }
              }}}
            },
            '401': { description: 'Invalid or revoked token' },
            '429': { description: 'Rate limit / quota exceeded' },
          }
        }
      }
    }
  }
}

// ───────── Cache ─────────
async function getCachedOrLive(db, connector, source) {
  if (connector.cacheMode === 'cached') {
    const ttl = (connector.cacheTTLSeconds || 300) * 1000
    const cached = await db.collection('cache').findOne({ tokenId: connector.id })
    if (cached && (Date.now() - new Date(cached.generatedAt).getTime()) < ttl) {
      return { columns: cached.columns, rows: cached.rows, fromCache: true }
    }
  }
  let columns, rows
  if (source.type === 'google_sheet') {
    const p = await fetchSheetSmart(source.sheetId, source.gid)
    columns = p.columns; rows = p.rows
  } else if (source.type === 'google_sheet_private') {
    const at = await getValidGoogleAccessToken(db, source.userId)
    const sd = await googleFetchSheetData(at, source.spreadsheetId, source.sheetTitle)
    columns = sd.columns; rows = sd.rows
  } else {
    columns = source.snapshot?.columns || []; rows = source.snapshot?.rows || []
  }
  if (connector.cacheMode === 'cached') {
    await db.collection('cache').updateOne({ tokenId: connector.id }, { $set: { tokenId: connector.id, columns, rows, generatedAt: new Date().toISOString() } }, { upsert: true })
  }
  return { columns, rows, fromCache: false }
}

const stripDoc = d => { if (!d) return d; const { _id, passwordHash, resetToken, resetExpires, googleAccessToken, googleRefreshToken, googleTokenExpiry, ...rest } = d; return rest }

// ───────── Google OAuth + Sheets/Drive ─────────
const GOOGLE_SCOPES = [
  'openid', 'email', 'profile',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
].join(' ')

function googleAuthUrl(state, mode = 'login', redirectUri) {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  u.searchParams.set('client_id', GOOGLE_CLIENT_ID)
  u.searchParams.set('redirect_uri', redirectUri)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', GOOGLE_SCOPES)
  u.searchParams.set('access_type', 'offline')
  u.searchParams.set('prompt', 'consent')
  u.searchParams.set('include_granted_scopes', 'true')
  u.searchParams.set('state', state + '::' + mode)
  return u.toString()
}

async function googleExchangeCode(code, redirectUri) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri, grant_type: 'authorization_code',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error('Google token exchange failed: ' + (data.error_description || data.error || 'unknown'))
  return data // { access_token, expires_in, refresh_token?, scope, token_type, id_token }
}

async function googleRefresh(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token', refresh_token: refreshToken,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error('Google refresh failed: ' + (data.error_description || data.error || 'unknown'))
  return data
}

async function googleUserInfo(accessToken) {
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: 'Bearer ' + accessToken } })
  if (!res.ok) throw new Error('Failed to fetch Google user info')
  return res.json()
}

async function getValidGoogleAccessToken(db, userId) {
  const u = await db.collection('users').findOne({ id: userId })
  if (!u || !u.googleAccessToken) throw new Error('Google account not connected. Re-authorize.')
  const expiry = u.googleTokenExpiry ? new Date(u.googleTokenExpiry).getTime() : 0
  if (Date.now() < expiry - 30000) return decryptStr(u.googleAccessToken)
  // refresh
  const rt = decryptStr(u.googleRefreshToken)
  if (!rt) throw new Error('No Google refresh token. Reconnect Google account.')
  const tk = await googleRefresh(rt)
  const newExpiry = new Date(Date.now() + (tk.expires_in || 3600) * 1000).toISOString()
  await db.collection('users').updateOne({ id: userId }, { $set: {
    googleAccessToken: encryptStr(tk.access_token), googleTokenExpiry: newExpiry,
  }})
  return tk.access_token
}

async function googleListSheets(accessToken) {
  const url = new URL('https://www.googleapis.com/drive/v3/files')
  url.searchParams.set('q', "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false")
  url.searchParams.set('fields', 'files(id,name,modifiedTime,owners)')
  url.searchParams.set('pageSize', '100')
  url.searchParams.set('orderBy', 'modifiedTime desc')
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } })
  const data = await res.json()
  if (!res.ok) throw new Error('Drive list failed: ' + (data.error?.message || 'unknown'))
  return data.files || []
}

async function googleSpreadsheetMeta(accessToken, spreadsheetId) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,properties.title,sheets.properties(sheetId,title,gridProperties)`
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } })
  const data = await res.json()
  if (!res.ok) throw new Error('Sheets meta failed: ' + (data.error?.message || 'unknown'))
  return data
}

async function googleFetchSheetData(accessToken, spreadsheetId, sheetTitle) {
  const range = sheetTitle ? `'${sheetTitle.replace(/'/g, "''")}'` : 'Sheet1'
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } })
  const data = await res.json()
  if (!res.ok) throw new Error('Sheets fetch failed: ' + (data.error?.message || 'unknown'))
  const values = data.values || []
  if (values.length === 0) return { columns: [], rows: [] }
  const headerRow = values[0].map((h, i) => ({ id: `col${i}`, name: String(h ?? `Column ${i+1}`), type: 'string' }))
  const rows = values.slice(1).map(r => {
    const out = []
    for (let i = 0; i < headerRow.length; i++) out.push(r[i] ?? null)
    return out
  })
  return { columns: headerRow, rows }
}

async function handler(request, { params }) {
  const path = (params?.path || []).join('/')
  const method = request.method
  const db = await getDb()

  try {
    if (path === '' || path === 'health') return j({ status: 'ok', service: 'Sheet2API AI', time: new Date().toISOString() })

    // TEMP DIAGNOSTIC — remove after debugging. Reports what Google returns for a sheet.
    const dbgm = path.match(/^debug\/sheet\/([a-zA-Z0-9-_]+)$/)
    if (dbgm && method === 'GET') {
      const sheetId = dbgm[1]
      const out = { sheetId }
      try { const p = parseGviz(await fetchGvizJson(sheetId)); out.defaultSheet = { cols: p.columns.map(c => c.name), rows: p.rows.length } }
      catch (err) { out.defaultSheet = { error: String(err.message) } }
      try { const r = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/htmlview`, { cache: 'no-store', redirect: 'follow' }); const t = await r.text(); out.htmlview = { status: r.status, length: t.length } }
      catch (err) { out.htmlview = { error: String(err.message) } }
      const gids = await listSheetGids(sheetId)
      out.gidsFound = gids
      out.tabs = []
      for (const gid of gids.slice(0, 25)) {
        try { const p = parseGviz(await fetchGvizJson(sheetId, gid)); out.tabs.push({ gid, rows: p.rows.length, sampleCols: p.columns.map(c => c.name).slice(0, 4) }) }
        catch (err) { out.tabs.push({ gid, error: String(err.message) }) }
      }
      return j(out)
    }

    // TEMP DIAGNOSTIC — runs the exact connector read path.
    const dbgc = path.match(/^debug\/connector\/([a-f0-9]+)$/)
    if (dbgc && method === 'GET') {
      const tok = dbgc[1]
      const c = await db.collection('connectors').findOne({ token: tok })
      if (!c) return j({ error: 'connector not found' })
      const src = await db.collection('sources').findOne({ id: c.sourceId })
      const effectiveSrc = src || (c.sheetId ? { type: 'google_sheet', sheetId: c.sheetId, gid: c.gid } : null)
      const out = { srcFound: !!src, effType: effectiveSrc?.type, effSheetId: effectiveSrc?.sheetId, effGid: effectiveSrc?.gid, cacheMode: c.cacheMode, connectorColumns: c.columns }
      try {
        const r = await getCachedOrLive(db, c, effectiveSrc)
        out.liveColumns = (r.columns || []).map(x => x.name)
        out.liveRowCount = (r.rows || []).length
        out.fromCache = r.fromCache
        const allowed = c.columns?.length ? c.columns : null
        out.sampleMapped = (r.rows || []).slice(0, 1).map(row => rowToObj(r.columns, row, allowed))
        // Replicate the EXACT public chain to find where rows vanish
        out.filterVal = c.filter ?? null
        out.maskedVal = c.maskedColumns ?? null
        let records = (r.rows || []).map(row => rowToObj(r.columns, row, allowed))
        out.afterMap = records.length
        records = applyFilter(records, c.filter)
        out.afterFilter = records.length
        records = applyMasking(records, c.maskedColumns)
        out.afterMask = records.length
        // second independent live read to test stability
        const r2 = await getCachedOrLive(db, c, effectiveSrc)
        out.liveRowCount2 = (r2.rows || []).length
      } catch (err) { out.error = String(err.message) }
      return j(out)
    }

    // ── AUTH ──
    if (path === 'auth/signup' && method === 'POST') {
      const { email, password, name } = await request.json()
      if (!email || !password) return e('Email and password required')
      const ex = await db.collection('users').findOne({ email: email.toLowerCase() })
      if (ex) return e('Email already registered', 409)
      const u = { id: uuidv4(), email: email.toLowerCase(), name: name || email.split('@')[0], passwordHash: await bcrypt.hash(password, 10), role: 'admin', createdAt: new Date().toISOString() }
      await db.collection('users').insertOne(u)
      const token = signToken(u); await logAct(db, u.id, 'signup', {})
      return j({ token, user: { id: u.id, email: u.email, name: u.name, role: u.role } })
    }
    if (path === 'auth/login' && method === 'POST') {
      const { email, password } = await request.json()
      const u = await db.collection('users').findOne({ email: (email || '').toLowerCase() })
      if (!u || !(await bcrypt.compare(password || '', u.passwordHash))) return e('Invalid credentials', 401)
      const token = signToken(u); await logAct(db, u.id, 'login', {})
      return j({ token, user: { id: u.id, email: u.email, name: u.name, role: u.role } })
    }
    if (path === 'auth/me' && method === 'GET') {
      const u = getAuthUser(request); if (!u) return e('Unauthorized', 401); return j({ user: u })
    }
    if (path === 'auth/forgot' && method === 'POST') {
      const { email } = await request.json()
      const u = await db.collection('users').findOne({ email: (email || '').toLowerCase() })
      // Always return success-ish to prevent enumeration, but only generate token if user exists
      if (!u) return j({ ok: true, resetUrl: null, note: 'If an account exists, a reset link was generated.' })
      const tok = crypto.randomBytes(24).toString('hex')
      await db.collection('users').updateOne({ id: u.id }, { $set: { resetToken: tok, resetExpires: new Date(Date.now() + 30 * 60 * 1000).toISOString() } })
      const base = process.env.NEXT_PUBLIC_BASE_URL || ''
      return j({ ok: true, resetUrl: `${base}/?reset=${tok}`, note: 'Email delivery not configured yet — copy this link to reset.' })
    }
    if (path === 'auth/reset' && method === 'POST') {
      const { token, password } = await request.json()
      if (!token || !password) return e('Missing token or password')
      const u = await db.collection('users').findOne({ resetToken: token })
      if (!u || !u.resetExpires || new Date(u.resetExpires) < new Date()) return e('Invalid or expired reset link', 400)
      await db.collection('users').updateOne({ id: u.id }, { $set: { passwordHash: await bcrypt.hash(password, 10) }, $unset: { resetToken: '', resetExpires: '' } })
      await logAct(db, u.id, 'password_reset', {})
      return j({ ok: true })
    }

    // ── Google OAuth ──
    if (path === 'auth/google/start' && method === 'GET') {
      if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        console.error('Google OAuth not configured: missing CLIENT_ID or CLIENT_SECRET')
        const origin = getOriginFromRequest(request)
        return NextResponse.redirect(`${origin}/?google_error=${encodeURIComponent('Google OAuth not configured on server')}`)
      }
      const redirectUri = getRedirectUri(request)
      const sp = new URL(request.url).searchParams
      const linkToken = sp.get('link_token')
      const state = uuidv4()
      const stateDoc = { id: state, createdAt: new Date().toISOString(), redirectUri }
      if (linkToken) {
        try { const decoded = jwt.verify(linkToken, JWT_SECRET); stateDoc.linkUserId = decoded.id } catch { /* ignore */ }
      }
      try { await db.collection('oauth_state').insertOne(stateDoc) } catch (err) {
        console.error('oauth_state insert failed:', err)
        const origin = getOriginFromRequest(request)
        return NextResponse.redirect(`${origin}/?google_error=${encodeURIComponent('Database error - try again')}`)
      }
      return NextResponse.redirect(googleAuthUrl(state, stateDoc.linkUserId ? 'link' : 'login', redirectUri))
    }

    if (path === 'auth/google/callback' && method === 'GET') {
      const origin = getOriginFromRequest(request)
      const sp = new URL(request.url).searchParams
      const code = sp.get('code'); const rawState = sp.get('state') || ''
      const errParam = sp.get('error')
      const redirectFront = (qs) => NextResponse.redirect(`${origin}/?${qs}`)
      if (errParam) return redirectFront(`google_error=${encodeURIComponent(errParam)}`)
      if (!code || !rawState) return redirectFront('google_error=missing_code')
      const [stateId, mode] = rawState.split('::')
      const st = await db.collection('oauth_state').findOne({ id: stateId })
      if (!st) return redirectFront('google_error=invalid_state')
      await db.collection('oauth_state').deleteOne({ id: stateId })

      // Use SAME redirect URI that was used in /start to satisfy Google
      const redirectUri = st.redirectUri || getRedirectUri(request)

      let tk, info
      try {
        tk = await googleExchangeCode(code, redirectUri)
        info = await googleUserInfo(tk.access_token)
      } catch (err) {
        console.error('Google OAuth exchange failed:', err.message)
        return redirectFront(`google_error=${encodeURIComponent(err.message || 'oauth_failed')}`)
      }
      const email = (info.email || '').toLowerCase()
      if (!email) return redirectFront('google_error=no_email')

      const expiry = new Date(Date.now() + (tk.expires_in || 3600) * 1000).toISOString()
      const tokenFields = {
        googleAccessToken: encryptStr(tk.access_token),
        googleTokenExpiry: expiry,
        googleId: info.sub,
        googleConnectedAt: new Date().toISOString(),
      }
      if (tk.refresh_token) tokenFields.googleRefreshToken = encryptStr(tk.refresh_token)

      let user
      if (mode === 'link' && st.linkUserId) {
        user = await db.collection('users').findOne({ id: st.linkUserId })
        if (!user) return redirectFront('google_error=user_missing')
        await db.collection('users').updateOne({ id: user.id }, { $set: tokenFields })
        await logAct(db, user.id, 'google_connected', { email })
        const jwtTok = signToken(user)
        return redirectFront(`google_login=1&token=${jwtTok}&linked=1`)
      }

      user = await db.collection('users').findOne({ email })
      if (!user) {
        user = {
          id: uuidv4(), email, name: info.name || info.given_name || email.split('@')[0],
          passwordHash: null, role: 'admin',
          createdAt: new Date().toISOString(),
          ...tokenFields,
        }
        await db.collection('users').insertOne(user)
        await logAct(db, user.id, 'signup', { via: 'google' })
      } else {
        await db.collection('users').updateOne({ id: user.id }, { $set: tokenFields })
        await logAct(db, user.id, 'login', { via: 'google' })
      }
      const jwtTok = signToken(user)
      return redirectFront(`google_login=1&token=${jwtTok}`)
    }

    if (path === 'auth/reset' && method === 'POST') { /* handled above */ }

    if (path === 'auth/google/status' && method === 'GET') {
      const cu = getAuthUser(request); if (!cu) return e('Unauthorized', 401)
      const u = await db.collection('users').findOne({ id: cu.id })
      return j({ connected: !!u?.googleRefreshToken || !!u?.googleAccessToken, googleId: u?.googleId || null, connectedAt: u?.googleConnectedAt || null })
    }
    if (path === 'auth/google/disconnect' && method === 'POST') {
      const cu = getAuthUser(request); if (!cu) return e('Unauthorized', 401)
      await db.collection('users').updateOne({ id: cu.id }, { $unset: { googleAccessToken: '', googleRefreshToken: '', googleTokenExpiry: '', googleId: '', googleConnectedAt: '' } })
      await logAct(db, cu.id, 'google_disconnected', {})
      return j({ ok: true })
    }

    // List the user's Google Spreadsheets (Drive)
    if (path === 'google/sheets' && method === 'GET') {
      const cu = getAuthUser(request); if (!cu) return e('Unauthorized', 401)
      try {
        const at = await getValidGoogleAccessToken(db, cu.id)
        const files = await googleListSheets(at)
        return j({ sheets: files.map(f => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime })) })
      } catch (err) { return e(err.message, 400) }
    }
    // List tabs of a specific spreadsheet
    const gsTab = path.match(/^google\/sheets\/([^/]+)\/meta$/)
    if (gsTab && method === 'GET') {
      const cu = getAuthUser(request); if (!cu) return e('Unauthorized', 401)
      try {
        const at = await getValidGoogleAccessToken(db, cu.id)
        const meta = await googleSpreadsheetMeta(at, gsTab[1])
        return j({
          spreadsheetId: meta.spreadsheetId, title: meta.properties?.title,
          tabs: (meta.sheets || []).map(s => ({ sheetId: s.properties.sheetId, title: s.properties.title, rowCount: s.properties.gridProperties?.rowCount, columnCount: s.properties.gridProperties?.columnCount })),
        })
      } catch (err) { return e(err.message, 400) }
    }

    // ── Legacy sheet parse (still used by some flows) ──
    if (path === 'sheets/parse' && method === 'POST') {
      const { url } = await request.json()
      const sheetId = extractSheetId(url); if (!sheetId) return e('Invalid Google Sheets URL.')
      const gid = extractGid(url)
      const p = await fetchSheetSmart(sheetId, gid); p.rowCount = p.rows.length
      return j({ sheetId, gid, columns: p.columns, rowCount: p.rowCount, preview: p.rows.slice(0, 5).map(r => rowToObj(p.columns, r)) })
    }

    const u = getAuthUser(request)

    // ── SOURCES ──
    if (path === 'sources' && method === 'GET') {
      if (!u) return e('Unauthorized', 401)
      const items = await db.collection('sources').find({ userId: u.id }).sort({ createdAt: -1 }).toArray()
      return j({ sources: items.map(s => { const x = stripDoc(s); delete x.snapshot; return x }) })
    }
    if (path === 'sources' && method === 'POST') {
      if (!u) return e('Unauthorized', 401)
      const b = await request.json()
      let src = { id: uuidv4(), userId: u.id, name: b.name || 'Untitled source', type: b.type, createdAt: new Date().toISOString() }
      if (b.type === 'google_sheet') {
        const sheetId = extractSheetId(b.url); if (!sheetId) return e('Invalid Google Sheets URL')
        const gid = extractGid(b.url)
        // verify + capture the tab that actually has data
        const p = await fetchSheetSmart(sheetId, gid); p.rowCount = p.rows.length
        src = { ...src, url: b.url, sheetId, gid, columnsMeta: p.columns, rowCount: p.rowCount }
      } else if (b.type === 'google_sheet_private') {
        if (!b.spreadsheetId || !b.sheetTitle) return e('Missing spreadsheetId or sheetTitle')
        // verify via OAuth
        try {
          const at = await getValidGoogleAccessToken(db, u.id)
          const sd = await googleFetchSheetData(at, b.spreadsheetId, b.sheetTitle)
          src = { ...src, spreadsheetId: b.spreadsheetId, sheetTitle: b.sheetTitle, columnsMeta: sd.columns, rowCount: sd.rows.length }
        } catch (err) { return e(err.message, 400) }
      } else if (b.type === 'xlsx_upload' || b.type === 'csv_upload') {
        if (!Array.isArray(b.columns) || !Array.isArray(b.rows)) return e('Missing columns/rows')
        src = { ...src, fileName: b.fileName || '', columnsMeta: b.columns, rowCount: b.rows.length,
          snapshot: { columns: b.columns, rows: b.rows } }
      } else return e('Unknown source type')
      await db.collection('sources').insertOne(src)
      await logAct(db, u.id, 'source_created', { sourceId: src.id, type: src.type, name: src.name })
      return j({ source: { ...stripDoc(src), snapshot: undefined } })
    }
    const srcMatch = path.match(/^sources\/([^/]+)$/)
    if (srcMatch) {
      if (!u) return e('Unauthorized', 401)
      const id = srcMatch[1]
      const src = await db.collection('sources').findOne({ id, userId: u.id })
      if (!src) return e('Not found', 404)
      if (method === 'GET') {
        // return preview from columnsMeta + first 5 rows
        let preview = []
        if (src.type === 'google_sheet') {
          try { const p = await fetchSheetSmart(src.sheetId, src.gid); preview = p.rows.slice(0,5).map(r => rowToObj(p.columns, r)) } catch {}
        } else if (src.type === 'google_sheet_private') {
          try {
            const at = await getValidGoogleAccessToken(db, u.id)
            const sd = await googleFetchSheetData(at, src.spreadsheetId, src.sheetTitle)
            preview = sd.rows.slice(0, 5).map(r => rowToObj(sd.columns, r))
          } catch {}
        } else {
          const cols = src.columnsMeta || []
          preview = (src.snapshot?.rows || []).slice(0, 5).map(r => rowToObj(cols, r))
        }
        return j({ source: { ...stripDoc(src), snapshot: undefined }, preview })
      }
      if (method === 'DELETE') {
        await db.collection('sources').deleteOne({ id, userId: u.id })
        await logAct(db, u.id, 'source_deleted', { sourceId: id })
        return j({ ok: true })
      }
    }

    // ── CONNECTORS ──
    if (path === 'connectors' && method === 'GET') {
      if (!u) return e('Unauthorized', 401)
      const items = await db.collection('connectors').find({ userId: u.id }).sort({ createdAt: -1 }).toArray()
      return j({ connectors: items.map(stripDoc) })
    }
    if (path === 'connectors' && method === 'POST') {
      if (!u) return e('Unauthorized', 401)
      const b = await request.json()
      if (!b.name || !b.department || !b.sourceId) return e('Missing required fields')
      const src = await db.collection('sources').findOne({ id: b.sourceId, userId: u.id })
      if (!src) return e('Source not found', 404)
      const token = crypto.randomBytes(16).toString('hex')
      const c = {
        id: uuidv4(), userId: u.id, sourceId: src.id, sourceType: src.type, sourceName: src.name,
        name: b.name, department: b.department,
        sheetId: src.sheetId || null, gid: src.gid || '0',
        columns: b.columns || [], filter: b.filter || null, maskedColumns: b.maskedColumns || [],
        cacheMode: b.cacheMode || 'live', cacheTTLSeconds: b.cacheTTLSeconds || 300,
        token, status: 'active', revoked: false, callCount: 0, lastSyncAt: null,
        expiresAt: b.expiresAt || null,
        createdAt: new Date().toISOString(),
      }
      await db.collection('connectors').insertOne(c)
      await logAct(db, u.id, 'connector_created', { connectorId: c.id, department: c.department, name: c.name })
      return j({ connector: stripDoc(c) })
    }

    const cm = path.match(/^connectors\/([^/]+)(?:\/(.+))?$/)
    if (cm) {
      if (!u) return e('Unauthorized', 401)
      const id = cm[1], sub = cm[2]
      const c = await db.collection('connectors').findOne({ id, userId: u.id })
      if (!c) return e('Connector not found', 404)
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || ''

      if (!sub && method === 'GET') return j({ connector: stripDoc(c) })
      if (!sub && method === 'DELETE') {
        await db.collection('connectors').deleteOne({ id, userId: u.id })
        await db.collection('cache').deleteOne({ tokenId: id })
        await logAct(db, u.id, 'connector_deleted', { connectorId: id })
        return j({ ok: true })
      }
      if (!sub && method === 'PATCH') {
        const b = await request.json()
        const allowed = ['name','department','columns','filter','maskedColumns','cacheMode','cacheTTLSeconds','expiresAt']
        const upd = {}; allowed.forEach(k => { if (k in b) upd[k] = b[k] })
        if (Object.keys(upd).length) await db.collection('connectors').updateOne({ id }, { $set: upd })
        await db.collection('cache').deleteOne({ tokenId: id })
        await logAct(db, u.id, 'connector_updated', { connectorId: id, fields: Object.keys(upd) })
        const after = await db.collection('connectors').findOne({ id })
        return j({ connector: stripDoc(after) })
      }
      if (sub === 'rotate-token' && method === 'POST') {
        const newTok = crypto.randomBytes(16).toString('hex')
        await db.collection('connectors').updateOne({ id }, { $set: { token: newTok } })
        await logAct(db, u.id, 'token_rotated', { connectorId: id })
        const after = await db.collection('connectors').findOne({ id })
        return j({ connector: stripDoc(after) })
      }
      if (sub === 'revoke' && method === 'POST') {
        await db.collection('connectors').updateOne({ id }, { $set: { revoked: true, status: 'revoked' } })
        await logAct(db, u.id, 'connector_revoked', { connectorId: id })
        return j({ ok: true })
      }
      if (sub === 'unrevoke' && method === 'POST') {
        await db.collection('connectors').updateOne({ id }, { $set: { revoked: false, status: 'active' } })
        await logAct(db, u.id, 'connector_unrevoked', { connectorId: id })
        return j({ ok: true })
      }
      if (sub === 'sync' && method === 'POST') {
        await db.collection('cache').deleteOne({ tokenId: id })
        await db.collection('connectors').updateOne({ id }, { $set: { lastSyncAt: new Date().toISOString() } })
        await logAct(db, u.id, 'connector_synced', { connectorId: id })
        return j({ ok: true, lastSyncAt: new Date().toISOString() })
      }
      if (sub === 'script' && method === 'GET') {
        return new NextResponse(gen_appsScript(c), { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
      }
      if (sub === 'mcp' && method === 'GET') {
        return new NextResponse(gen_mcpServer(c, baseUrl), { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
      }
      if (sub === 'openapi' && method === 'GET') {
        return j(gen_openApi(c, baseUrl))
      }
      if (sub === 'audit' && method === 'GET') {
        const items = await db.collection('activity').find({ userId: u.id, 'meta.connectorId': id }).sort({ createdAt: -1 }).limit(200).toArray()
        return j({ audit: items.map(stripDoc) })
      }
    }

    // ── STATS ──
    if (path === 'stats' && method === 'GET') {
      if (!u) return e('Unauthorized', 401)
      const conns = await db.collection('connectors').find({ userId: u.id }).toArray()
      const sources = await db.collection('sources').find({ userId: u.id }).toArray()
      const totalCalls = conns.reduce((s, c) => s + (c.callCount || 0), 0)
      const byDept = {}; conns.forEach(c => { byDept[c.department] = (byDept[c.department] || 0) + 1 })
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      const recent = await db.collection('activity').find({ userId: u.id, action: 'api_call', createdAt: { $gte: since } }).toArray()
      const dayMap = {}
      for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const key = d.toISOString().slice(0, 10); dayMap[key] = 0 }
      recent.forEach(r => { const k = r.createdAt.slice(0, 10); if (k in dayMap) dayMap[k]++ })
      const timeseries = Object.entries(dayMap).map(([date, calls]) => ({ date: date.slice(5), calls }))
      const callsByDept = {}
      const allCalls = await db.collection('activity').find({ userId: u.id, action: 'api_call' }).toArray()
      allCalls.forEach(a => { const c = conns.find(x => x.id === a.meta?.connectorId); if (c) callsByDept[c.department] = (callsByDept[c.department] || 0) + 1 })
      const recentActivity = await db.collection('activity').find({ userId: u.id }).sort({ createdAt: -1 }).limit(10).toArray()
      return j({
        connectorsCount: conns.length, sourcesCount: sources.length, totalCalls,
        activeCount: conns.filter(c => !c.revoked && c.status === 'active').length,
        byDepartment: byDept, timeseries, callsByDept,
        recentActivity: recentActivity.map(stripDoc),
      })
    }
    if (path === 'activity' && method === 'GET') {
      if (!u) return e('Unauthorized', 401)
      const items = await db.collection('activity').find({ userId: u.id }).sort({ createdAt: -1 }).limit(200).toArray()
      return j({ activity: items.map(stripDoc) })
    }

    // ── PUBLIC API (with query params, caching, masking, governance) ──
    const pubMatch = path.match(/^public\/([a-f0-9]+)$/)
    if (pubMatch && method === 'GET') {
      const tok = pubMatch[1]
      const c = await db.collection('connectors').findOne({ token: tok })
      if (!c) return e('Invalid or revoked API token', 401)
      if (c.revoked || c.status === 'revoked') return e('Token has been revoked', 401)
      if (c.expiresAt && new Date(c.expiresAt) < new Date()) return e('Token expired', 401)

      // Simple per-token rate limit: 120 req/min (in-memory)
      if (!global._sf_rl) global._sf_rl = new Map()
      const now = Date.now()
      const arr = (global._sf_rl.get(tok) || []).filter(t => now - t < 60000)
      if (arr.length >= 120) return e('Rate limit exceeded (120 req/min)', 429)
      arr.push(now); global._sf_rl.set(tok, arr)

      const src = await db.collection('sources').findOne({ id: c.sourceId })
      // backwards-compat: if no source (legacy connector with sheetId on itself), treat as google_sheet
      const effectiveSrc = src || (c.sheetId ? { type: 'google_sheet', sheetId: c.sheetId, gid: c.gid } : null)
      if (!effectiveSrc) return e('Source not found', 404)

      const { columns, rows, fromCache } = await getCachedOrLive(db, c, effectiveSrc)
      const allowed = c.columns?.length ? c.columns : null
      let records = rows.map(r => rowToObj(columns, r, allowed))
      const _afterMap = records.length
      records = applyFilter(records, c.filter)
      const _afterFilter = records.length
      records = applyMasking(records, c.maskedColumns)
      const _afterMask = records.length
      if (new URL(request.url).searchParams.get('__diag') === '1') {
        const testSp = new URLSearchParams('limit=2')
        const qp = applyQueryParams(records, testSp)
        return j({ __diag: true, rowsFromLive: rows.length, afterMap: _afterMap, afterFilter: _afterFilter, afterMask: _afterMask,
          qpTotal: qp.total, qpCount: qp.records.length,
          allowed, filter: c.filter ?? null, masked: c.maskedColumns ?? null })
      }
      const sp = new URL(request.url).searchParams
      const { records: out, total } = applyQueryParams(records, sp)

      await db.collection('connectors').updateOne({ id: c.id }, { $inc: { callCount: 1 }, $set: { lastSyncAt: new Date().toISOString() } })
      await db.collection('activity').insertOne({ id: uuidv4(), userId: c.userId, action: 'api_call',
        meta: { connectorId: c.id, count: out.length, fromCache, ip: request.headers.get('x-forwarded-for') || null },
        createdAt: new Date().toISOString() })

      return j({
        connector: c.name, department: c.department, count: out.length, total, fromCache,
        generated_at: new Date().toISOString(), data: out,
      })
    }

    return e('Not found: ' + path, 404)
  } catch (err) {
    console.error('API error:', err)
    return e(err.message || 'Internal server error', 500)
  }
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const DELETE = handler
export const PATCH = handler

// Force this route to be fully dynamic and never cache any fetch (e.g. Google Sheets reads).
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0
