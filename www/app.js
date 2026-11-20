
const SB = 'https://sfimdlwlfpzrztuucvxk.supabase.co';
const KEY = 'sb_publishable_lLG4-tqcfidFxdLqltZqGQ_2NKkihSI';
// ======================================================================
const CATS = ['Accident', 'Fighting', 'Rioting', 'Robbery', 'Fire', 'Other'];
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let sess = JSON.parse(localStorage.getItem('sess') || 'null');
let cur = 'feed', filter = 'All', lastSeen = null, signup = false, coords = null;

const H = t => ({ apikey: KEY, Authorization: 'Bearer ' + (t || KEY), 'Content-Type': 'application/json' });
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3500); }
async function api(path, opt = {}) {
  const r = await fetch(SB + path, opt);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.msg || d.error_description || d.message || 'Request failed');
  return d;
}
function save(d) {
  sess = { access_token: d.access_token, refresh_token: d.refresh_token, uid: d.user.id, email: d.user.email,
           expires_at: d.expires_at || Math.floor(Date.now() / 1000) + d.expires_in };
  localStorage.setItem('sess', JSON.stringify(sess));
}
async function token() {
  if (!sess) return null;
  if (Date.now() / 1000 > sess.expires_at - 60) {
    save(await api('/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: H(), body: JSON.stringify({ refresh_token: sess.refresh_token }) }));
  }
  return sess.access_token;
}

// ---------- navigation ----------
function go(v) {
  if ((v === 'report' || v === 'mine') && !sess) { toast('Please log in first'); v = 'auth'; }
  cur = v;
  document.querySelectorAll('section').forEach(s => s.hidden = s.id !== 'v-' + v);
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  $('#acct').textContent = sess ? '👤 Account' : '👤 Login';
  if (v === 'feed') { $('#dot').hidden = true; load('feed'); }
  if (v === 'mine') load('mine');
  if (v === 'report') locate();
  if (v === 'auth') drawAuth();
}

// ---------- login / sign up ----------
function drawAuth() {
  $('#v-auth').innerHTML = sess
    ? `<p class="note">Logged in as<br><b>${esc(sess.email)}</b></p><button class="btn" id="out">Log out</button>`
    : `<form id="af"><h2>${signup ? 'Create account' : 'Welcome back'}</h2>
        <label for="em">Email</label><input id="em" type="email" required autocomplete="email">
        <label for="pw">Password (min 6 characters)</label><input id="pw" type="password" required minlength="6" autocomplete="current-password">
        <button class="btn">${signup ? 'Sign up' : 'Log in'}</button>
        <button type="button" class="link" id="sw">${signup ? 'Have an account? Log in' : 'New here? Create an account'}</button></form>`;
  if (sess) $('#out').onclick = () => { sess = null; localStorage.removeItem('sess'); toast('Logged out'); go('feed'); };
  else { $('#af').onsubmit = auth; $('#sw').onclick = () => { signup = !signup; drawAuth(); }; }
}
async function auth(e) {
  e.preventDefault();
  const body = JSON.stringify({ email: $('#em').value.trim(), password: $('#pw').value });
  try {
    const d = await api(signup ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password', { method: 'POST', headers: H(), body });
    if (!d.access_token) { toast('Account created. Please log in.'); signup = false; drawAuth(); return; }
    save(d); toast('Welcome! 👋'); go('feed');
  } catch (x) { toast(x.message); }
}

// ---------- browse incidents ----------
function card(i) {
  return `<article class="inc"><span class="tag">${esc(i.category)}</span>
    ${i.image_url ? `<img src="${esc(i.image_url)}" alt="Incident photo">` : ''}
    <h3>${esc(i.title)}</h3><p>${esc(i.description)}</p>
    <small>${new Date(i.created_at).toLocaleString()} · ${esc(i.user_email)}</small>
    ${i.lat != null ? `<a class="map" href="https://maps.google.com/?q=${i.lat},${i.lng}" target="_blank">📍 ${(+i.lat).toFixed(4)}, ${(+i.lng).toFixed(4)}</a>` : ''}</article>`;
}
async function load(k) {
  const box = $(k === 'mine' ? '#list2' : '#list');
  box.innerHTML = '<p class="note">Loading…</p>';
  let q = '/rest/v1/incidents?select=*&order=created_at.desc&limit=50';
  if (k === 'mine') q += '&user_id=eq.' + sess.uid; else if (filter !== 'All') q += '&category=eq.' + encodeURIComponent(filter);
  try {
    const d = await api(q, { headers: H(await token()) });
    box.innerHTML = d.length ? d.map(card).join('') : '<p class="note">No incidents here yet.</p>';
    if (k === 'feed' && filter === 'All' && d[0]) lastSeen = d[0].created_at;
  } catch (x) { box.innerHTML = '<p class="note">Could not load. Check your internet and try again.</p>'; }
}
function drawChips() {
  $('#chips').innerHTML = ['All', ...CATS].map(c => `<button class="${c === filter ? 'on' : ''}" data-c="${c}">${c}</button>`).join('');
  $('#chips').onclick = e => { if (e.target.dataset.c) { filter = e.target.dataset.c; drawChips(); load('feed'); } };
}

// ---------- report an incident ----------
function locate() {
  $('#loc').textContent = '📍 Getting your location…'; coords = null;
  navigator.geolocation.getCurrentPosition(
    p => { coords = { lat: p.coords.latitude, lng: p.coords.longitude }; $('#loc').textContent = `📍 ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`; },
    () => { $('#loc').textContent = '📍 Location unavailable. Turn on GPS and allow permission.'; },
    { enableHighAccuracy: true, timeout: 15000 });
}
async function submit(e) {
  e.preventDefault();
  const btn = $('#send'); btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const t = await token(); let url = null; const f = $('#photo').files[0];
    if (f) {
      const p = sess.uid + '/' + Date.now() + '.jpg';
      await api('/storage/v1/object/incidents/' + p, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + t, 'Content-Type': f.type || 'image/jpeg' }, body: f });
      url = SB + '/storage/v1/object/public/incidents/' + p;
    }
    await api('/rest/v1/incidents', { method: 'POST', headers: { ...H(t), Prefer: 'return=minimal' },
      body: JSON.stringify({ title: $('#ttl').value.trim(), description: $('#dsc').value.trim(), category: $('#cat').value,
        lat: coords ? coords.lat : null, lng: coords ? coords.lng : null, image_url: url, user_id: sess.uid, user_email: sess.email }) });
    e.target.reset(); $('#prev').hidden = true; toast('Incident submitted ✔'); go('feed');
  } catch (x) { toast(x.message); }
  btn.disabled = false; btn.textContent = 'Submit incident';
}

