// Students: the list, the profile page, the new-student form, communication log and change history.
import * as api from './api.js';
import { t } from './i18n.js';
import { h, clear, icon, toast, fail, modal, confirmBox, fmtDate, fmtDateTime, ago, daysUntil, studentRef, initials, pill, copyText } from './ui.js';
import { state, can, activeStatuses, statusById, personName, staff } from './store.js';
import { GROUPS, FIELD, OPTIONS, CONTACT_KIND_LABEL, CONTACT_KIND_ICON } from './fields.js';
import { followUpForm, followUpsTab, contactButtons } from './followups.js';
import { removalState, requestRemoval, enterCode } from './requests.js';

// =====================================================================
//  List
// =====================================================================
const LIST_COLS = 'id,ref,full_name,nationality,phone,email,status_id,counsellor_id,preferred_courses,preferred_countries,preferred_level,civil_id,passport_no,lead_source,created_at,updated_at';
const PAGE = 50;
let filter = loadFilter();
function loadFilter() {
  try { return { q: '', statuses: [], counsellor: '', nationality: '', source: '', sort: 'updated_at', dir: -1, page: 0, ...JSON.parse(sessionStorage.getItem('sp:filter') || '{}') }; }
  catch { return { q: '', statuses: [], counsellor: '', nationality: '', source: '', sort: 'updated_at', dir: -1, page: 0 }; }
}
function saveFilter() { try { sessionStorage.setItem('sp:filter', JSON.stringify(filter)); } catch {} }
export function setListFilter(f) { filter = { q: '', statuses: [], counsellor: '', nationality: '', source: '', sort: 'updated_at', dir: -1, page: 0, ...f }; saveFilter(); }

let cache = null;   // students loaded for the list

