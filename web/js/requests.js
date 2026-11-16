// Requests to the Admin (remove a student, temporary Finance access) and in-app notifications.
// The Admin approves, rejects, or creates a one-time code on their own computer and tells it to the employee.
import * as api from './api.js';
import { t } from './i18n.js';
import { h, clear, icon, toast, fail, modal, ago, fmtDateTime, studentRef } from './ui.js';
import { state, can, personName, loadMe } from './store.js';

const KIND = { remove_student: 'Remove student', finance_access: 'Finance access' };
const isAdminFor = (r) => (r.kind === 'remove_student' ? can('students.delete') : can('users.manage'));
const SEEN_KEY = () => 'sp:seen:' + state.me.id;
const seen = () => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY()) || '[]')); } catch { return new Set(); } };
const markSeen = (ids) => { const s = seen(); ids.forEach((i) => s.add(i)); try { localStorage.setItem(SEEN_KEY(), JSON.stringify([...s].slice(-300))); } catch {} };

let rows = [];
export async function loadRequests() {
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  rows = await api.select('admin_requests', `select=*&or=(status.in.(pending,code_issued),decided_at.gte.${since})&order=requested_at.desc`).catch(() => []);
  return rows;
}
// What needs this person's attention: requests to decide (Admins) + news about their own requests.
export function notificationCount() {
  const s = seen();
  const toDecide = rows.filter((r) => r.status === 'pending' && isAdminFor(r) && r.requested_by !== state.me.id).length;
  const news = rows.filter((r) => r.requested_by === state.me.id && ['code_issued', 'done', 'rejected'].includes(r.status) && !s.has(r.id + r.status)).length;
  return toDecide + news;
}
export async function refreshBadge() {
  await loadRequests();
  const n = notificationCount();
  const b = document.querySelector('.nav-item[data-id="notifications"] .badge');
  if (b) { b.textContent = n; b.hidden = !n; }
  return n;
}

const randomCode = () => {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [...crypto.getRandomValues(new Uint32Array(6))].map((n) => c[n % c.length]).join('');
};

// ---------------- page ----------------
export async function renderNotifications(el) {
  const body = h('div.req-wrap', h('div.spinner'));
  el.append(h('div.page-head', h('div', h('h1', t('Notifications')), h('p.muted', t('Requests to the Admin and their answers.')))), body);
  async function draw() {
    await loadRequests();
    clear(body);
    const decide = rows.filter((r) => isAdminFor(r) && r.requested_by !== state.me.id);
    const mine = rows.filter((r) => r.requested_by === state.me.id);
    if (decide.length || (can('students.delete') || can('users.manage'))) {
      body.append(h('section.card', h('div.card-head', h('h2', t('Requests from employees'))),
        decide.length ? h('div.req-list', decide.map((r) => adminRow(r, draw))) : h('p.muted.pad', t('No requests.'))));
    }
    body.append(h('section.card', h('div.card-head', h('h2', t('My requests'))),
      mine.length ? h('div.req-list', mine.map((r) => myRow(r, draw))) : h('p.muted.pad', t('You have not sent any requests.'))));
    markSeen(mine.filter((r) => ['code_issued', 'done', 'rejected'].includes(r.status)).map((r) => r.id + r.status));
    refreshBadge();
  }
  draw();
}

function what(r) {
  if (r.kind === 'remove_student') return [t('Remove'), ' ', r.status === 'done' ? h('b', r.student_name) : h('a', { href: `#/students/${r.student_id}` }, r.student_name), ' ', h('small.muted', studentRef(r.student_ref))];
  return [t('Finance access for {n} hours', { n: r.grant_hours })];
}
function statusTag(r) {
  const map = { pending: ['amber', 'Waiting for Admin'], code_issued: ['', 'Code given'], done: ['green', 'Done'], rejected: ['red', 'Rejected'], cancelled: ['', 'Cancelled'] };
  const [c, l] = map[r.status] || ['', r.status];
  return h('span.tag' + (c ? '.' + c : ''), t(l));
}

