// Settings: my account, employees, roles & permissions, statuses, activity log, connection.
import * as api from './api.js';
import { t } from './i18n.js';
import { h, clear, icon, toast, fail, modal, confirmBox, fmtDateTime, ago, initials, pill } from './ui.js';
import { state, can, loadCore, loadMe, roleName, personName } from './store.js';
import { PERMISSIONS, PERM_LABEL } from './fields.js';
import { passwordForm, boot, VERSION } from './app.js';
import { describeChange } from './students.js';

const SECTIONS = [
  ['account', 'My account', 'key'],
  ['users', 'Employees', 'users', 'users.manage'],
  ['roles', 'Roles & permissions', 'shield', 'users.manage'],
  ['statuses', 'Student statuses', 'palette', 'settings.manage'],
  ['activity', 'Activity log', 'history', 'audit.view'],
  ['about', 'Connection & about', 'globe'],
];

export function renderSettings(el, section = 'account') {
  const allowed = SECTIONS.filter((s) => !s[3] || can(s[3]));
  if (!allowed.some((s) => s[0] === section)) section = 'account';
  const body = h('div.settings-body');
  el.append(h('div.page-head', h('h1', t('Settings'))),
    h('div.settings', h('nav.subnav', allowed.map(([id, label, ic]) => h('a' + (id === section ? '.on' : ''), { href: '#/settings/' + id }, icon(ic, 17), t(label)))), body));
  ({ account, users, roles, statuses, activity, about })[section](body);
}

// ---------------- my account ----------------
function account(el) {
  const me = state.me;
  el.append(h('section.card.pad-lg',
    h('div.who.big', h('span.avatar.lg', initials(me.full_name || me.email)), h('div', h('h2', me.full_name || me.email), h('p.muted', `${me.email} · ${roleName(me.role_id)}`))),
    h('h3', t('Your permissions')),
    h('div.perm-list', state.perms.includes('*') ? h('span.tag', t('Everything (Admin)')) : state.perms.map((p) => h('span.tag', t(PERM_LABEL[p] || p))))),
  h('section.card.pad-lg.narrow', h('h3', t('Change password')), passwordForm(() => {}, false)));
}

// ---------------- employees ----------------
function effective(p) {
  const r = state.roles.find((x) => x.id === p.role_id);
  if (r?.perms.includes('*')) return ['*'];
  return [...new Set([...(r?.perms || []), ...p.extra_perms])].filter((x) => !p.revoked_perms.includes(x));
}