export async function renderStudents(el) {
  const head = h('div.page-head',
    h('div', h('h1', t('Students')), h('p.muted.count', '')),
    can('students.create') ? h('button.btn.primary', { onclick: () => newStudent() }, icon('plus'), t('New student')) : null);
  const search = h('input.search', { type: 'search', placeholder: t('Search name, phone, email, Civil ID, passport or AKI number…'), value: filter.q });
  const chips = h('div.chips');
  const selCounsellor = h('select', h('option', { value: '' }, t('All counsellors')), h('option', { value: 'none' }, t('Unassigned')),
    staff().map((p) => h('option', { value: p.id }, p.full_name || p.email)));
  const selNat = h('select');
  const selSource = h('select');
  const tableWrap = h('div.card.table-card', h('div.loading-card', h('div.spinner')));
  const pager = h('div.pager');
  el.append(head,
    h('div.toolbar', h('div.search-box', icon('search'), search), selCounsellor, selNat, selSource,
      h('button.icon-btn', { title: t('Reload'), onclick: () => load(true) }, icon('refresh'))),
    chips, tableWrap, pager);

  selCounsellor.value = filter.counsellor;
  let timer;
  search.oninput = () => { clearTimeout(timer); timer = setTimeout(() => { filter.q = search.value; filter.page = 0; saveFilter(); draw(); }, 150); };
  selCounsellor.onchange = () => { filter.counsellor = selCounsellor.value; filter.page = 0; saveFilter(); draw(); };
  selNat.onchange = () => { filter.nationality = selNat.value; filter.page = 0; saveFilter(); draw(); };
  selSource.onchange = () => { filter.source = selSource.value; filter.page = 0; saveFilter(); draw(); };

  async function load(force) {
    try {
      if (!cache || force) cache = await api.select('students', `select=${LIST_COLS}`);
      const nats = [...new Set(cache.map((s) => s.nationality).filter(Boolean))].sort();
      const srcs = [...new Set(cache.map((s) => s.lead_source).filter(Boolean))].sort();
      clear(selNat).append(h('option', { value: '' }, t('All nationalities')), nats.map((n) => h('option', { value: n }, n)));
      clear(selSource).append(h('option', { value: '' }, t('All sources')), srcs.map((n) => h('option', { value: n }, n)));
      selNat.value = filter.nationality; selSource.value = filter.source;
      draw();
    } catch (e) { fail(e); clear(tableWrap).append(h('p.muted.pad', e.message)); }
  }

  function draw() {
    if (!cache) return;
    const q = filter.q.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    let rows = cache.filter((s) => {
      if (filter.counsellor === 'none' ? s.counsellor_id : filter.counsellor && s.counsellor_id !== filter.counsellor) return false;
      if (filter.nationality && s.nationality !== filter.nationality) return false;
      if (filter.source && s.lead_source !== filter.source) return false;
      if (!q) return true;
      const hay = [s.full_name, s.email, s.civil_id, s.passport_no, studentRef(s.ref), s.preferred_courses].join(' ').toLowerCase();
      if (hay.includes(q)) return true;
      return qDigits.length >= 4 && (s.phone || '').replace(/\D/g, '').includes(qDigits);
    });
    // status chips show counts for the rows matching the other filters
    const counts = {}; rows.forEach((s) => { counts[s.status_id] = (counts[s.status_id] || 0) + 1; });
    clear(chips).append(h('button.chip' + (filter.statuses.length ? '' : '.on'), { onclick: () => { filter.statuses = []; filter.page = 0; saveFilter(); draw(); } }, t('All'), h('b', rows.length)));
    for (const st of activeStatuses()) {
      if (!counts[st.id] && !filter.statuses.includes(st.id)) continue;
      const on = filter.statuses.includes(st.id);
      chips.append(h('button.chip' + (on ? '.on' : ''), { style: on ? { background: st.color, borderColor: st.color, color: '#fff' } : {}, onclick: () => {
        filter.statuses = on ? filter.statuses.filter((x) => x !== st.id) : [...filter.statuses, st.id]; filter.page = 0; saveFilter(); draw();
      } }, h('i.dot', { style: { background: on ? '#fff' : st.color } }), st.name, h('b', counts[st.id] || 0)));
    }
    if (filter.statuses.length) rows = rows.filter((s) => filter.statuses.includes(s.status_id));

    const key = filter.sort, dir = filter.dir;
    const val = (s) => key === 'status_id' ? (statusById(s.status_id)?.sort ?? 999) : key === 'counsellor_id' ? personName(s.counsellor_id).toLowerCase() : (s[key] ?? '');
    rows.sort((a, b) => { const x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * dir; });

    head.querySelector('.count').textContent = rows.length === cache.length ? t('{n} students', { n: cache.length }) : t('{n} of {m} students', { n: rows.length, m: cache.length });
    const pages = Math.max(1, Math.ceil(rows.length / PAGE));
    filter.page = Math.min(filter.page, pages - 1);
    const shown = rows.slice(filter.page * PAGE, filter.page * PAGE + PAGE);

    const th = (k, label) => h('th', { class: 'sortable' + (key === k ? ' sorted' : ''), onclick: () => { filter.dir = key === k ? -dir : 1; filter.sort = k; saveFilter(); draw(); } },
      t(label), key === k ? icon(dir > 0 ? 'up' : 'down', 13) : null);
    const table = h('table.grid',
      h('thead', h('tr', th('full_name', 'Student'), th('nationality', 'Nationality'), th('status_id', 'Status'),
        th('preferred_courses', 'Programme'), h('th', t('Countries')), th('phone', 'Contact'), th('counsellor_id', 'Counsellor'), th('updated_at', 'Updated'))),
      h('tbody', shown.map((s) => {
        const st = statusById(s.status_id);
        return h('tr', { onclick: () => { location.hash = `#/students/${s.id}`; } },
          h('td', h('div.who', h('span.avatar.sm', initials(s.full_name)), h('div', h('b', s.full_name), h('small.muted', studentRef(s.ref))))),
          h('td', s.nationality || ''),
          h('td', st ? pill(st.name, st.color) : ''),
          h('td.clip', [s.preferred_level, s.preferred_courses].filter(Boolean).join(' · ')),
          h('td.clip', (s.preferred_countries || []).join(', ')),
          h('td.contact', h('div', s.phone || ''), h('small.muted', s.email || '')),
          h('td.nowrap', personName(s.counsellor_id)),
          h('td.nowrap.muted', ago(s.updated_at)));
      })));
    clear(tableWrap).append(rows.length ? table : h('div.empty', icon('student', 34), h('p', cache.length ? t('No students match these filters.') : t('No students yet. Click "New student" to register the first one.'))));
    clear(pager);
    if (pages > 1) {
      pager.append(h('button.btn.sm', { disabled: filter.page === 0, onclick: () => { filter.page--; saveFilter(); draw(); } }, icon('back', 14)),
        h('span', t('Page {p} of {n}', { p: filter.page + 1, n: pages })),
        h('button.btn.sm', { disabled: filter.page >= pages - 1, onclick: () => { filter.page++; saveFilter(); draw(); } }, icon('chevron', 14)));
    }
  }
  const onRefresh = () => { if (document.body.contains(tableWrap)) load(true); else window.removeEventListener('sp:refresh', onRefresh); };
  window.addEventListener('sp:refresh', onRefresh);
  load(false);
  if (cache) load(true);   // show the cached list immediately, then refresh it
}