// ---------- notifications: check for new incidents every 15s ----------
async function poll() {
  try {
    const d = await api('/rest/v1/incidents?select=title,created_at,user_id&order=created_at.desc&limit=1', { headers: H() });
    const n = d[0]; if (!n) return;
    if (!lastSeen) { lastSeen = n.created_at; return; }
    if (n.created_at > lastSeen) {
      lastSeen = n.created_at;
      if (!sess || n.user_id !== sess.uid) { toast('🚨 New incident: ' + n.title); if (navigator.vibrate) navigator.vibrate(300); if (cur !== 'feed') $('#dot').hidden = false; }
      if (cur === 'feed') load('feed');
    }
  } catch (e) { /* offline: try again next time */ }
}

function init() {
  $('#cat').innerHTML = CATS.map(c => `<option>${c}</option>`).join('');
  drawChips();
  document.querySelector('nav').onclick = e => { const b = e.target.closest('button'); if (b) go(b.dataset.v); };
  $('#rf').onsubmit = submit;
  $('#photo').onchange = e => { const f = e.target.files[0]; if (f) { $('#prev').src = URL.createObjectURL(f); $('#prev').hidden = false; } };
  go('feed'); poll(); setInterval(poll, 15000);
}
document.addEventListener('deviceready', init);
if (!window.cordova) window.addEventListener('DOMContentLoaded', init);