function users(el) {
  const list = h('div.card.table-card');
  el.append(h('div.section-bar', h('p.muted.grow', t('Everyone who can sign in to Student Portal. Deactivated employees can no longer sign in, but their history is kept.')),
    h('button.btn.primary', { onclick: addUser }, icon('plus', 16), t('Add employee'))), list);
  draw();
  function draw() {
    const rows = [...state.profiles].sort((a, b) => (b.active - a.active) || (a.full_name || a.email).localeCompare(b.full_name || b.email));
    clear(list).append(h('table.grid', h('thead', h('tr', h('th', t('Employee')), h('th', t('Role')), h('th', t('Status')), h('th', t('Last active')), h('th'))),
      h('tbody', rows.map((p) => h('tr', { onclick: () => editUser(p) },
        h('td', h('div.who', h('span.avatar.sm', initials(p.full_name || p.email)), h('div', h('b', p.full_name || t('(no name)')), h('small.muted', p.email)))),
        h('td', roleName(p.role_id) || h('span.muted', t('No role'))),
        h('td', p.active ? h('span.tag.green', t('Active')) : p.role_id ? h('span.tag', t('Deactivated')) : h('span.tag.amber', t('Waiting for a role'))),
        h('td.muted', ago(p.last_seen)),
        h('td.right', icon('chevron', 16)))))));
  }
  function addUser() {
    const name = h('input'), email = h('input', { type: 'email' });
    const pass = h('input', { value: tempPassword() });
    const role = h('select', state.roles.map((r) => h('option', { value: r.id }, r.name))); role.value = 'counsellor';
    modal({ title: t('Add employee'), body: h('div.form-col',
      h('label', t('Full name'), name), h('label', t('Work email'), email),
      h('label', t('Temporary password'), pass, h('small.muted', t('Give this to the employee. They choose their own password when they first sign in.'))),
      h('label', t('Role'), role)),
    actions: [{ label: t('Cancel') }, { label: t('Create account'), kind: 'primary', run: async () => {
      if (!name.value.trim() || !email.value.trim()) throw new Error(t('Enter a name and email.'));
      if (pass.value.length < 8) throw new Error(t('The temporary password needs at least 8 characters.'));
      const u = await api.createLogin(email.value, pass.value, name.value.trim());
      // give the trigger a moment to create the profile, then activate it with the chosen role
      let ok = false;
      for (let i = 0; i < 5 && !ok; i++) {
        try { await api.update('profiles', u.id, { full_name: name.value.trim(), role_id: role.value, active: true, must_change_password: true }); ok = true; }
        catch { await new Promise((r) => setTimeout(r, 600)); }
      }
      await loadCore(); draw();
      if (!ok) throw new Error(t('The login was created but could not be activated. Open the employee and give them a role.'));
      toast(t('{n} can now sign in', { n: name.value.trim() }));
    } }] });
  }
  function editUser(p) {
    const name = h('input', { value: p.full_name });
    const role = h('select', h('option', { value: '' }, t('No role')), state.roles.map((r) => h('option', { value: r.id }, r.name))); role.value = p.role_id || '';
    const active = h('input', { type: 'checkbox', checked: p.active });
    const extra = new Set(p.extra_perms), revoked = new Set(p.revoked_perms);
    const permBox = h('div.perm-grid');
    const drawPerms = () => {
      clear(permBox);
      const r = state.roles.find((x) => x.id === role.value);
      if (r?.perms.includes('*')) return permBox.append(h('p.muted', t('Admins can do everything.')));
      for (const g of PERMISSIONS) {
        permBox.append(h('div.perm-group', h('b', t(g.group)), g.items.map(([k, lbl]) => {
          const fromRole = r?.perms.includes(k);
          const on = (fromRole && !revoked.has(k)) || extra.has(k);
          const cb = h('input', { type: 'checkbox', checked: on, onchange: () => {
            if (fromRole) cb.checked ? revoked.delete(k) : revoked.add(k);
            else cb.checked ? extra.add(k) : extra.delete(k);
            drawPerms();
          } });
          const changed = fromRole ? revoked.has(k) : extra.has(k);
          return h('label.perm' + (changed ? '.changed' : ''), cb, h('span', t(lbl)), changed ? h('small', fromRole ? t('removed') : t('added')) : null);
        })));
      }
    };
    role.onchange = () => { extra.clear(); revoked.clear(); drawPerms(); };
    drawPerms();
    const isMe = p.id === state.me.id;
    const body = h('div.form-col',
      h('p.muted', p.email, ' · ', t('last active {x}', { x: ago(p.last_seen) })),
      h('label', t('Full name'), name),
      h('div.two', h('label', t('Role'), role), h('label.switch', active, h('span', t('Active (can sign in)')))),
      h('h4', t('Permissions')), h('p.muted.small', t('Ticks come from the role. Change a tick to adjust this one employee.')), permBox,
      h('div.row-btns',
        h('button.btn', { onclick: () => resetPassword(p) }, icon('key', 16), t('Set a new password')),
        !isMe && !p.last_seen ? h('button.btn.ghost-danger', { onclick: () => deleteUser(p, m) }, icon('trash', 16), t('Delete account')) : null));
    const m = modal({ title: p.full_name || p.email, wide: true, body, actions: [{ label: t('Cancel') }, { label: t('Save'), kind: 'primary', run: async () => {
      const r = state.roles.find((x) => x.id === role.value);
      const patch = { full_name: name.value.trim(), role_id: role.value || null, active: active.checked,
        extra_perms: [...extra].filter((k) => !r?.perms.includes(k)), revoked_perms: [...revoked].filter((k) => r?.perms.includes(k)) };
      if (patch.active && !patch.role_id) throw new Error(t('Choose a role before activating the account.'));
      await api.update('profiles', p.id, patch);
      await loadCore(); if (isMe) await loadMe();
      toast(t('Saved')); draw();
      if (isMe) boot();
    } }] });
  }
  function resetPassword(p) {
    const pass = h('input', { value: tempPassword() });
    modal({ title: t('Set a new password'), body: h('div.form-col', h('label', t('New temporary password for {n}', { n: p.full_name || p.email }), pass),
      h('small.muted', t('They will be asked to choose their own password at their next sign-in.'))),
    actions: [{ label: t('Cancel') }, { label: t('Set password'), kind: 'primary', run: async () => { await api.rpc('admin_set_password', { target: p.id, new_password: pass.value }); toast(t('Password set')); } }] });
  }
  async function deleteUser(p, m) {
    if (!(await confirmBox(t('Delete account'), t('Delete the login for {n}? This is only possible for accounts that were never used.', { n: p.email }), t('Delete'), true))) return;
    try { await api.rpc('admin_delete_user', { target: p.id }); m.close(); await loadCore(); draw(); toast(t('Account deleted')); } catch (e) { fail(e); }
  }
}
function tempPassword() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const a = crypto.getRandomValues(new Uint32Array(10));
  return 'Aki-' + [...a].map((n) => c[n % c.length]).join('');
}

