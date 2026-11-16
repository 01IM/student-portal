// Home screen: today's picture for the signed-in employee.
import * as api from './api.js';
import { t } from './i18n.js';
import { h, clear, icon, fail, fmtDate, daysUntil, ago, studentRef, pill } from './ui.js';
import { state, can, activeStatuses, statusById, personName } from './store.js';
import { setListFilter, describeChange } from './students.js';
import { todayCard } from './followups.js';

export async function renderHome(el) {
  const me = state.me;
  const hour = new Date().getHours();
  const hello = hour < 12 ? t('Good morning') : hour < 17 ? t('Good afternoon') : t('Good evening');
  const first = (me.full_name || '').split(' ')[0];
  const body = h('div.home-grid', h('div.card.loading-card', h('div.spinner')));
  el.append(h('div.page-head', h('div', h('h1', `${hello}${first ? ', ' + first : ''}`),
    h('p.muted', new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })))), body);

  if (!can('students.view')) {
    clear(body).append(h('div.card', h('p.muted', t('Your account has no access to student records yet. Ask your administrator if you need it.'))));
    return;
  }
  try {
    const [students, activity] = await Promise.all([
      api.select('students', 'select=id,ref,full_name,status_id,counsellor_id,created_at,passport_expiry,civil_id_expiry'),
      api.select('audit_log', 'select=*&student_id=not.is.null&order=at.desc&limit=12').catch(() => []),
    ]);
    clear(body);
    const today = await todayCard();
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const mine = students.filter((s) => s.counsellor_id === me.id);
    const closed = new Set(state.statuses.filter((s) => /withdrawn|not proceeding|enrolled/i.test(s.name)).map((s) => s.id));
    const open = students.filter((s) => !closed.has(s.status_id));

    // --- headline numbers
    body.append(h('div.stats',
      stat(t('Students'), students.length, 'student', () => go({})),
      stat(t('New this month'), students.filter((s) => new Date(s.created_at) >= monthStart).length, 'plus', () => go({ sort: 'created_at', dir: -1 })),
      stat(t('My students'), mine.length, 'users', () => go({ counsellor: me.id })),
      stat(t('In progress'), open.length, 'clock', () => go({}))));
    body.append(today);

    // --- pipeline
    const counts = {}; students.forEach((s) => { counts[s.status_id || ''] = (counts[s.status_id || ''] || 0) + 1; });
    const max = Math.max(1, ...Object.values(counts));
    const pipe = h('div.pipeline');
    for (const st of activeStatuses()) {
      const n = counts[st.id] || 0;
      pipe.append(h('button.pipe-row', { onclick: () => go({ statuses: [st.id] }) },
        h('span.pipe-name', st.name),
        h('span.pipe-bar', h('i', { style: { width: (n / max) * 100 + '%', background: st.color } })),
        h('b.pipe-n', n)));
    }
    body.append(h('section.card.span2', h('div.card-head', h('h2', t('Pipeline')), h('a.link', { href: '#/students' }, t('All students'))), pipe));

    // --- expiring documents
    const soon = [];
    for (const s of open) {
      for (const [k, label] of [['passport_expiry', t('Passport')], ['civil_id_expiry', t('Civil ID')]]) {
        const d = daysUntil(s[k]);
        if (d != null && d <= 180) soon.push({ s, label, d, date: s[k] });
      }
    }
    soon.sort((a, b) => a.d - b.d);
    body.append(h('section.card', h('div.card-head', h('h2', t('Expiring documents')), h('small.muted', t('next 6 months'))),
      soon.length ? h('ul.list', soon.slice(0, 8).map(({ s, label, d, date }) => h('li', h('a', { href: `#/students/${s.id}` },
        h('div', h('b', s.full_name), h('small.muted', `${label} · ${fmtDate(date)}`)),
        h('span.tag' + (d < 0 ? '.red' : d <= 60 ? '.amber' : ''), d < 0 ? t('expired') : t('{n} days', { n: d })))))) : h('p.muted.pad', t('Nothing expiring soon.'))));


    // --- recent activity
    const names = Object.fromEntries(students.map((s) => [s.id, s]));
    body.append(h('section.card.span2', h('div.card-head', h('h2', t('Recent activity'))),
      activity.length ? h('ul.feed', activity.map((a) => h('li',
        h('span.feed-dot'),
        h('div', h('div', h('b', a.actor_name || t('System')), ' ', describeChange(a, true), ' ',
          names[a.student_id] ? h('a', { href: `#/students/${a.student_id}` }, names[a.student_id].full_name) : h('span', a.label || '')),
        h('small.muted', ago(a.at)))))) : h('p.muted.pad', t('No activity yet.'))));

    if (can('finance.view')) body.append(h('section.card', h('div.card-head', h('h2', t('Finance summary'))), h('p.muted.pad', t('Arrives with the Finance module.'))));
  } catch (e) { fail(e); clear(body).append(h('div.card', h('p.muted', e.message))); }
}

function stat(label, n, ic, onclick) {
  return h('button.stat', { onclick }, h('span.stat-ic', icon(ic, 20)), h('div', h('b', n), h('small', label)));
}
function go(filter) { setListFilter(filter); location.hash = '#/students'; }
