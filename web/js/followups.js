// Follow-up reminders: set on a student's profile, shown on each employee's Today list,
// with one-click WhatsApp and email.
import * as api from './api.js';
import { t } from './i18n.js';
import { h, clear, icon, toast, fail, modal, confirmBox, fmtDate, daysUntil, studentRef } from './ui.js';
import { state, can, personName, staff } from './store.js';

const EMBED = 'select=*,student:students(id,ref,full_name,phone,whatsapp,email)';

// ---------------- WhatsApp & email ----------------
export async function openExternal(url) {
  const invoke = window.__TAURI__?.core?.invoke;
  try { if (invoke) await invoke('open_external', { url }); else window.open(url, '_blank'); }
  catch (e) { fail(e); }
}
export function waNumber(s) {
  let d = String(s?.whatsapp || s?.phone || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 8) d = '965' + d;        // local Kuwait number
  return d.length >= 8 ? d : '';
}
export function openWhatsApp(s) {
  const n = waNumber(s);
  if (!n) return toast(t('This student has no phone number.'), 'err');
  openExternal(`whatsapp://send?phone=${n}`);
}
export function openEmail(s) {
  if (!s?.email) return toast(t('This student has no email address.'), 'err');
  const first = (s.full_name || '').trim().split(/\s+/)[0] || '';
  const body = `Dear ${first},\n\n\n\nKind regards,\n${state.me.full_name || ''}\nAKI Consultant`;
  openExternal(`mailto:${encodeURIComponent(s.email)}?subject=${encodeURIComponent(`AKI Consultant: ${s.full_name}`)}&body=${encodeURIComponent(body)}`);
}
export function contactButtons(s) {
  return h('span.contact-btns',
    h('button.icon-btn.sm.wa', { title: t('WhatsApp {n}', { n: s?.full_name || '' }), disabled: !waNumber(s), onclick: (e) => { e.stopPropagation(); openWhatsApp(s); } }, icon('chat', 16)),
    h('button.icon-btn.sm.em', { title: t('Email {n}', { n: s?.full_name || '' }), disabled: !s?.email, onclick: (e) => { e.stopPropagation(); openEmail(s); } }, icon('mail', 16)));
}

// ---------------- add / edit ----------------
const isoDate = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
export function followUpForm(student, existing, onSaved) {
  const tomorrow = new Date(Date.now() + 86400000);
  const date = h('input', { type: 'date', value: existing?.due_date || isoDate(tomorrow), min: existing ? null : isoDate(new Date()) });
  const note = h('textarea', { rows: 3, value: existing?.note || '', placeholder: t('e.g. Ask if the IELTS result is out') });
  const who = h('select', staff().map((p) => h('option', { value: p.id }, p.id === state.me.id ? t('Me ({n})', { n: p.full_name || p.email }) : (p.full_name || p.email))));
  who.value = existing?.assigned_to || state.me.id;
  const quick = h('div.quick-dates', [['Tomorrow', 1], ['In 3 days', 3], ['Next week', 7], ['In 2 weeks', 14]].map(([l, n]) =>
    h('button.chip', { type: 'button', onclick: () => { date.value = isoDate(Date.now() + n * 86400000); } }, t(l))));
  modal({ title: existing ? t('Edit follow-up') : t('Follow-up reminder for {n}', { n: student.full_name }),
    body: h('div.form-col', h('label', t('Follow up on'), date), quick, h('label', t('Reminder'), note),
      can('tasks.assign') || existing ? h('label', t('For'), who) : null),
    actions: [{ label: t('Cancel') }, { label: t('Save reminder'), kind: 'primary', run: async () => {
      if (!date.value) throw new Error(t('Choose a date.'));
      if (!note.value.trim()) throw new Error(t('Write what the follow-up is about.'));
      const row = { due_date: date.value, note: note.value.trim(), assigned_to: who.value || state.me.id };
      if (existing) await api.update('follow_ups', existing.id, row);
      else await api.insert('follow_ups', { ...row, student_id: student.id });
      toast(t('Reminder set for {d}', { d: fmtDate(date.value) }));
      onSaved?.();
    } }] });
}
async function setDone(f, done) {
  await api.update('follow_ups', f.id, { done, done_at: done ? new Date().toISOString() : null, done_by: done ? state.me.id : null });
}

