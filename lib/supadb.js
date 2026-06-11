// Minimal MongoDB-compatible data layer backed by Supabase (PostgREST).
// Each "collection" is a Postgres table with shape (id text primary key, data jsonb).
// This lets the existing route.js logic keep using db.collection('x').findOne/find/insertOne/updateOne/deleteOne
// without rewriting query logic. Collections are tiny here, so non-indexed filters are resolved in JS.

import { v4 as uuidv4 } from 'uuid'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY

// Natural primary-key field per collection (the field whose value becomes the row id).
const KEY_FIELD = {
  users: 'id',
  sources: 'id',
  connectors: 'id',
  activity: 'id',
  oauth_state: 'id',
  cache: 'tokenId',
}

function rest(table) {
  return `${SUPABASE_URL}/rest/v1/${table}`
}
function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
}

// Apply a Mongo-style filter to a single doc (supports dotted keys, $gte/$gt/$lt/$ne).
function matchDoc(doc, filter) {
  if (!filter) return true
  for (const [k, v] of Object.entries(filter)) {
    const dv = k.includes('.') ? getPath(doc, k) : doc[k]
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if ('$gte' in v && !(String(dv ?? '') >= String(v.$gte))) return false
      if ('$gt' in v && !(dv > v.$gt)) return false
      if ('$lt' in v && !(dv < v.$lt)) return false
      if ('$ne' in v && String(dv) === String(v.$ne)) return false
    } else {
      if (String(dv) !== String(v)) return false
    }
  }
  return true
}

// Build a PostgREST query that pushes down the indexable parts of the filter.
function buildQuery(table, filter) {
  const keyField = KEY_FIELD[table] || 'id'
  const parts = ['select=*']
  if (filter) {
    for (const [k, v] of Object.entries(filter)) {
      if (v && typeof v === 'object') continue // $gte etc resolved in JS
      if (k.includes('.')) continue // nested resolved in JS
      const val = encodeURIComponent(String(v))
      if (k === keyField) parts.push(`id=eq.${val}`)
      else parts.push(`data->>${encodeURIComponent(k)}=eq.${val}`)
    }
  }
  parts.push('limit=10000')
  return `${rest(table)}?${parts.join('&')}`
}

async function queryDocs(table, filter) {
  const res = await fetch(buildQuery(table, filter), { headers: headers(), cache: 'no-store' })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Supabase query failed (${res.status}) on ${table}: ${txt}`)
  }
  const rows = await res.json()
  const docs = rows.map(r => r.data)
  return docs.filter(d => matchDoc(d, filter))
}

function cmp(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a ?? '').localeCompare(String(b ?? ''))
}

async function rowIdForFilter(table, keyField, filter) {
  if (filter && filter[keyField] != null) return String(filter[keyField])
  const docs = await queryDocs(table, filter)
  if (!docs.length) return null
  const d = docs[0]
  return String(d[keyField] ?? d.id)
}

function applyUpdate(doc, update) {
  const out = { ...(doc || {}) }
  if (update.$set) for (const [k, v] of Object.entries(update.$set)) out[k] = v
  if (update.$inc) for (const [k, v] of Object.entries(update.$inc)) out[k] = (Number(out[k]) || 0) + v
  if (update.$unset) for (const k of Object.keys(update.$unset)) delete out[k]
  // direct replacement (no operator) — not used here but supported
  const hasOp = update.$set || update.$inc || update.$unset
  if (!hasOp) return { ...update }
  return out
}

function collection(table) {
  const keyField = KEY_FIELD[table] || 'id'

  async function insertOne(doc) {
    const rowId = String(doc[keyField] ?? doc.id ?? uuidv4())
    const res = await fetch(rest(table), {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal,resolution=merge-duplicates' }),
      body: JSON.stringify({ id: rowId, data: doc }),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`Supabase insert failed (${res.status}) on ${table}: ${txt}`)
    }
    return { insertedId: rowId, acknowledged: true }
  }

  async function findOne(filter) {
    const docs = await queryDocs(table, filter)
    return docs[0] || null
  }

  function find(filter) {
    let sortSpec = null
    let lim = null
    const chain = {
      sort(s) { sortSpec = s; return chain },
      limit(n) { lim = n; return chain },
      async toArray() {
        let docs = await queryDocs(table, filter)
        if (sortSpec) {
          const [k, dir] = Object.entries(sortSpec)[0]
          docs = [...docs].sort((a, b) => (dir < 0 ? cmp(b[k], a[k]) : cmp(a[k], b[k])))
        }
        if (lim != null) docs = docs.slice(0, lim)
        return docs
      },
    }
    return chain
  }

  async function updateOne(filter, update, opts = {}) {
    const id = await rowIdForFilter(table, keyField, filter)
    let existing = null
    if (id != null) existing = await findById(table, id)

    if (!existing) {
      if (opts.upsert) {
        // seed base doc from scalar equality fields in the filter
        const base = {}
        if (filter) for (const [k, v] of Object.entries(filter)) {
          if (v && typeof v === 'object') continue
          if (k.includes('.')) continue
          base[k] = v
        }
        const newDoc = applyUpdate(base, update)
        await insertOne(newDoc)
        return { matchedCount: 0, upsertedCount: 1, acknowledged: true }
      }
      return { matchedCount: 0, modifiedCount: 0, acknowledged: true }
    }

    const newDoc = applyUpdate(existing, update)
    const res = await fetch(`${rest(table)}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ data: newDoc }),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`Supabase update failed (${res.status}) on ${table}: ${txt}`)
    }
    return { matchedCount: 1, modifiedCount: 1, acknowledged: true }
  }

  async function deleteOne(filter) {
    const id = await rowIdForFilter(table, keyField, filter)
    if (id == null) return { deletedCount: 0, acknowledged: true }
    const res = await fetch(`${rest(table)}?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: headers({ Prefer: 'return=minimal' }),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`Supabase delete failed (${res.status}) on ${table}: ${txt}`)
    }
    return { deletedCount: 1, acknowledged: true }
  }

  return { insertOne, findOne, find, updateOne, deleteOne }
}

async function findById(table, id) {
  const res = await fetch(`${rest(table)}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, {
    headers: headers(), cache: 'no-store',
  })
  if (!res.ok) return null
  const rows = await res.json()
  return rows[0]?.data || null
}

let _db = null
export function getSupaDb() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_KEY env vars are required')
  }
  if (!_db) _db = { collection }
  return _db
}
