// Translation layer. Every piece of interface text goes through t('English text').
// To add Arabic later: fill AR below with  'English text': 'النص العربي'  and call setLang('ar').
// The layout uses logical CSS properties, so switching to right-to-left needs no other changes.
const AR = {};
const DICTS = { en: {}, ar: AR };

let lang = 'en';
try { lang = localStorage.getItem('sp:lang') || 'en'; } catch {}

export function t(text, vars) {
  let s = (DICTS[lang] && DICTS[lang][text]) || text;
  if (vars) for (const k in vars) s = s.split(`{${k}}`).join(vars[k]);
  return s;
}
export function getLang() { return lang; }
export function setLang(l) {
  lang = DICTS[l] ? l : 'en';
  try { localStorage.setItem('sp:lang', lang); } catch {}
  applyDir();
}
export function applyDir() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}
