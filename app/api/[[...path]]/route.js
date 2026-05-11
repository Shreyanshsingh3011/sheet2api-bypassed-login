import { NextResponse } from 'next/server'
import { MongoClient } from 'mongodb'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'

const MONGO_URL = process.env.MONGO_URL
const DB_NAME = process.env.DB_NAME || 'sheetflow_ai'
const JWT_SECRET = process.env.JWT_SECRET || 'sheetflow_dev_secret'

let cachedClient = null
async function getDb() {
  if (!cachedClient) {
    cachedClient = new MongoClient(MONGO_URL)
    await cachedClient.connect()
  }
  return cachedClient.db(DB_NAME)
}

function json(data, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Access-Control-Allow-Origin': '*' } })
}

function err(message, status = 400) {
  return json({ error: message }, status)
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' } })
}

// ------- Sheet utilities -------
function extractSheetId(url) {
  if (!url) return null
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return m ? m[1] : null
}
function extractGid(url) {
  if (!url) return '0'
  const m = url.match(/[?&#]gid=([0-9]+)/)
  return m ? m[1] : '0'
}

async function fetchGvizJson(sheetId, gid) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${gid}`
  const res = await fetch(url, { cache: 'no-store', redirect: 'follow' })
  if (!res.ok) {
    throw new Error(`Cannot read sheet (HTTP ${res.status}). Ensure it's shared as "Anyone with the link can view".`)
  }
  const text = await res.text()
  const jsonStart = text.indexOf('{')
  const jsonEnd = text.lastIndexOf('}')
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error('Invalid response from Google. Make sure the sheet link is public (Anyone with the link).')
  }
  let parsed
  try {
    parsed = JSON.parse(text.substring(jsonStart, jsonEnd + 1))
  } catch (e) {
    throw new Error('Could not parse Google Sheets response.')
  }
  if (parsed.status === 'error') {
    const msg = parsed.errors?.[0]?.detailed_message || parsed.errors?.[0]?.message || 'unknown'
    throw new Error('Sheet error: ' + msg.replace(/<[^>]+>/g, ''))
  }
  return parsed
}

function parseSheet(gvizData) {
  const table = gvizData.table || {}
  const cols = (table.cols || []).map((c, i) => ({
    id: c.id || `col${i}`,
    name: (c.label && c.label.trim()) || c.id || `Column ${i + 1}`,
    type: c.type || 'string',
  }))
  let rows = (table.rows || []).map(r => (r.c || []).map(cell => (cell ? cell.v : null)))
  // If header labels are empty/blank, treat first row as header
  const labelsEmpty = cols.every(c => !c.name || /^col\d+$|^Column \d+$/.test(c.name) || c.name === c.id)
  if (labelsEmpty && rows.length > 0) {
    const headerRow = rows.shift()
    headerRow.forEach((h, i) => { if (h && cols[i]) cols[i].name = String(h) })
  }
  return { columns: cols, rows, rowCount: rows.length }
}

function rowToObject(columns, row, allowedNames) {
  const o = {}
  columns.forEach((c, i) => {
    if (!allowedNames || allowedNames.length === 0 || allowedNames.includes(c.name)) {
      o[c.name] = row[i] === undefined ? null : row[i]
    }
  })
  return o
}

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

// ------- Auth -------
function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role || 'admin' }, JWT_SECRET, { expiresIn: '30d' })
}
function getAuthUser(request) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return null
  try { return jwt.verify(token, JWT_SECRET) } catch { return null }
}

async function logActivity(db, userId, action, meta = {}) {
  await db.collection('activity').insertOne({
    id: uuidv4(), userId, action, meta, createdAt: new Date().toISOString(),
  })
}