// ---------------- one row ----------------
function dueTag(f) {
  if (f.done) return h('span.tag.green', icon('check', 12), t('Done'));
  const d = daysUntil(f.due_date);
  if (d < 0) return h('span.tag.red', d === -1 ? t('1 day overdue') : t('{n} days overdue', { n: -d }));
  if (d === 0) return h('span.tag.amber', t('Today'));
  if (d === 1) return h('span.tag', t('Tomorrow'));
  return h('span.tag', fmtDate(f.due_date));
}
export function followUpRow(f, { showStudent = true, onChange } = {}) {
  const s = f.student;
  const cb = h('input', { type: 'checkbox', checked: f.done, title: f.done ? t('Mark as not done') : t('Mark as done') });
  cb.onchange = async () => { try { await setDone(f, cb.checked); toast(cb.checked ? t('Marked as done') : t('Reopened')); onChange?.(); } catch (e) { cb.checked = !cb.checked; fail(e); } };
  const mine = f.created_by === state.me.id || can('students.delete');
  return h('div.fu-row' + (f.done ? '.done' : ''),
    cb,
    h('div.fu-main',
      showStudent && s ? h('a.fu-student', { href: `#/students/${s.id}` }, s.full_name, h('small.muted', ' ' + studentRef(s.ref))) : null,
      h('div.fu-note', f.note),
      h('small.muted', [f.assigned_to !== state.me.id ? t('for {n}', { n: personName(f.assigned_to) }) : null,
        f.created_by && f.created_by !== f.assigned_to ? t('set by {n}', { n: personName(f.created_by) }) : null,
        f.done && f.done_at ? t('done {d}', { d: fmtDate(f.done_at) }) : null].filter(Boolean).join(' · '))),
    dueTag(f),
    s ? contactButtons(s) : null,
    h('span.fu-act',
      h('button.icon-btn.sm', { title: t('Edit'), onclick: () => followUpForm(s || { id: f.student_id }, f, onChange) }, icon('edit', 14)),
      mine ? h('button.icon-btn.sm', { title: t('Delete'), onclick: async () => {
        if (await confirmBox(t('Delete reminder'), t('Delete this follow-up reminder?'), t('Delete'), true)) { try { await api.remove('follow_ups', f.id); onChange?.(); } catch (e) { fail(e); } }
      } }, icon('trash', 14)) : null));
}

// ---------------- Home: today's follow-ups ----------------
export async function todayCard() {
  const body = h('div.fu-list', h('div.spinner'));
  const today = isoDate(new Date());
  const card = h('section.card.today-card', h('div.card-head', h('h2', t("Today's follow-ups")), h('a.link', { href: '#/tasks' }, t('All tasks'))), body);
  const load = async () => {
    try {
      const rows = await api.select('follow_ups', `${EMBED}&assigned_to=eq.${state.me.id}&done=eq.false&due_date=lte.${today}&order=due_date.asc`);
      const next = await api.select('follow_ups', `select=id&assigned_to=eq.${state.me.id}&done=eq.false&due_date=gt.${today}`);
      clear(body);
      if (!rows.length) body.append(h('p.muted.pad', t('Nothing to follow up today.'), next.length ? ' ' + t('{n} coming up.', { n: next.length }) : ''));
      rows.forEach((f) => body.append(followUpRow(f, { onChange: load })));
      card.querySelector('h2').textContent = rows.length ? t("Today's follow-ups ({n})", { n: rows.length }) : t("Today's follow-ups");
    } catch (e) { clear(body).append(h('p.muted.pad', e.message)); }
  };
  load();
  return card;
}

// ---------------- Student profile tab ----------------
export async function followUpsTab(el, s) {
  const list = h('div.card.fu-list', h('div.spinner'));
  el.append(h('div.section-bar', h('p.muted.grow', t('Reminders appear on the Today list of the employee they are for, on the chosen date.')),
    h('button.btn.primary', { onclick: () => followUpForm(s, null, load) }, icon('plus', 16), t('Add follow-up'))), list);
  async function load() {
    try {
      const rows = await api.select('follow_ups', `select=*&student_id=eq.${s.id}&order=done.asc,due_date.asc`);
      rows.forEach((r) => (r.student = s));
      clear(list);
      if (!rows.length) return list.append(h('p.muted.pad', t('No follow-ups set for this student.')));
      rows.forEach((f) => list.append(followUpRow(f, { showStudent: false, onChange: load })));
    } catch (e) { fail(e); }
  }
  load();
}

// ---------------- Tasks page ----------------
export async function renderTasks(el) {
  const who = h('select', h('option', { value: state.me.id }, t('My follow-ups')),
    can('tasks.assign') ? [h('option', { value: '' }, t('Everyone')), staff().filter((p) => p.id !== state.me.id).map((p) => h('option', { value: p.id }, p.full_name || p.email))] : null);
  const showDone = h('input', { type: 'checkbox' });
  const body = h('div.tasks', h('div.spinner'));
  el.append(h('div.page-head', h('div', h('h1', t('Tasks')), h('p.muted', t('Follow-up reminders. Add one from any student\'s profile.')))),
    h('div.toolbar', who, h('label.switch', showDone, h('span', t('Show done (last 30 days)')))), body);
  who.onchange = load; showDone.onchange = load;
  async function load() {
    const today = isoDate(new Date());
    let q = `${EMBED}&order=due_date.asc`;
    if (who.value) q += `&assigned_to=eq.${who.value}`;
    q += showDone.checked ? `&or=(done.eq.false,done_at.gte.${isoDate(Date.now() - 30 * 86400000)})` : '&done=eq.false';
    try {
      const rows = await api.select('follow_ups', q);
      const groups = [
        [t('Overdue'), rows.filter((f) => !f.done && f.due_date < today)],
        [t('Today'), rows.filter((f) => !f.done && f.due_date === today)],
        [t('Upcoming'), rows.filter((f) => !f.done && f.due_date > today)],
        [t('Done'), rows.filter((f) => f.done).reverse()],
      ];
      clear(body);
      if (!rows.length) return body.append(h('div.card.empty-big', icon('tasks', 36), h('h2', t('All clear')), h('p.muted', t('No follow-ups here. Open a student and click "Follow-up" to set a reminder.'))));
      for (const [title, list] of groups) {
        if (!list.length) continue;
        body.append(h('section.card', h('div.card-head', h('h2', `${title} · ${list.length}`)), h('div.fu-list', list.map((f) => followUpRow(f, { onChange: load })))));
      }
    } catch (e) { fail(e); clear(body).append(h('p.muted', e.message)); }
  }
  load();
}
