// Shared data the whole app needs: who is signed in, their permissions, statuses and employees.
import * as api from './api.js';

export const state = { me: null, perms: [], statuses: [], profiles: [], roles: [] };

export const can = (perm) => state.perms.includes('*') || state.perms.includes(perm);

export async function loadMe() {
  const uid = api.user()?.id;
  state.me = await api.one('profiles', `select=*&id=eq.${uid}`);
  state.perms = (await api.rpc('my_perms')) || [];
  return state.me;
}
export async function loadCore() {
  const [statuses, profiles, roles] = await Promise.all([
    api.select('statuses', 'select=*&order=sort,name'),
    api.select('profiles', 'select=id,email,full_name,role_id,active,extra_perms,revoked_perms,last_seen,created_at,must_change_password&order=full_name'),
    api.select('roles', 'select=*&order=sort,name'),
  ]);
  Object.assign(state, { statuses, profiles, roles });
}

export const statusById = (id) => state.statuses.find((s) => s.id === id);
export const activeStatuses = () => state.statuses.filter((s) => !s.archived);
export const profileById = (id) => state.profiles.find((p) => p.id === id);
export const personName = (id) => { const p = profileById(id); return p ? (p.full_name || p.email) : ''; };
export const roleName = (id) => state.roles.find((r) => r.id === id)?.name || '';
export const staff = () => state.profiles.filter((p) => p.active);