// =====================================================================
//  Form helpers
// =====================================================================
function fieldInput(f, value) {
  let el;
  const v = value ?? '';
  switch (f.type) {
    case 'textarea': el = h('textarea', { rows: 4, value: v }); break;
    case 'select': el = h('select', h('option', { value: '' }, '—'), f.options.map((o) => h('option', { value: o }, o))); el.value = v; if (v && el.value !== v) el.append(h('option', { value: v, selected: true }, v)); break;
    case 'combo': {
      const id = 'dl-' + f.key;
      el = h('input', { value: v, list: id, autocomplete: 'off' });
      el.setAttribute('list', id);
      return h('span.combo', el, h('datalist', { id }, f.options.map((o) => h('option', { value: o }))));
    }
    case 'status': el = h('select', h('option', { value: '' }, '—'), activeStatuses().map((s) => h('option', { value: s.id }, s.name)));
      if (v && !activeStatuses().some((s) => s.id === v) && statusById(v)) el.append(h('option', { value: v }, statusById(v).name));
      el.value = v; break;
    case 'counsellor': el = h('select', h('option', { value: '' }, t('Unassigned')), staff().map((p) => h('option', { value: p.id }, p.full_name || p.email)));
      if (v && !staff().some((p) => p.id === v)) el.append(h('option', { value: v }, personName(v) || t('Former employee')));
      el.value = v; break;
    case 'multi': {
      const set = new Set(value || []);
      const box = h('div.multi');
      for (const o of [...f.options, ...[...set].filter((x) => !f.options.includes(x))]) {
        const cb = h('input', { type: 'checkbox', value: o, checked: set.has(o) });
        box.append(h('label.check-chip', cb, h('span', o)));
      }
      box.dataset.multi = '1';
      return box;
    }
    case 'number': el = h('input', { type: 'number', value: v, min: 1950, max: 2100 }); break;
    default: el = h('input', { type: f.type || 'text', value: v, placeholder: f.placeholder ? t(f.placeholder) : '' });
  }
  return el;
}
function readInput(f, wrap) {
  if (f.type === 'multi') return [...wrap.querySelectorAll('input:checked')].map((c) => c.value);
  const el = wrap.matches('input,select,textarea') ? wrap : wrap.querySelector('input,select,textarea');
  let v = el.value.trim();
  if (v === '') return null;
  if (f.type === 'number') return parseInt(v, 10) || null;
  if (f.key === 'civil_id' || f.key === 'passport_no') v = v.toUpperCase().replace(/\s+/g, '');
  return v;
}
function buildForm(groups, values) {
  const inputs = {};
  const form = h('div.form');
  for (const g of groups) {
    const grid = h('div.form-grid');
    for (const f of g.fields) {
      const inp = fieldInput(f, values[f.key]);
      inputs[f.key] = inp;
      grid.append(h('label' + (f.wide ? '.wide' : ''), h('span', t(f.label), f.required ? h('em.req', ' *') : null), inp));
    }
    form.append(h('fieldset', h('legend', t(g.title)), grid));
  }
  const read = () => {
    const out = {};
    for (const [k, inp] of Object.entries(inputs)) out[k] = readInput(FIELD[k], inp);
    return out;
  };
  return { form, read, inputs };
}
function mandatoryNote() {
  return h('div.notice.info.slim', icon('alert', 15), h('span', h('b', t('Mandatory:')), ' ', t('Name, Number, DOB')));
}
function validate(v) {
  const missing = [!v.full_name && t('Name'), !v.phone && t('Number'), !v.dob && t('DOB')].filter(Boolean);
  if (missing.length) throw new Error(t('Mandatory: {f}', { f: missing.join(', ') }));
  if (v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) throw new Error(t('The email address does not look right.'));
}