// ---------------- roles ----------------
function roles(el) {
  const wrap = h('div.roles');
  el.append(h('div.section-bar', h('p.muted.grow', t('A role is a starting set of permissions. You can still adjust individual employees on the Employees page.')),
    h('button.btn', { onclick: addRole }, icon('plus', 16), t('Add role'))), wrap);
  draw();
  function draw() {
    clear(wrap);
    for (const r of state.roles) {
      const isAdmin = r.perms.includes('*');
      const perms = new Set(r.perms);
      const count = state.profiles.filter((p) => p.role_id === r.id && p.active).length;
      const save = h('button.btn.primary.sm', { disabled: true }, t('Save'));
      const grid = h('div.perm-grid');
      if (isAdmin) grid.append(h('p.muted', t('The Admin role always has every permission.')));
      else for (const g of PERMISSIONS) grid.append(h('div.perm-group', h('b', t(g.group)), g.items.map(([k, lbl]) =>
        h('label.perm', h('input', { type: 'checkbox', checked: perms.has(k), onchange: (e) => { e.target.checked ? perms.add(k) : perms.delete(k); save.disabled = false; } }), h('span', t(lbl))))));
      save.onclick = async () => { try { await api.update('roles', r.id, { perms: [...perms] }); await loadCore(); toast(t('Role saved')); save.disabled = true; } catch (e) { fail(e); } };
      wrap.append(h('section.card.pad-lg', h('div.card-head', h('h2', r.name), h('small.muted', t('{n} active employees', { n: count })), h('span.grow'), isAdmin ? null : save), grid));
    }
  }
  function addRole() {
    const name = h('input');
    modal({ title: t('Add role'), body: h('label', t('Role name'), name), actions: [{ label: t('Cancel') }, { label: t('Add'), kind: 'primary', run: async () => {
      const n = name.value.trim(); if (!n) throw new Error(t('Enter a name.'));
      const id = n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'role-' + Date.now();
      await api.insert('roles', { id, name: n, perms: ['students.view'], sort: state.roles.length });
      await loadCore(); draw();
    } }] });
  }
}

// ---------------- statuses ----------------
function statuses(el) {
  const list = h('div.card');
  el.append(h('div.section-bar', h('p.muted.grow', t('The statuses a student can have, in pipeline order. Archived statuses stay on old records but can no longer be chosen.')),
    h('button.btn', { onclick: () => editStatus() }, icon('plus', 16), t('Add status'))), list);
  draw();
  function draw() {
    const all = state.statuses;
    clear(list).append(h('ul.status-list', all.map((s, i) => h('li' + (s.archived ? '.archived' : ''),
      h('span.order', h('button.icon-btn.sm', { disabled: i === 0, title: t('Move up'), onclick: () => move(i, -1) }, icon('up', 14)),
        h('button.icon-btn.sm', { disabled: i === all.length - 1, title: t('Move down'), onclick: () => move(i, 1) }, icon('down', 14))),
      pill(s.name, s.color),
      s.archived ? h('small.muted', t('archived')) : null,
      h('span.grow'),
      h('button.btn.sm', { onclick: () => editStatus(s) }, icon('edit', 14), t('Edit'))))));
  }
  async function move(i, d) {
    const arr = [...state.statuses]; const [x] = arr.splice(i, 1); arr.splice(i + d, 0, x);
    try { await Promise.all(arr.map((s, k) => s.sort !== k + 1 ? api.update('statuses', s.id, { sort: k + 1 }) : null)); await loadCore(); draw(); } catch (e) { fail(e); }
  }
  function editStatus(s) {
    const name = h('input', { value: s?.name || '' });
    const color = h('input', { type: 'color', value: s?.color || '#0ea5e9' });
    const archived = h('input', { type: 'checkbox', checked: !!s?.archived });
    modal({ title: s ? t('Edit status') : t('Add status'), body: h('div.form-col', h('label', t('Name'), name), h('label', t('Colour'), color),
      s ? h('label.switch', archived, h('span', t('Archived (hide from choices)'))) : null),
    actions: [{ label: t('Cancel') }, { label: t('Save'), kind: 'primary', run: async () => {
      const n = name.value.trim(); if (!n) throw new Error(t('Enter a name.'));
      if (s) await api.update('statuses', s.id, { name: n, color: color.value, archived: archived.checked });
      else await api.insert('statuses', { name: n, color: color.value, sort: state.statuses.length + 1 });
      await loadCore(); draw();
    } }] });
  }
}