function generateAppsScript(connector) {
  const { token, name, department, sheetId, gid, columns, filter } = connector
  const cols = JSON.stringify(columns || [])
  const filt = JSON.stringify(filter || {})
  return `/**
 * SheetFlow AI - Auto-generated Apps Script
 * Connector: ${name} (${department})
 *
 * Deployment Steps:
 * 1. In your Google Sheet: Extensions > Apps Script
 * 2. Paste this entire code, save.
 * 3. Deploy > New deployment > Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Authorize and copy the Web app URL.
 * 5. Call:  YOUR_WEBAPP_URL?token=${token}
 */

const SECRET_TOKEN = '${token}';
const SHEET_ID = '${sheetId}';
const GID = '${gid}';
const COLUMNS = ${cols};
const FILTER = ${filt};

function doGet(e) {
  const token = (e && e.parameter && e.parameter.token) || '';
  if (token !== SECRET_TOKEN) {
    return _json({ error: 'Unauthorized' });
  }
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheets().filter(function(s){ return String(s.getSheetId()) === String(GID); })[0] || ss.getSheets()[0];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return _json({ connector: '${name}', department: '${department}', count: 0, data: [], generated_at: new Date().toISOString() });
  const headers = values[0].map(String);
  const rows = values.slice(1);
  let data = rows.map(function(r){
    var o = {};
    headers.forEach(function(h, i){
      if (COLUMNS.length === 0 || COLUMNS.indexOf(h) !== -1) o[h] = r[i];
    });
    return o;
  });
  if (FILTER && FILTER.column && FILTER.operator) {
    data = data.filter(function(r){ return _matches(r[FILTER.column], FILTER.operator, FILTER.value); });
  }
  return _json({
    connector: '${name}',
    department: '${department}',
    count: data.length,
    generated_at: new Date().toISOString(),
    data: data
  });
}

function _matches(v, op, val) {
  if (op === 'equals') return String(v) === String(val);
  if (op === 'not_equals') return String(v) !== String(val);
  if (op === 'contains') return String(v||'').toLowerCase().indexOf(String(val||'').toLowerCase()) !== -1;
  if (op === 'greater_than') return Number(v) > Number(val);
  if (op === 'less_than') return Number(v) < Number(val);
  if (op === 'not_empty') return v !== null && v !== '' && v !== undefined;
  return true;
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj, null, 2)).setMimeType(ContentService.MimeType.JSON);
}
`
}