// Possible duplicates before registering
async function findDuplicates(v) {
  const ors = [];
  const esc = (s) => encodeURIComponent(String(s).replace(/[,()]/g, ' '));
  if (v.civil_id) ors.push(`civil_id.eq.${esc(v.civil_id)}`);
  if (v.passport_no) ors.push(`passport_no.eq.${esc(v.passport_no)}`);
  if (v.email) ors.push(`email.ilike.${esc(v.email)}`);
  if (v.phone && v.phone.replace(/\D/g, '').length >= 7) ors.push(`phone.ilike.*${esc(v.phone.replace(/\D/g, '').slice(-8))}*`);
  if (v.full_name) ors.push(`full_name.ilike.${esc(v.full_name)}`);
  if (!ors.length) return [];
  return api.select('students', `select=id,ref,full_name,phone,civil_id,passport_no,status_id&or=(${ors.join(',')})&limit=5`).catch(() => []);
}

// =====================================================================
//  New student
// =====================================================================
export function newStudent() {
  const defaults = {
    status_id: activeStatuses().find((s) => /new enquiry/i.test(s.name))?.id || activeStatuses()[0]?.id,
    counsellor_id: state.me.role_id === 'counsellor' ? state.me.id : null,
  };
  const quick = GROUPS.map((g) => ({ ...g, fields: g.fields.filter((f) => !['guardian_email', 'whatsapp', 'address'].includes(f.key)) }));
  const { form, read } = buildForm(quick, defaults);
  let confirmedDupes = false;
  const dupBox = h('div');
  modal({ title: t('Register a new student'), wide: true, body: h('div', mandatoryNote(), dupBox, form), actions: [
    { label: t('Cancel') },
    { label: t('Register student'), kind: 'primary', run: async () => {
      const v = read(); validate(v);
      if (!confirmedDupes) {
        const d = await findDuplicates(v);
        if (d.length) {
          confirmedDupes = true;
          clear(dupBox).append(h('div.notice.amber', icon('alert'), h('div', h('b', t('This student might already be registered:')),
            h('ul', d.map((s) => h('li', h('a', { href: `#/students/${s.id}`, onclick: () => document.querySelector('.modal-back')?.remove() }, `${s.full_name} (${studentRef(s.ref)})`),
              ' ', h('small.muted', [s.phone, s.civil_id && 'Civil ID ' + s.civil_id, s.passport_no && 'Passport ' + s.passport_no].filter(Boolean).join(' · '))))),
            h('small', t('Click "Register student" again if this is a different person.')))));
          dupBox.scrollIntoView({ behavior: 'smooth' });
          return false;
        }
      }
      const row = await api.insert('students', v);
      cache = null;
      toast(t('{name} registered', { name: row.full_name }));
      location.hash = `#/students/${row.id}`;
    } },
  ] });
}

// =====================================================================
//  Profile
// =====================================================================
const TABS = [
  ['overview', 'Overview', 'student'],
  ['applications', 'Applications', 'uni', true],
  ['documents', 'Documents', 'doc', true],
  ['visa', 'Visa', 'visa', true],
  ['followups', 'Follow-ups', 'tasks'],
  ['contacts', 'Communication', 'chat'],
  ['history', 'History', 'history'],
];