function adminRow(r, redraw) {
  const act = async (decision, extra = {}) => {
    try { await api.rpc('admin_resolve_request', { request: r.id, decision, ...extra }); redraw(); }
    catch (e) { fail(e); }
  };
  const open = ['pending', 'code_issued'].includes(r.status);
  return h('div.req-row',
    h('span.req-ic' + (r.kind === 'remove_student' ? '.red' : ''), icon(r.kind === 'remove_student' ? 'trash' : 'finance', 16)),
    h('div.req-main',
      h('div', h('b', personName(r.requested_by)), ' ', h('span.muted', t('asks:')), ' ', ...what(r)),
      r.reason ? h('div.req-reason', '“' + r.reason + '”') : null,
      h('small.muted', ago(r.requested_at), r.status === 'code_issued' && r.code_expires ? ' · ' + t('code valid until {d}', { d: fmtDateTime(r.code_expires) }) : '',
        r.decided_by && !open ? ' · ' + t('by {n}', { n: personName(r.decided_by) }) : '')),
    statusTag(r),
    open ? h('div.req-btns',
      h('button.btn.sm.primary', { onclick: async () => {
        const ok = r.kind === 'remove_student'
          ? await import('./ui.js').then((m) => m.confirmBox(t('Remove student'), t('Permanently delete {n} and their records now?', { n: r.student_name }), t('Delete now'), true))
          : true;
        if (ok) { await act('approve'); toast(r.kind === 'remove_student' ? t('Student removed') : t('Finance access given for {n} hours', { n: r.grant_hours })); }
      } }, icon('check', 14), r.kind === 'remove_student' ? t('Remove now') : t('Approve')),
      h('button.btn.sm', { onclick: () => giveCode(r, redraw) }, icon('key', 14), t('One-time code')),
      h('button.btn.sm.ghost-danger', { onclick: () => act('reject') }, t('Reject'))) : null);
}

function giveCode(r, redraw) {
  const code = randomCode();   // made here, on the Admin's computer; only a scrambled copy is stored
  const mins = h('select', [[15, '15 minutes'], [60, '1 hour'], [240, '4 hours'], [1440, '24 hours']].map(([v, l]) => h('option', { value: v }, t(l)))); mins.value = '60';
  modal({ title: t('One-time code'), body: h('div.form-col',
    h('p', t('Tell this code to {n}. It works once, only for this request, and only for them.', { n: personName(r.requested_by) })),
    h('div.otp', code),
    h('label', t('Valid for'), mins)),
  actions: [{ label: t('Cancel') }, { label: t('Activate code'), kind: 'primary', run: async () => {
    await api.rpc('admin_resolve_request', { request: r.id, decision: 'code', code, valid_minutes: parseInt(mins.value, 10) });
    toast(t('Code {c} is active', { c: code })); redraw();
  } }] });
}

function myRow(r, redraw) {
  const open = ['pending', 'code_issued'].includes(r.status);
  return h('div.req-row',
    h('span.req-ic' + (r.kind === 'remove_student' ? '.red' : ''), icon(r.kind === 'remove_student' ? 'trash' : 'finance', 16)),
    h('div.req-main', h('div', ...what(r)), r.reason ? h('div.req-reason', '“' + r.reason + '”') : null,
      h('small.muted', t('sent {x}', { x: ago(r.requested_at) }), r.decided_by ? ' · ' + t('answered by {n}', { n: personName(r.decided_by) }) : '')),
    statusTag(r),
    open ? h('div.req-btns',
      r.status === 'code_issued' ? h('button.btn.sm.primary', { onclick: () => enterCode(r, redraw) }, icon('key', 14), t('Enter code')) : null,
      h('button.btn.sm', { onclick: async () => { try { await api.rpc('cancel_request', { request: r.id }); redraw(); } catch (e) { fail(e); } } }, t('Cancel request'))) : null);
}