// ---------------- activity log ----------------
function activity(el) {
  const who = h('select', h('option', { value: '' }, t('Everyone')), state.profiles.map((p) => h('option', { value: p.id }, p.full_name || p.email)));
  const what = h('select', h('option', { value: '' }, t('Everything')), h('option', { value: 'students' }, t('Students')), h('option', { value: 'contacts' }, t('Communication log')),
    h('option', { value: 'profiles' }, t('Employees')), h('option', { value: 'roles' }, t('Roles')), h('option', { value: 'statuses' }, t('Statuses')));
  const from = h('input', { type: 'date' }), to = h('input', { type: 'date' });
  const list = h('div.card');
  const more = h('button.btn', t('Load more'));
  let offset = 0;
  el.append(h('div.toolbar', who, what, h('label.inline', t('From'), from), h('label.inline', t('To'), to)), list, h('div.center', more));
  [who, what, from, to].forEach((x) => (x.onchange = () => { offset = 0; clear(list); load(); }));
  more.onclick = load;
  async function load() {
    let q = `select=*&order=at.desc&limit=100&offset=${offset}`;
    if (who.value) q += `&actor=eq.${who.value}`;
    if (what.value) q += `&table_name=eq.${what.value}`;
    if (from.value) q += `&at=gte.${from.value}`;
    if (to.value) q += `&at=lt.${new Date(new Date(to.value).getTime() + 86400000).toISOString().slice(0, 10)}`;
    try {
      const rows = await api.select('audit_log', q);
      offset += rows.length; more.hidden = rows.length < 100;
      if (!rows.length && offset === 0) return list.append(h('p.muted.pad', t('Nothing recorded for these filters.')));
      list.append(h('ul.feed.dense', rows.map((a) => h('li', h('span.feed-dot'),
        h('div', h('div', h('b', a.actor_name || t('System')), ' ', describeLine(a)), h('small.muted', fmtDateTime(a.at)))))));
    } catch (e) { fail(e); }
  }
  load();
}
function describeLine(a) {
  if (a.table_name === 'students' || a.table_name === 'contacts') {
    return [describeChange(a, true), ' ', a.student_id && a.action !== 'deleted' ? h('a', { href: `#/students/${a.student_id}` }, a.table_name === 'students' ? (a.label || t('student')) : t('student')) : h('span', a.label || '')];
  }
  const thing = { profiles: t('employee'), roles: t('role'), statuses: t('status') }[a.table_name] || a.table_name;
  const fields = Object.keys(a.changes || {}).join(', ');
  return `${t(a.action)} ${thing} ${a.label ? '“' + a.label + '”' : ''}${a.action === 'updated' && fields ? ` (${fields})` : ''}`;
}

// ---------------- connection ----------------
function about(el) {
  el.append(h('section.card.pad-lg',
    h('h3', 'Student Portal'), h('p.muted', t('Version {v} · made for AKI Consultant', { v: VERSION })),
    h('dl.facts', h('div', h('dt', t('Database')), h('dd', api.config()?.url || '')), h('div', h('dt', t('Signed in as')), h('dd', state.me.email))),
    h('div.row-btns', h('button.btn.ghost-danger', { onclick: async () => {
      if (await confirmBox(t('Disconnect this computer'), t('Sign out and remove the database connection from this computer? Nothing is deleted from the database.'), t('Disconnect'), true)) { await api.signOut(); api.clearConfig(); boot(); }
    } }, icon('logout', 16), t('Disconnect this computer')))));
}