export async function renderStudent(el, id, tab = 'overview') {
  const box = h('div', h('div.card.loading-card', h('div.spinner')));
  el.append(box);
  let s;
  try { s = await api.one('students', `select=*&id=eq.${encodeURIComponent(id)}`); }
  catch (e) { clear(box).append(h('a.back', { href: '#/students' }, icon('back', 16), t('Students')), h('div.card', h('p.pad', e.message))); return; }
  draw();

  function draw() {
    const st = statusById(s.status_id);
    const canEdit = can('students.edit');
    const statusSel = canEdit ? h('select.status-select', { style: { borderColor: st?.color, color: st?.color } },
      h('option', { value: '' }, t('No status')), activeStatuses().map((x) => h('option', { value: x.id }, x.name)),
      st && st.archived ? h('option', { value: st.id }, st.name) : null) : null;
    if (statusSel) {
      statusSel.value = s.status_id || '';
      statusSel.onchange = async () => {
        try { s = await api.update('students', s.id, { status_id: statusSel.value || null }, s.updated_at); cache = null; toast(t('Status changed to {s}', { s: statusById(s.status_id)?.name || t('No status') })); draw(); }
        catch (e) { fail(e); statusSel.value = s.status_id || ''; }
      };
    }
    const alerts = [];
    const missing = [!s.phone && t('Number'), !s.dob && t('DOB')].filter(Boolean);
    if (missing.length) alerts.unshift(h('span.tag.red', icon('alert', 13), t('Missing: {f}', { f: missing.join(', ') })));
    const quick = (ic, val, title) => val ? h('button.quick', { title: t('Copy {x}', { x: t(title) }), onclick: () => copyText(val) }, icon(ic, 15), h('span', val)) : null;

    const tabBar = h('div.tabs');
    for (const [k, label, ic, soon] of TABS) {
      tabBar.append(h('a.tab' + (k === tab ? '.on' : ''), { href: `#/students/${s.id}/${k}` }, icon(ic, 16), t(label), soon ? h('em.soon', t('soon')) : null));
    }
    const content = h('div.tab-body');
    clear(box).append(
      h('a.back', { href: '#/students' }, icon('back', 16), t('Students')),
      h('div.profile-head.card',
        h('span.avatar.lg', initials(s.full_name)),
        h('div.ph-main',
          h('div.ph-title', h('h1', s.full_name), h('span.ref', studentRef(s.ref))),
          h('div.ph-meta', [s.nationality, s.preferred_level, s.preferred_courses, (s.preferred_countries || []).join(', ')].filter(Boolean).join(' · ') || h('span.muted', t('No details yet'))),
          h('div.ph-quick', quick('phone', s.phone, 'phone'), quick('mail', s.email, 'email'), quick('chat', s.whatsapp, 'WhatsApp'), ...alerts)),
        h('div.ph-side',
          h('div.ph-actions', contactButtons(s), h('button.btn.sm', { onclick: () => followUpForm(s, null, () => { if (tab === 'followups') draw(); }) }, icon('clock', 14), t('Follow-up'))),
          statusSel || (st ? pill(st.name, st.color) : null),
          h('small.muted', t('Counsellor')), h('b', personName(s.counsellor_id) || t('Unassigned')))),
      tabBar, content);

    if (tab === 'contacts') return contactsTab(content, s);
    if (tab === 'followups') return followUpsTab(content, s);
    if (tab === 'history') return historyTab(content, s);
    if (['applications', 'documents', 'visa'].includes(tab)) {
      const text = { applications: 'Each university application with its own status, offer details and deadlines.', documents: 'Passport, transcripts, certificates, test results, offers and visa documents, stored securely on AKI\'s Google Drive.', visa: 'Previous refusals check, visa checklist, appointments and decision, plus the bank statement calculator.' }[tab];
      return content.append(h('div.card.empty-big', icon(TABS.find((x) => x[0] === tab)[2], 36), h('h2', t('Coming in the next update')), h('p.muted', t(text))));
    }
    overviewTab(content);
  }

  function overviewTab(content) {
    const canEdit = can('students.edit');
    const view = h('div.overview');
    for (const g of GROUPS) {
      const dl = h('dl.facts');
      for (const f of g.fields) {
        if (f.type === 'status' || f.type === 'counsellor') continue;
        let v = s[f.key];
        let shown;
        if (f.type === 'date') {
          shown = v ? fmtDate(v) : null;
        } else if (f.type === 'multi') shown = v && v.length ? v.join(', ') : null;
        else shown = v ?? null;
        if (f.key === 'dob' && v) { const age = Math.floor((Date.now() - new Date(v)) / 31557600000); shown = `${fmtDate(v)} (${t('{n} years', { n: age })})`; }
        dl.append(h('div' + (f.wide ? '.wide' : ''), h('dt', t(f.label)), h('dd', shown ?? h('span.muted', '—'))));
      }
      view.append(h('section.card', h('div.card-head', h('h2', t(g.title))), dl));
    }
    view.append(h('section.card.meta-card', h('dl.facts',
      h('div', h('dt', t('Registered')), h('dd', `${fmtDateTime(s.created_at)} · ${personName(s.created_by) || '—'}`)),
      h('div', h('dt', t('Last changed')), h('dd', `${fmtDateTime(s.updated_at)} · ${personName(s.updated_by) || '—'}`)))));
    const removal = h('span');
    const bar = h('div.section-bar',
      canEdit ? h('button.btn.primary', { onclick: () => editMode(content) }, icon('edit', 16), t('Edit profile')) : null,
      can('students.delete') ? h('button.btn.ghost-danger', { onclick: del }, icon('trash', 16), t('Remove student')) : removal);
    content.append(bar, view);
    if (!can('students.delete')) {
      removalState(s.id).then((r) => {
        if (!r) return removal.append(h('button.btn.ghost-danger', { onclick: () => requestRemoval(s, draw) }, icon('trash', 16), t('Request removal')));
        if (r.status === 'code_issued') return removal.append(h('button.btn.ghost-danger', { onclick: () => enterCode(r, () => { cache = null; location.hash = '#/students'; }) }, icon('key', 16), t('Enter Admin code to remove')));
        removal.append(h('span.tag.amber', icon('clock', 13), t('Removal requested · waiting for Admin')));
      });
    }
  }

  function editMode(content) {
    const { form, read } = buildForm(GROUPS, s);
    const save = h('button.btn.primary', icon('check', 16), t('Save changes'));
    save.onclick = async () => {
      save.disabled = true;
      try {
        const v = read(); validate(v);
        const patch = {};
        for (const k in v) if (JSON.stringify(v[k] ?? null) !== JSON.stringify(s[k] ?? null)) patch[k] = v[k];
        if (Object.keys(patch).length) { s = await api.update('students', s.id, patch, s.updated_at); cache = null; toast(t('Saved')); }
        draw();
      } catch (e) { fail(e); save.disabled = false; }
    };
    clear(content).append(mandatoryNote(), h('div.section-bar.sticky', h('b', t('Editing {name}', { name: s.full_name })), h('span.grow'),
      h('button.btn', { onclick: draw }, t('Cancel')), save), h('div.card.pad-lg', form));
  }

  async function del() {
    if (!(await confirmBox(t('Remove student'), t('Remove {name} and their records permanently? The deletion is recorded in the activity log. Consider setting the status to "Not Proceeding" instead.', { name: s.full_name }), t('Delete permanently'), true))) return;
    try { await api.remove('students', s.id); cache = null; toast(t('Student deleted')); location.hash = '#/students'; } catch (e) { fail(e); }
  }
}

