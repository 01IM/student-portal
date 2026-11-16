// Student Portal — start-up, sign-in and navigation.
import * as api from './api.js';
import { t, applyDir } from './i18n.js';
import { h, clear, icon, toast, fail, initials, confirmBox } from './ui.js';
import { state, can, loadMe, loadCore, roleName } from './store.js';
import { renderHome } from './home.js';
import { renderStudents, renderStudent } from './students.js';
import { renderSettings } from './settings.js';

export const VERSION = '0.1.0';
const root = document.getElementById('app');

// ---------------- first-time connection ----------------
function connectScreen(err) {
  const url = h('input', { placeholder: 'https://xxxxxxxx.supabase.co', value: api.config()?.url || '' });
  const anon = h('textarea', { rows: 3, placeholder: 'eyJhbGciOi…' });
  const msg = h('p.form-err', err || '');
  const go = async (e) => {
    e.preventDefault(); msg.textContent = '';
    try {
      api.setConfig(url.value, anon.value);
      const r = await fetch(api.config().url + '/auth/v1/settings', { headers: { apikey: api.config().anon } });
      if (!r.ok) throw new Error(t('The URL or key is not right (the server answered {s}).', { s: r.status }));
      boot();
    } catch (ex) { msg.textContent = ex.message === 'Failed to fetch' ? t('Cannot reach that address. Check the URL and the internet connection.') : ex.message; }
  };
  clear(root).append(h('div.auth-wrap', h('form.auth-card.wide', { onsubmit: go },
    h('img.auth-logo', { src: 'img/logo.png', alt: 'AKI Consultant' }),
    h('h1', t('Connect Student Portal')),
    h('p.muted', t('This is done once on each computer. Your administrator has these two values (Supabase → Project Settings → API).')),
    h('label', t('Project URL'), url),
    h('label', t('Public (anon) key'), anon),
    msg,
    h('button.btn.primary.block', { type: 'submit' }, t('Connect')))));
}

// ---------------- sign in ----------------
function loginScreen(err) {
  const email = h('input', { type: 'email', autocomplete: 'username', placeholder: 'name@akiconsultant.com' });
  const pass = h('input', { type: 'password', autocomplete: 'current-password' });
  const msg = h('p.form-err', err || '');
  const btn = h('button.btn.primary.block', { type: 'submit' }, t('Sign in'));
  const go = async (e) => {
    e.preventDefault(); msg.textContent = ''; btn.disabled = true;
    try { await api.signIn(email.value, pass.value); await boot(); }
    catch (ex) { msg.textContent = ex.message; btn.disabled = false; }
  };
  clear(root).append(h('div.auth-wrap', h('form.auth-card', { onsubmit: go },
    h('img.auth-logo', { src: 'img/logo.png', alt: 'AKI Consultant' }),
    h('h1', t('Student Portal')),
    h('p.muted', t('Sign in with your AKI employee account.')),
    h('label', t('Email'), email),
    h('label', t('Password'), pass),
    msg, btn,
    h('button.link-btn', { type: 'button', onclick: async () => { if (await confirmBox(t('Connection settings'), t('Disconnect this computer from the AKI database? You will need the project URL and key to connect again.'), t('Disconnect'), true)) { api.clearConfig(); boot(); } } }, t('Connection settings')))));
  setTimeout(() => email.focus(), 50);
}

function messageScreen(title, text) {
  clear(root).append(h('div.auth-wrap', h('div.auth-card',
    h('img.auth-logo', { src: 'img/logo.png', alt: 'AKI Consultant' }),
    h('h1', title), h('p.muted', text),
    h('button.btn.block', { onclick: async () => { await api.signOut(); boot(); } }, t('Sign out')))));
}

export function passwordForm(onDone, forced) {
  const p1 = h('input', { type: 'password', autocomplete: 'new-password' });
  const p2 = h('input', { type: 'password', autocomplete: 'new-password' });
  const msg = h('p.form-err');
  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault(); msg.textContent = '';
    if (p1.value.length < 8) return (msg.textContent = t('Use at least 8 characters.'));
    if (p1.value !== p2.value) return (msg.textContent = t('The two passwords do not match.'));
    try { await api.changePassword(p1.value); await api.rpc('touch_profile', { password_changed: true }); toast(t('Password changed')); onDone(); }
    catch (ex) { msg.textContent = ex.message; }
  } },
  forced ? h('p.muted', t('Your administrator set a temporary password. Choose your own password to continue.')) : null,
  h('label', t('New password'), p1), h('label', t('Repeat new password'), p2), msg,
  h('button.btn.primary.block', { type: 'submit' }, t('Save password')));
  return form;
}