// ------- Main handler -------
async function handler(request, { params }) {
  const path = (params?.path || []).join('/')
  const method = request.method
  const db = await getDb()

  try {
    // -------- Health --------
    if (path === '' || path === 'health') {
      return json({ status: 'ok', service: 'SheetFlow AI', time: new Date().toISOString() })
    }

    // -------- Auth --------
    if (path === 'auth/signup' && method === 'POST') {
      const { email, password, name } = await request.json()
      if (!email || !password) return err('Email and password required')
      const existing = await db.collection('users').findOne({ email: email.toLowerCase() })
      if (existing) return err('Email already registered', 409)
      const hash = await bcrypt.hash(password, 10)
      const user = {
        id: uuidv4(),
        email: email.toLowerCase(),
        name: name || email.split('@')[0],
        passwordHash: hash,
        role: 'admin',
        createdAt: new Date().toISOString(),
      }
      await db.collection('users').insertOne(user)
      const token = signToken(user)
      await logActivity(db, user.id, 'signup', {})
      return json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } })
    }

    if (path === 'auth/login' && method === 'POST') {
      const { email, password } = await request.json()
      if (!email || !password) return err('Email and password required')
      const user = await db.collection('users').findOne({ email: email.toLowerCase() })
      if (!user) return err('Invalid credentials', 401)
      const ok = await bcrypt.compare(password, user.passwordHash)
      if (!ok) return err('Invalid credentials', 401)
      const token = signToken(user)
      await logActivity(db, user.id, 'login', {})
      return json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } })
    }

    if (path === 'auth/me' && method === 'GET') {
      const u = getAuthUser(request)
      if (!u) return err('Unauthorized', 401)
      return json({ user: u })
    }

    // -------- Sheet parsing (preview, no auth required so user can try) --------
    if (path === 'sheets/parse' && method === 'POST') {
      const { url } = await request.json()
      const sheetId = extractSheetId(url)
      if (!sheetId) return err('Invalid Google Sheets URL. Use the link from your browser bar.')
      const gid = extractGid(url)
      const gviz = await fetchGvizJson(sheetId, gid)
      const parsed = parseSheet(gviz)
      return json({
        sheetId,
        gid,
        sheetName: gviz.table?.parsedNumHeaders !== undefined ? 'Sheet' : 'Sheet',
        columns: parsed.columns,
        rowCount: parsed.rowCount,
        preview: parsed.rows.slice(0, 5).map(r => rowToObject(parsed.columns, r)),
      })
    }

    // -------- Connectors (auth required) --------
    const authUser = getAuthUser(request)

    if (path === 'connectors' && method === 'GET') {
      if (!authUser) return err('Unauthorized', 401)
      const items = await db.collection('connectors').find({ userId: authUser.id }).sort({ createdAt: -1 }).toArray()
      return json({ connectors: items.map(stripMongoId) })
    }

    if (path === 'connectors' && method === 'POST') {
      if (!authUser) return err('Unauthorized', 401)
      const body = await request.json()
      const { name, department, sheetUrl, sheetId, gid, columns, filter, refreshFreq } = body
      if (!name || !department || !sheetId) return err('Missing required fields')
      const token = crypto.randomBytes(16).toString('hex')
      const connector = {
        id: uuidv4(),
        userId: authUser.id,
        name,
        department,
        sheetUrl: sheetUrl || '',
        sheetId,
        gid: gid || '0',
        columns: columns || [],
        filter: filter || null,
        refreshFreq: refreshFreq || 'realtime',
        token,
        status: 'active',
        callCount: 0,
        lastSyncAt: null,
        createdAt: new Date().toISOString(),
      }
      await db.collection('connectors').insertOne(connector)
      await logActivity(db, authUser.id, 'connector_created', { connectorId: connector.id, department, name })
      return json({ connector: stripMongoId(connector) })
    }

    const connectorMatch = path.match(/^connectors\/([^/]+)(?:\/(.+))?$/)
    if (connectorMatch) {
      const id = connectorMatch[1]
      const sub = connectorMatch[2]
      if (!authUser) return err('Unauthorized', 401)
      const connector = await db.collection('connectors').findOne({ id, userId: authUser.id })
      if (!connector) return err('Connector not found', 404)

      if (!sub && method === 'GET') {
        return json({ connector: stripMongoId(connector) })
      }
      if (!sub && method === 'DELETE') {
        await db.collection('connectors').deleteOne({ id, userId: authUser.id })
        await logActivity(db, authUser.id, 'connector_deleted', { connectorId: id })
        return json({ ok: true })
      }
      if (sub === 'script' && method === 'GET') {
        const code = generateAppsScript(connector)
        return new NextResponse(code, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
      }
      if (sub === 'sync' && method === 'POST') {
        // "sync" just touches the timestamp; data is live-fetched from Google.
        await db.collection('connectors').updateOne({ id }, { $set: { lastSyncAt: new Date().toISOString() } })
        await logActivity(db, authUser.id, 'connector_synced', { connectorId: id })
        return json({ ok: true, lastSyncAt: new Date().toISOString() })
      }
    }

    // -------- Stats / Activity --------
    if (path === 'stats' && method === 'GET') {
      if (!authUser) return err('Unauthorized', 401)
      const connectors = await db.collection('connectors').find({ userId: authUser.id }).toArray()
      const totalCalls = connectors.reduce((s, c) => s + (c.callCount || 0), 0)
      const byDept = {}
      connectors.forEach(c => { byDept[c.department] = (byDept[c.department] || 0) + 1 })
      const activity = await db.collection('activity').find({ userId: authUser.id }).sort({ createdAt: -1 }).limit(10).toArray()
      return json({
        connectorsCount: connectors.length,
        totalCalls,
        activeCount: connectors.filter(c => c.status === 'active').length,
        byDepartment: byDept,
        recentActivity: activity.map(stripMongoId),
      })
    }

    if (path === 'activity' && method === 'GET') {
      if (!authUser) return err('Unauthorized', 401)
      const items = await db.collection('activity').find({ userId: authUser.id }).sort({ createdAt: -1 }).limit(100).toArray()
      return json({ activity: items.map(stripMongoId) })
    }

    // -------- PUBLIC API (the magic) --------
    const publicMatch = path.match(/^public\/([a-f0-9]+)$/)
    if (publicMatch && method === 'GET') {
      const token = publicMatch[1]
      const connector = await db.collection('connectors').findOne({ token })
      if (!connector) return err('Invalid or revoked API token', 401)
      if (connector.status !== 'active') return err('Connector inactive', 403)

      const gviz = await fetchGvizJson(connector.sheetId, connector.gid)
      const parsed = parseSheet(gviz)
      const allowed = connector.columns && connector.columns.length > 0 ? connector.columns : null
      let records = parsed.rows.map(r => rowToObject(parsed.columns, r, allowed))
      records = applyFilter(records, connector.filter)

      // increment counter & last sync
      await db.collection('connectors').updateOne({ id: connector.id }, {
        $inc: { callCount: 1 },
        $set: { lastSyncAt: new Date().toISOString() },
      })
      await db.collection('activity').insertOne({
        id: uuidv4(), userId: connector.userId, action: 'api_call',
        meta: { connectorId: connector.id, count: records.length },
        createdAt: new Date().toISOString(),
      })

      return json({
        connector: connector.name,
        department: connector.department,
        count: records.length,
        generated_at: new Date().toISOString(),
        data: records,
      })
    }

    return err('Not found: ' + path, 404)
  } catch (e) {
    console.error('API error:', e)
    return err(e.message || 'Internal server error', 500)
  }
}

function stripMongoId(doc) {
  if (!doc) return doc
  const { _id, passwordHash, ...rest } = doc
  return rest
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const DELETE = handler
export const PATCH = handler