// ---------------- communication log ----------------
async function contactsTab(el, s) {
  const kind = h('select', OPTIONS.contact_kind.map((k) => h('option', { value: k }, t(CONTACT_KIND_LABEL[k]))));
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const when = h('input', { type: 'datetime-local', value: now.toISOString().slice(0, 16) });
  const summary = h('textarea', { rows: 3, placeholder: t('What was discussed? Next step?') });
  const list = h('div.timeline', h('div.spinner'));
  const add = h('button.btn.primary', icon('plus', 16), t('Add to log'));
  add.onclick = async () => {
    if (!summary.value.trim()) return summary.focus();
    add.disabled = true;
    try {
      await api.insert('contacts', { student_id: s.id, kind: kind.value, happened_at: new Date(when.value).toISOString(), summary: summary.value.trim() });
      summary.value = ''; toast(t('Added to the communication log')); load();
    } catch (e) { fail(e); } finally { add.disabled = false; }
  };
  el.append(h('div.card.pad-lg.log-form', h('div.log-row', h('label', t('Type'), kind), h('label', t('When'), when)), h('label', t('Summary'), summary), h('div.right', add)), list);
  async function load() {
    try {
      const rows = await api.select('contacts', `select=*&student_id=eq.${s.id}&order=happened_at.desc`);
      clear(list);
      if (!rows.length) return list.append(h('div.card', h('p.muted.pad', t('No calls, messages or visits logged yet.'))));
      for (const c of rows) {
        const mine = c.created_by === state.me.id || can('students.delete');
        list.append(h('div.tl-item',
          h('span.tl-ic', icon(CONTACT_KIND_ICON[c.kind] || 'doc', 16)),
          h('div.card.tl-card',
            h('div.tl-head', h('b', t(CONTACT_KIND_LABEL[c.kind] || c.kind)), h('small.muted', `${fmtDateTime(c.happened_at)} · ${personName(c.created_by)}`),
              mine ? h('span.tl-act', h('button.icon-btn.sm', { title: t('Edit'), onclick: () => editContact(c) }, icon('edit', 14)),
                h('button.icon-btn.sm', { title: t('Delete'), onclick: () => delContact(c) }, icon('trash', 14))) : null),
            h('p.tl-text', c.summary))));
      }
    } catch (e) { fail(e); }
  }
  function editContact(c) {
    const ta = h('textarea', { rows: 5, value: c.summary });
    modal({ title: t('Edit log entry'), body: ta, actions: [{ label: t('Cancel') }, { label: t('Save'), kind: 'primary', run: async () => { await api.update('contacts', c.id, { summary: ta.value.trim() }); load(); } }] });
  }
  async function delContact(c) {
    if (await confirmBox(t('Delete log entry'), t('Delete this entry from the communication log?'), t('Delete'), true)) { try { await api.remove('contacts', c.id); load(); } catch (e) { fail(e); } }
  }
  load();
}

