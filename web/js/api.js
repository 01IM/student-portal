// Talks to AKI's Supabase project over its REST API (no SDK needed).
// The connection (project URL + public key) and the sign-in session are kept on this PC only.
const CFG_KEY = 'sp:cfg';
const SES_KEY = 'sp:session';

const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const save = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} };

let cfg = load(CFG_KEY);       // { url, anon }
let session = load(SES_KEY);   // { access_token, refresh_token, expires_at, user }

export const config = () => cfg;
export const user = () => session?.user || null;
export const signedIn = () => !!session?.refresh_token;

export class ApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

export function setConfig(url, anon) {
  url = url.trim().replace(/\/+$/, '');
  if (!/^https:\/\/[^/]+$/.test(url)) throw new ApiError('The project URL should look like https://abcdxyz.supabase.co');
  cfg = { url, anon: anon.trim() };
  save(CFG_KEY, cfg);
}
export function clearConfig() { cfg = null; session = null; save(CFG_KEY, null); save(SES_KEY, null); }

function friendly(j, status) {
  const m = j?.msg || j?.error_description || j?.message || j?.error || '';
  if (/invalid login credentials/i.test(m)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(m)) return 'This email address has not been confirmed. In Supabase, turn off "Confirm email" (see the setup guide).';
  if (/user already registered/i.test(m)) return 'An account with this email already exists.';
  if (/signups not allowed/i.test(m)) return 'New sign-ups are switched off in Supabase. Turn on "Allow new users to sign up" (see the setup guide).';
  if (j?.code === '23505') {
    if (/civil_id/.test(m)) return 'Another student already has this Civil ID number.';
    if (/passport/.test(m)) return 'Another student already has this passport number.';
    return 'This record already exists.';
  }
  if (j?.code === '42501' || status === 403) return 'You do not have permission to do this.';
  if (j?.code === 'P0001') return m;   // messages raised by the database itself
  if (status === 0) return 'Cannot reach the server. Check the internet connection.';
  return m || `Request failed (${status})`;
}

async function raw(path, opts = {}, auth = true) {
  if (!cfg) throw new ApiError('Not connected');
  const headers = { apikey: cfg.anon, ...(opts.headers || {}) };
  if (auth) headers.Authorization = `Bearer ${await token()}`;
  if (opts.body && typeof opts.body !== 'string') { headers['Content-Type'] = 'application/json'; opts = { ...opts, body: JSON.stringify(opts.body) }; }
  let res;
  try { res = await fetch(cfg.url + path, { ...opts, headers }); }
  catch { throw new ApiError(friendly(null, 0), 0); }
  const text = await res.text();
  let j = null; try { j = text ? JSON.parse(text) : null; } catch { j = text; }
  if (!res.ok) {
    if (res.status === 401 && auth && session) { session = null; save(SES_KEY, null); onSignedOut?.(); }
    throw new ApiError(friendly(j, res.status), res.status, j?.code);
  }
  return { data: j, res };
}

// ---------------- authentication ----------------
let onSignedOut = null;
export function onSessionLost(fn) { onSignedOut = fn; }

function keep(j) {
  session = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in || 3600) * 1000 - 60000, user: j.user };
  save(SES_KEY, session);
}
let refreshing = null;
async function token() {
  if (!session) throw new ApiError('Signed out', 401);
  if (Date.now() < session.expires_at) return session.access_token;
  refreshing ||= raw('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } }, false)
    .then(({ data }) => keep(data))
    .catch((e) => { if (e.status && e.status < 500) { session = null; save(SES_KEY, null); onSignedOut?.(); } throw e; })
    .finally(() => { refreshing = null; });
  await refreshing;
  return session.access_token;
}

export async function signIn(email, password) {
  const { data } = await raw('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: email.trim(), password } }, false);
  keep(data);
  return data.user;
}
export async function signOut() {
  try { await raw('/auth/v1/logout', { method: 'POST' }); } catch {}
  session = null; save(SES_KEY, null);
}
export async function changePassword(password) {
  await raw('/auth/v1/user', { method: 'PUT', body: { password } });
}
// Used by an Admin to create an employee login. The new account starts inactive; the Admin then gives it a role.
export async function createLogin(email, password, full_name) {
  const { data } = await raw('/auth/v1/signup', { method: 'POST', body: { email: email.trim(), password, data: { full_name } } }, false);
  const u = data?.user || data;
  if (!u?.id) throw new ApiError('The account could not be created.');
  if (u.identities && u.identities.length === 0) throw new ApiError('An account with this email already exists.');
  return u;
}

// ---------------- data ----------------
// select('students', 'select=*&order=full_name')
export async function select(table, query = 'select=*') {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await raw(`/rest/v1/${table}?${query}`, { headers: { Range: `${from}-${from + 999}`, 'Range-Unit': 'items' } });
    out.push(...data);
    if (data.length < 1000) return out;
  }
}
export async function one(table, query) {
  const { data } = await raw(`/rest/v1/${table}?${query}`, { headers: { Accept: 'application/vnd.pgrst.object+json' } }).catch((e) => {
    if (e.status === 406) throw new ApiError('This record no longer exists or you cannot see it.', 404);
    throw e;
  });
  return data;
}
export async function insert(table, row) {
  const { data } = await raw(`/rest/v1/${table}`, { method: 'POST', headers: { Prefer: 'return=representation' }, body: row });
  return Array.isArray(data) ? data[0] : data;
}
// update('students', id, {phone}, '2026-11-16T…')  → fails if someone else saved the record after `expectUpdatedAt`
export async function update(table, id, patch, expectUpdatedAt) {
  let q = `id=eq.${encodeURIComponent(id)}`;
  if (expectUpdatedAt) q += `&updated_at=eq.${encodeURIComponent(expectUpdatedAt)}`;
  const { data } = await raw(`/rest/v1/${table}?${q}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: patch });
  if (!data || !data.length) {
    if (expectUpdatedAt) throw new ApiError('Someone else changed this record while you were editing. Reload it to see their changes, then edit again.', 409, 'conflict');
    throw new ApiError('You do not have permission to change this record.', 403);
  }
  return data[0];
}
export async function remove(table, id) {
  const { data } = await raw(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
  if (!data || !data.length) throw new ApiError('You do not have permission to delete this record.', 403);
}
export async function rpc(fn, args = {}) {
  const { data } = await raw(`/rest/v1/rpc/${fn}`, { method: 'POST', body: args });
  return data;
}