export function enterCode(r, after) {
  const inp = h('input.otp-input', { maxLength: 6, placeholder: '••••••', autocomplete: 'off' });
  modal({ title: t('Enter the code from the Admin'), body: h('div.form-col',
    h('p.muted', r.kind === 'remove_student' ? t('This will permanently remove {n}.', { n: r.student_name }) : t('This gives you Finance access for {n} hours.', { n: r.grant_hours })), inp),
  actions: [{ label: t('Cancel') }, { label: t('Confirm'), kind: r.kind === 'remove_student' ? 'danger' : 'primary', run: async () => {
    const kind = await api.rpc('redeem_code', { request: r.id, code: inp.value });
    if (kind === 'finance_access') { await loadMe(); toast(t('Finance access granted')); }
    else toast(t('{n} has been removed', { n: r.student_name }));
    after?.(kind);
  } }] });
}

// ---------------- used by the student profile ----------------
export async function removalState(studentId) {
  const r = await api.select('admin_requests', `select=*&kind=eq.remove_student&student_id=eq.${studentId}&requested_by=eq.${state.me.id}&status=in.(pending,code_issued)&limit=1`).catch(() => []);
  return r[0] || null;
}
export function requestRemoval(s, after) {
  const why = h('textarea', { rows: 3, placeholder: t('e.g. Registered twice by mistake') });
  modal({ title: t('Ask the Admin to remove {n}', { n: s.full_name }), body: h('div.form-col',
    h('p.muted', t('Only an Admin can remove students. The Admin will see your request in Notifications and either remove the student or give you a one-time code.')),
    h('label', t('Reason'), why)),
  actions: [{ label: t('Cancel') }, { label: t('Send request'), kind: 'primary', run: async () => {
    await api.rpc('request_removal', { student: s.id, why: why.value });
    toast(t('Request sent to the Admin')); after?.();
  } }] });
}

// ---------------- Finance access (for employees without it) ----------------
export async function financeAccessCard(el, onGranted) {
  const box = h('div.card.empty-big');
  el.append(box);
  const draw = async () => {
    const mine = (await api.select('admin_requests', `select=*&kind=eq.finance_access&requested_by=eq.${state.me.id}&status=in.(pending,code_issued)&limit=1`).catch(() => []))[0];
    clear(box).append(icon('lock', 36), h('h2', t('Finance is restricted')));
    if (!mine) {
      const hours = h('select', [[1, '1 hour'], [4, '4 hours'], [8, 'Today (8 hours)'], [24, '24 hours']].map(([v, l]) => h('option', { value: v }, t(l)))); hours.value = '4';
      const why = h('input', { placeholder: t('Reason (optional)') });
      box.append(h('p.muted', t('Ask the Admin for temporary access. They can approve it or give you a one-time code.')),
        h('div.req-form', hours, why, h('button.btn.primary', { onclick: async () => {
          try { await api.rpc('request_finance_access', { why: why.value, hours: parseInt(hours.value, 10) }); toast(t('Request sent to the Admin')); draw(); } catch (e) { fail(e); }
        } }, t('Request access'))));
    } else if (mine.status === 'code_issued') {
      box.append(h('p.muted', t('The Admin has created a code for you.')), h('button.btn.primary', { onclick: () => enterCode(mine, onGranted) }, icon('key', 16), t('Enter code')));
    } else {
      box.append(h('p.muted', t('Your request is waiting for the Admin.')), h('div.req-form',
        h('button.btn', { onclick: async () => { await loadMe(); if (can('finance.view')) onGranted(); else draw(); } }, icon('refresh', 16), t('Check again')),
        h('button.btn', { onclick: async () => { await api.rpc('cancel_request', { request: mine.id }); draw(); } }, t('Cancel request'))));
    }
  };
  draw();
}