// ---------------- start-up ----------------
export async function boot() {
  applyDir();
  if (!api.config()) return connectScreen();
  if (!api.signedIn()) return loginScreen();
  clear(root).append(h('div.loading', h('img', { src: 'img/logo.png' }), h('div.spinner')));
  try {
    const me = await loadMe();
    if (!me.active) return messageScreen(t('Account not active yet'), t('Your account exists but an administrator still needs to give it a role, or it has been deactivated. Please contact your administrator.'));
    if (me.must_change_password) {
      return clear(root).append(h('div.auth-wrap', h('div.auth-card', h('img.auth-logo', { src: 'img/logo.png' }), h('h1', t('Choose a new password')), passwordForm(boot, true))));
    }
    await loadCore();
    api.rpc('touch_profile').catch(() => {});
    shell();
  } catch (e) {
    if (!api.signedIn()) return loginScreen(e.message);
    clear(root).append(h('div.auth-wrap', h('div.auth-card', h('img.auth-logo', { src: 'img/logo.png' }),
      h('h1', t('Cannot load Student Portal')), h('p.muted', e.message),
      /relation|does not exist|function/i.test(e.message) ? h('p.muted', t('The database has not been set up yet. Run docs/supabase-setup.sql in the Supabase SQL Editor.')) : null,
      h('button.btn.primary.block', { onclick: boot }, t('Try again')),
      h('button.link-btn', { onclick: async () => { await api.signOut(); boot(); } }, t('Sign out')))));
  }
}
api.onSessionLost(() => loginScreen(t('Your session ended. Please sign in again.')));

// ---------------- main layout ----------------
const NAV = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'students', label: 'Students', icon: 'student', perm: 'students.view' },
  { id: 'universities', label: 'Universities', icon: 'uni', perm: 'universities.view', soon: true },
  { id: 'tasks', label: 'Tasks', icon: 'tasks', soon: true },
  { id: 'visa', label: 'Visa guides', icon: 'visa', perm: 'visa.view', soon: true },
  { id: 'finance', label: 'Finance', icon: 'finance', perm: 'finance.view', soon: true },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];
const SOON = {
  universities: ['Universities & courses', 'Partner universities with contacts, countries, course catalogues and commission terms, linked to each student\'s applications.'],
  tasks: ['Tasks & reminders', 'Follow-up reminders, tasks assigned between staff, and alerts for application, deposit and visa deadlines.'],
  visa: ['Visa guides', 'Step-by-step student visa guides for 12 countries, applied from Kuwait, with a bank statement calculator.'],
  finance: ['Finance', 'Commissions expected and received, IELTS, visa and translation income, expenses and reports in KWD.'],
};

let main;
function shell() {
  const me = state.me;
  const nav = h('nav.nav');
  for (const n of NAV) {
    if (n.perm && !can(n.perm)) continue;
    nav.append(h('a.nav-item', { href: '#/' + n.id, 'data-id': n.id }, icon(n.icon, 19), h('span', t(n.label)), n.soon ? h('em.soon', t('soon')) : null));
  }
  main = h('main.main');
  clear(root).append(h('div.layout',
    h('aside.side',
      h('div.brand', h('img', { src: 'img/logo.png', alt: 'AKI Consultant' }), h('div', h('b', 'Student Portal'), h('small', 'AKI Consultant'))),
      nav,
      h('div.side-foot',
        h('a.me', { href: '#/settings/account' }, h('span.avatar', initials(me.full_name || me.email)), h('div', h('b', me.full_name || me.email), h('small', roleName(me.role_id)))),
        h('button.icon-btn', { title: t('Sign out'), onclick: async () => { await api.signOut(); boot(); } }, icon('logout')))),
    main));
  window.onhashchange = route;
  route();
  checkForUpdate();
}

// ---------------- self-update (Windows app only) ----------------
async function checkForUpdate() {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) return;
  try {
    const u = await invoke('check_update');
    if (!u || document.querySelector('.update-box')) return;
    const btn = h('button.btn.primary.sm', t('Update now'));
    btn.onclick = async () => {
      btn.disabled = true; btn.textContent = t('Downloading…');
      try { await invoke('install_update', { url: u.url }); }
      catch (e) { fail(e); btn.disabled = false; btn.textContent = t('Update now'); }
    };
    document.querySelector('.side-foot')?.before(h('div.update-box', icon('refresh', 16), h('div', h('b', t('Update available')), h('small', t('Build {n}', { n: u.build }))), btn));
  } catch (e) { console.warn('Update check failed', e); }
}
setInterval(checkForUpdate, 6 * 3600 * 1000);

export function route() {
  if (!main) return;
  const parts = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
  const [page] = parts;
  document.querySelectorAll('.nav-item').forEach((a) => a.classList.toggle('on', a.dataset.id === page));
  clear(main);
  main.scrollTop = 0;
  try {
    if (page === 'students' && parts[1]) return renderStudent(main, parts[1], parts[2]);
    if (page === 'students') return renderStudents(main);
    if (page === 'settings') return renderSettings(main, parts[1]);
    if (SOON[page]) return soonPage(main, page);
    return renderHome(main);
  } catch (e) { fail(e); }
}

function soonPage(el, id) {
  const [title, text] = SOON[id];
  el.append(h('div.page-head', h('h1', t(title))),
    h('div.card.empty-big', icon(NAV.find((n) => n.id === id).icon, 40), h('h2', t('Coming in a later update')), h('p.muted', t(text))));
}

// Keep lists fresh when you come back to the window.
let lastFocus = Date.now();
window.addEventListener('focus', async () => {
  if (!main || Date.now() - lastFocus < 20000) return;
  lastFocus = Date.now();
  try { await loadCore(); window.dispatchEvent(new Event('sp:refresh')); } catch {}
});

boot();