// ---------------- change history ----------------
function fmtValue(key, v) {
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return '—';
  if (key === 'status_id') return statusById(v)?.name || t('(deleted status)');
  if (key === 'counsellor_id') return personName(v) || t('(former employee)');
  if (key === 'kind') return t(CONTACT_KIND_LABEL[v] || v);
  if (Array.isArray(v)) return v.join(', ');
  if (FIELD[key]?.type === 'date' || /_at$/.test(key)) return fmtDate(v);
  return String(v);
}
const label = (key) => (FIELD[key] ? t(FIELD[key].label) : key === 'kind' ? t('Type') : key === 'summary' ? t('Summary') : key === 'happened_at' ? t('When') : key);

export function describeChange(a, short) {
  const what = a.table_name === 'contacts' ? t('a communication log entry for') : '';
  if (a.action === 'created') return a.table_name === 'contacts' ? t('logged a contact with') : t('registered');
  if (a.action === 'deleted') return a.table_name === 'contacts' ? t('deleted a log entry for') : t('deleted');
  const keys = Object.keys(a.changes || {});
  if (keys.length === 1 && keys[0] === 'status_id') return t('changed the status to {s} for', { s: fmtValue('status_id', a.changes.status_id[1]) });
  if (short) return a.table_name === 'contacts' ? t('edited {w}', { w: what }) : t('updated {f} for', { f: keys.slice(0, 3).map(label).join(', ') + (keys.length > 3 ? '…' : '') });
  return t('updated');
}

async function historyTab(el, s) {
  const list = h('div.card', h('div.spinner'));
  el.append(list);
  try {
    const rows = await api.select('audit_log', `select=*&student_id=eq.${s.id}&order=at.desc`);
    clear(list);
    if (!rows.length) return list.append(h('p.muted.pad', t('No history recorded.')));
    list.append(h('ul.history', rows.map((a) => {
      const changes = Object.entries(a.changes || {}).filter(([k]) => k !== 'student_id');
      let title;
      if (a.table_name === 'contacts') title = a.action === 'created' ? t('Logged a contact') : a.action === 'deleted' ? t('Deleted a log entry') : t('Edited a log entry');
      else title = a.action === 'created' ? t('Registered the student') : a.action === 'deleted' ? t('Deleted the student') : t('Updated the profile');
      return h('li',
        h('div.h-head', h('span.avatar.sm', initials(a.actor_name || '?')), h('div', h('b', a.actor_name || t('System')), ' ', h('span', title.toLowerCase())), h('small.muted', fmtDateTime(a.at))),
        changes.length && a.action !== 'deleted' ? h('table.changes', changes.map(([k, [o, n]]) => h('tr',
          h('td.ck', label(k)),
          a.action === 'created' ? h('td', { colSpan: 2 }, fmtValue(k, n)) : [h('td.old', fmtValue(k, o)), h('td.new', fmtValue(k, n))]))) : null);
    })));
  } catch (e) { fail(e); clear(list).append(h('p.pad', e.message)); }
}
