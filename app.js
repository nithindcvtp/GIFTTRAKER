/* Kurikalyanam - static front end. Data lives in Google Sheets via the Apps Script web app (config.js). */
const $ = s => document.querySelector(s);
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = n => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const titleCase = t => t.replace(/\s+/g, ' ').trim().toLowerCase().replace(/(^|[\s\-.(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
const today = () => new Date().toISOString().slice(0, 10);
const ICONS = {
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  undo: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  plus: '<path d="M5 12h14M12 5v14"/>'
};
const ic = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;
const NAV = [['', 'Dashboard', 'home'], ['gift', 'Add Gift', 'gift'], ['people', 'People', 'users'], ['records', 'All Records', 'list'],
  ['pending', 'Pending Returns', 'clock'], ['returned', 'Returned Gifts', 'undo'], ['occasions', 'Occasions', 'calendar']];
const TOP = ['', 'gift', 'people', 'occasions', 'records'];

let D = { people: [], gifts: [], occasions: [] };
let key = (window.CONFIG && window.CONFIG.PASSCODE) || localStorage.getItem('kk_key') || '';
let flash = '';

// ---------------------------------------------------------------- API + local-first sync
// Every change is applied to the page instantly (applyLocal), then sent to Google Sheets in the background (queue).
const uid = () => String(crypto.randomUUID ? crypto.randomUUID() : Date.now() + Math.random().toString(16).slice(2)).replace(/-/g, '');
let queue = JSON.parse(localStorage.getItem('kk_queue') || '[]'), syncing = false, syncErr = '';
const saveQ = () => localStorage.setItem('kk_queue', JSON.stringify(queue));

async function call(action, payload = {}) {
  let j;
  try {
    const r = await fetch(window.CONFIG.API_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // text/plain avoids a CORS preflight
      body: JSON.stringify({ key, action, ...payload })
    });
    j = await r.json();
  } catch (e) { const err = new Error('Offline'); err.net = true; throw err; }
  if (!j.ok) { if (/passcode/i.test(j.error)) { key = ''; localStorage.removeItem('kk_key'); } throw new Error(j.error); }
  return j.data;
}

function badge(text, hideAfter) {
  let b = $('#sync');
  if (!b) {
    b = document.createElement('div'); b.id = 'sync';
    b.style.cssText = 'position:fixed;right:14px;bottom:14px;padding:6px 14px;border-radius:20px;font-size:.82rem;background:#fff;border:1px solid #ddd;box-shadow:0 2px 8px rgba(0,0,0,.15);z-index:50;display:none';
    document.body.appendChild(b);
  }
  clearTimeout(b._t); b.textContent = text || ''; b.style.display = text ? 'block' : 'none';
  if (text && hideAfter) b._t = setTimeout(() => (b.style.display = 'none'), hideAfter);
}

async function pump() {
  if (syncing || !queue.length) return;
  syncing = true; badge('Saving…');
  while (queue.length) {
    try {
      const data = await call(queue[0].action, queue[0].payload);
      queue.shift(); saveQ(); syncErr = '';
      if (!queue.length) D = data;                 // quiet re-sync with the Sheet once everything is saved
    } catch (e) {
      if (e.net) { syncErr = 'Offline'; badge('⚠ Offline - will retry'); syncing = false; setTimeout(pump, 5000); return; }
      if (/passcode/i.test(e.message)) { syncing = false; badge('⚠ Wrong passcode - changes not saved'); return; }
      queue.shift(); saveQ(); alert('Could not save a change: ' + e.message);   // server refused this change
      try { D = await call('load'); queue.forEach(it => applyLocal(it.action, it.payload)); route(); } catch (_) {}
    }
  }
  syncing = false; badge('✓ Saved', 1500);
}
addEventListener('beforeunload', e => { if (queue.length) { e.preventDefault(); e.returnValue = ''; } });

// Same rules as the Apps Script, applied to the in-browser copy. Safe to repeat.
function applyLocal(action, p) {
  const gift = id => D.gifts.find(x => x.id === id);
  if (action === 'saveGift') {
    const u = D.people.find(x => x.id === p.person.id);
    if (u) Object.assign(u, p.person); else D.people.push({ ...p.person });
    const g = gift(p.gift.id);
    if (g) Object.assign(g, p.gift); else D.gifts.push({ returned: false, returned_on: '', ret_type: '', ret_value: 0, ret_gold: 0, ret_description: '', ...p.gift });
  } else if (action === 'returnGift') {
    const g = gift(p.id); if (g) Object.assign(g, { returned: true, returned_on: p.returned_on, ret_type: p.ret_type || 'Cash', ret_value: +p.ret_value || 0, ret_gold: +p.ret_gold || 0, ret_description: p.ret_description || '' });
  } else if (action === 'unreturnGift') {
    const g = gift(p.id); if (g) Object.assign(g, { returned: false, returned_on: '', ret_type: '', ret_value: 0, ret_gold: 0, ret_description: '' });
  } else if (action === 'deleteGift') D.gifts = D.gifts.filter(x => x.id !== p.id);
  else if (action === 'savePerson') {
    const u = D.people.find(x => x.id === p.id);
    if (u) Object.assign(u, { name: p.name, phone: p.phone, address: p.address }); else D.people.push({ id: p.id, name: p.name, phone: p.phone, address: p.address });
  } else if (action === 'deletePerson') D.people = D.people.filter(x => x.id !== p.id);
  else if (action === 'addOccasion') { if (!D.occasions.some(o => o.toLowerCase() === p.name.toLowerCase())) D.occasions.push(p.name); }
  else if (action === 'deleteOccasion') D.occasions = D.occasions.filter(o => o !== p.name);
}

// Change the page now, sync in the background.
function change(action, payload, msg) {
  applyLocal(action, payload);
  queue.push({ action, payload }); saveQ();
  flash = msg || ''; route(); pump();
}

// Decide whether a gift belongs to an existing person or a new one (same rules as before).
function resolvePerson(v) {
  const name = titleCase(v.name), phone = (v.phone || '').trim(), address = (v.address || '').trim(), lc = name.toLowerCase();
  let u = v.user_id ? D.people.find(x => x.id === v.user_id && x.name.toLowerCase() === lc) : null;
  if (!u) {
    const same = D.people.filter(x => x.name.toLowerCase() === lc);
    if (phone) u = same.find(x => x.phone === phone) || same.find(x => !x.phone);
    else if (same.length === 1) u = same[0];
  }
  return u ? { ...u, phone: phone || u.phone, address: address || u.address } : { id: uid(), name, phone, address };
}

// ---------------------------------------------------------------- helpers
const P = () => Object.fromEntries(D.people.map(u => [u.id, u]));
const sortedPeople = () => [...D.people].sort((a, b) => a.name.localeCompare(b.name));
const toReturn = e => e.direction === 'received' && !e.returned;
const giftLabel = (t, gold, desc) => t === 'Gold' ? 'Gold' + (gold ? ` (${+gold} g)` : '') : t === 'Other' ? (desc || 'Other') : (t || 'Cash');
const head = (t, lead) => `<div><h1>${t}</h1><p class="lead">${lead}</p></div>`;

function recordsTable(rows, actions) {
  if (!rows.length) return '<div class="empty">No records yet.</div>';
  const users = P();
  return `<div class="tbl"><table><tr><th>#</th><th>Name</th><th>Occasion</th><th>Received Gift</th><th>Value</th><th>Returned Gift</th><th>Value</th><th>Status</th>${actions ? '<th></th>' : ''}</tr>` +
    rows.map((r, i) => {
      const u = users[r.user_id] || { name: '?', phone: '' };
      return `<tr><td>${i + 1}</td><td><b>${h(u.name)}</b><div class="sub">${h(u.phone)}</div></td>
      <td>${h(r.occasion)}<div class="sub">${h(r.date)}${r.direction === 'given' ? ' · We gave them' : ''}</div></td>
      <td>${h(giftLabel(r.gift_type, r.gold, r.description))}${r.gift_type !== 'Other' && r.description ? `<div class="sub">${h(r.description)}</div>` : ''}</td>
      <td>${r.value ? inr(r.value) : '-'}</td>
      <td>${r.returned ? h(giftLabel(r.ret_type, r.ret_gold, r.ret_description)) + (r.ret_type !== 'Other' && r.ret_description ? `<div class="sub">${h(r.ret_description)}</div>` : '') + `<div class="sub">on ${h(r.returned_on)}</div>` : '-'}</td>
      <td>${r.returned && r.ret_value ? inr(r.ret_value) : '-'}</td>
      <td>${r.returned ? '<span class="pill ok">Returned</span>' : '<span class="pill warn">Pending</span>'}</td>
      ${actions ? `<td class="acts"><button class="ghost small" data-act="gedit" data-id="${r.id}">Edit</button> ${r.returned
        ? `<button class="ghost small" data-act="redit" data-id="${r.id}" data-name="${h(u.name)}">Edit return</button> <button class="ghost small" data-act="unret" data-id="${r.id}" data-name="${h(u.name)}">Undo return</button>`
        : `<button class="ghost small" data-act="ret" data-id="${r.id}" data-name="${h(u.name)}" data-value="${r.value}" data-gold="${r.gold}">Mark returned</button>`}
        <button class="del small" data-act="del" data-id="${r.id}" data-name="${h(u.name)}">Delete</button></td>` : ''}</tr>`;
    }).join('') + '</table></div>';
}

// ---------------------------------------------------------------- pages
function dashboard() {
  const recv = D.gifts.filter(e => e.direction === 'received'), pend = recv.filter(e => !e.returned);
  const sum = (a, f) => a.reduce((s, e) => s + (+f(e) || 0), 0);
  const recent = D.gifts.map((e, i) => [e, i]).sort((a, b) => (b[0].date + b[1]).localeCompare(a[0].date + a[1])).slice(0, 6).map(t => t[0]);
  return `<div class="stats">
    <div class="stat"><span class="ic g">${ic('users')}</span><div><small>Total People</small><b>${D.people.length}</b></div></div>
    <div class="stat"><span class="ic r">${ic('gift')}</span><div><small>Received</small><b>${inr(sum(recv, e => e.value))}</b></div></div>
    <div class="stat"><span class="ic g">${ic('undo')}</span><div><small>Returned</small><b>${inr(sum(recv.filter(e => e.returned), e => e.ret_value))}</b></div></div>
    <div class="stat"><span class="ic o">${ic('clock')}</span><div><small>Pending</small><b>${pend.length}</b><em>${inr(sum(pend, e => e.value))} to return</em></div></div></div>
  <section class="card"><div class="head"><h2>Recent Records</h2>
    <form class="search" data-form="dsearch">${ic('search')}<input name="q" placeholder="Search name / phone / address..."></form>
    <a class="btn" href="#/gift">${ic('plus')} Add New Gift</a></div>${recordsTable(recent, true)}</section>`;
}

function recordsPage(view, title, lead, q) {
  const users = P(), s = (q.q || '').toLowerCase();
  const rows = D.gifts.filter(e => {
    const u = users[e.user_id] || {};
    const hay = ((u.name || '') + (u.phone || '') + (u.address || '') + e.description).toLowerCase();
    if (view === 'pending' && !toReturn(e)) return false;
    if (view === 'returned' && !e.returned) return false;
    return (!s || hay.includes(s)) && (!q.occasion || e.occasion === q.occasion) && (!q.user || e.user_id === q.user);
  }).sort((a, b) => b.date.localeCompare(a.date));
  return head(title, lead) + `<section class="card"><form class="bar" data-form="filters" data-path="${view === 'all' ? 'records' : view}">
    <div class="search">${ic('search')}<input name="q" value="${h(q.q || '')}" placeholder="Search name / phone / address..."></div>
    <select name="user"><option value="">All people</option>${sortedPeople().map(u => `<option value="${u.id}" ${u.id === q.user ? 'selected' : ''}>${h(u.name)}</option>`).join('')}</select>
    <select name="occasion"><option value="">All occasions</option>${[...D.occasions].sort().map(o => `<option ${o === q.occasion ? 'selected' : ''}>${h(o)}</option>`).join('')}</select>
    <button type="submit">Search</button><a class="btn" href="#/gift" style="margin-left:auto">${ic('plus')} Add New Gift</a></form>${recordsTable(rows, true)}</section>`;
}

function giftForm(q) {
  const eg = D.gifts.find(x => x.id === q.edit), g = eg || {};
  const pre = eg ? D.people.find(u => u.id === eg.user_id) : D.people.find(u => u.id === q.user);
  const sel = (a, b) => (a === b ? 'selected' : '');
  return head(eg ? 'Edit gift' : 'Add gift', eg ? 'Change anything and save. Return details are kept.' : 'Record a gift you received (or gave) at a wedding, birthday, housewarming or other occasion.') + `<section class="card">
  <form class="grid" data-form="gift">
    <input type="hidden" name="id" value="${h(g.id)}">
    <input type="hidden" name="user_id" id="guid" value="${pre ? pre.id : ''}">
    <label>Name *<input name="name" id="gname" list="plist" autocomplete="off" required value="${h(pre?.name)}" placeholder="Type a name, or pick an existing person">
      <datalist id="plist">${sortedPeople().map(u => `<option value="${h(u.name)}">${h(u.phone)}</option>`).join('')}</datalist></label>
    <label>Phone<input name="phone" id="gphone" type="tel" value="${h(pre?.phone)}"></label>
    <label class="wide">Address<textarea name="address" id="gaddr" rows="2">${h(pre?.address)}</textarea></label>
    <p class="wide sub" id="gnote" style="margin:0">New names are saved to <a href="#/people">People</a> automatically.</p>
    <label>Occasion *<select name="occasion" required>${[...D.occasions].sort().map(o => `<option ${sel(o, g.occasion)}>${h(o)}</option>`).join('')}</select></label>
    <label>Date<input name="date" type="date" value="${h(g.date || today())}"></label>
    <label>Who gave?<select name="direction"><option value="received" ${sel('received', g.direction)}>They gave us (we must return)</option><option value="given" ${sel('given', g.direction)}>We gave them (they must return)</option></select></label>
    <label>Gift type<select name="gift_type" id="gtype">${['Cash', 'Gold', 'Other'].map(t => `<option ${sel(t, g.gift_type)}>${t}</option>`).join('')}</select></label>
    <label>Value (₹)<input name="value" type="number" min="0" step="any" value="${g.value || ''}" placeholder="Cash amount, or estimated worth"></label>
    <label id="goldBox" style="display:${g.gift_type === 'Gold' ? '' : 'none'}">Gold (grams) <span class="sub">1 pavan = 8 g</span><input name="gold" type="number" min="0" step="any" value="${g.gold || ''}"></label>
    <label class="wide">Description (e.g. mixer grinder, 1 pavan chain)<textarea name="description" rows="2">${h(g.description)}</textarea></label>
    <div class="wide row"><button type="submit">${eg ? 'Update gift' : 'Save gift'}</button><a class="btn" style="background:none;color:var(--mute);border:1px solid var(--line)" href="#/${eg ? 'records' : ''}">Cancel</a></div>
  </form></section>`;
}

function peoplePage(q) {
  const s = (q.q || '').toLowerCase();
  const rows = sortedPeople().filter(u => !s || (u.name + u.phone + u.address).toLowerCase().includes(s));
  return `<div class="head" style="margin:0"><div><h1>People</h1><p class="lead">People are added automatically when you save a gift. You can also add or edit them here.</p></div>
    <button type="button" data-act="padd">${ic('plus')} Add person</button></div>
  <section class="card"><form class="bar" data-form="psearch"><div class="search">${ic('search')}<input name="q" value="${h(q.q || '')}" placeholder="Search name / phone / address..."></div><button type="submit">Search</button></form>
  ${rows.length ? `<div class="tbl"><table style="min-width:640px"><tr><th>Name</th><th>Phone</th><th>Address</th><th>Gifts</th><th>Pending</th><th></th></tr>` +
    rows.map(u => { const es = D.gifts.filter(e => e.user_id === u.id);
      return `<tr><td><b>${h(u.name)}</b></td><td>${h(u.phone)}</td><td>${h(u.address)}</td><td><a href="#/records?user=${u.id}">${es.length}</a></td><td>${es.filter(toReturn).length}</td>
      <td class="acts"><a class="btn ghost small" style="background:none;color:var(--green);border:1px solid var(--green)" href="#/gift?user=${u.id}">Add gift</a>
      <button class="ghost small" data-act="pedit" data-id="${u.id}">Edit</button>
      <button class="del small" data-act="pdel" data-id="${u.id}" data-name="${h(u.name)}">Delete</button></td></tr>`; }).join('') + '</table></div>'
    : '<div class="empty">No people yet. They appear here automatically when you add a gift.</div>'}</section>`;
}

function occasionsPage() {
  const cnt = o => D.gifts.filter(e => e.occasion === o).length;
  return head('Occasions', 'The list you choose from when recording a gift.') + `<section class="card"><h2 style="font-size:1.15rem;margin-bottom:12px">Add an occasion</h2>
    <form class="row" data-form="occ"><input name="name" placeholder="e.g. Engagement, Naming ceremony" required><button type="submit">Add occasion</button></form></section>
  <section class="card"><div class="tbl"><table style="min-width:420px"><tr><th>Occasion</th><th>Gifts recorded</th><th></th></tr>` +
    [...D.occasions].sort().map(o => `<tr><td><b>${h(o)}</b></td><td><a href="#/records?occasion=${encodeURIComponent(o)}">${cnt(o)}</a></td>
      <td>${cnt(o) ? `<span class="sub">In use, can't be removed</span>` : `<button class="del small" data-act="odel" data-name="${h(o)}">Delete</button>`}</td></tr>`).join('') + '</table></div></section>';
}

// ---------------------------------------------------------------- router
function route() {
  const [path, qs] = (location.hash.slice(2) || '').split('?');
  const q = Object.fromEntries(new URLSearchParams(qs || ''));
  const pages = {
    '': dashboard, gift: giftForm, people: peoplePage, occasions: occasionsPage,
    records: q => recordsPage('all', 'All records', 'Every gift given or received.', q),
    pending: q => recordsPage('pending', 'Pending returns', 'Gifts you received and still have to return.', q),
    returned: q => recordsPage('returned', 'Returned gifts', 'Gifts that have been returned, with what was given back.', q)
  };
  const p = pages[path] ? path : '';
  $('#side').innerHTML = NAV.map(([k, l, i]) => `<a href="#/${k}" class="${k === p ? 'on' : ''}">${ic(i)}${l}</a>`).join('') + (window.CONFIG.PASSCODE ? '' : '<a href="#/" data-act="logout">Log out</a>');
  $('#topnav').innerHTML = NAV.filter(n => TOP.includes(n[0])).sort((a, b) => TOP.indexOf(a[0]) - TOP.indexOf(b[0]))
    .map(([k, l, i]) => `<a href="#/${k}" class="${k === p ? 'on' : ''}">${ic(i)}${k === '' ? 'Home' : l}</a>`).join('');
  $('#app').innerHTML = pages[p](q);
  $('#flash').innerHTML = flash ? `<div class="msg">${h(flash)}</div>` : ''; flash = '';
}
addEventListener('hashchange', route);

// ---------------------------------------------------------------- events
document.addEventListener('submit', e => {
  const f = e.target, kind = f.dataset.form; if (!kind) return;
  e.preventDefault();
  const v = Object.fromEntries(new FormData(f));
  if (kind === 'login') { key = v.key.trim(); localStorage.setItem('kk_key', key); start(); return; }
  if (kind === 'gift') {
    const person = resolvePerson(v);
    const gift = { id: v.id || uid(), user_id: person.id, occasion: v.occasion, date: v.date || today(), direction: v.direction, gift_type: v.gift_type,
      value: +v.value || 0, gold: +v.gold || 0, description: (v.description || '').trim() };
    applyLocal('saveGift', { person, gift }); queue.push({ action: 'saveGift', payload: { person, gift } }); saveQ();
    flash = v.id ? 'Gift updated.' : 'Gift saved.'; location.hash = '#/records'; pump();
  } else if (kind === 'person') {
    if (!v.name.trim()) return;
    pDlg.close(); change('savePerson', { id: v.id || uid(), name: titleCase(v.name), phone: v.phone.trim(), address: v.address.trim() }, 'Saved.');
  } else if (kind === 'ret') { retDlg.close(); change('returnGift', v, 'Return saved.'); }
  else if (kind === 'occ') {
    const n = v.name.trim();
    if (D.occasions.some(o => o.toLowerCase() === n.toLowerCase())) return alert('That occasion already exists.');
    change('addOccasion', { name: n }, 'Added occasion: ' + n);
  }
  else if (kind === 'dsearch') location.hash = '#/records?q=' + encodeURIComponent(v.q);
  else if (kind === 'psearch') location.hash = '#/people?q=' + encodeURIComponent(v.q);
  else if (kind === 'filters') location.hash = '#/' + f.dataset.path + '?' + new URLSearchParams(Object.entries(v).filter(x => x[1]));
});

document.addEventListener('change', e => {
  if (e.target.closest('[data-form=filters]') && e.target.tagName === 'SELECT') e.target.form.requestSubmit();
  if (e.target.id === 'gtype') $('#goldBox').style.display = e.target.value === 'Gold' ? '' : 'none';
  if (e.target.id === 'retType') $('#retGoldBox').style.display = e.target.value === 'Gold' ? '' : 'none';
});

document.addEventListener('input', e => {
  if (e.target.id !== 'gname') return;
  const m = D.people.filter(u => u.name.toLowerCase() === e.target.value.trim().toLowerCase()), note = $('#gnote');
  if (m.length === 1) {
    $('#guid').value = m[0].id; $('#gphone').value = m[0].phone || ''; $('#gaddr').value = m[0].address || '';
    note.textContent = 'Existing person - details filled in from People. Edit them here to update.';
  } else {
    $('#guid').value = '';
    note.textContent = m.length > 1 ? 'More than one person has this name - add the phone number to tell them apart.' : 'New names are saved to People automatically.';
  }
});

document.addEventListener('focusout', e => {
  if (e.target.id === 'gname' || e.target.id === 'pname2') { e.target.value = titleCase(e.target.value); if (e.target.id === 'gname') e.target.dispatchEvent(new Event('input', { bubbles: true })); }
});

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const d = b.dataset;
  switch (d.act) {
    case 'gedit': location.hash = '#/gift?edit=' + d.id; break;
    case 'redit': {
      const g = D.gifts.find(x => x.id === d.id); if (!g) break;
      const f = $('#retDlg form'); f.reset(); retId.value = g.id; retDate.value = g.returned_on || today();
      retWho.textContent = 'Editing the return for ' + d.name; retOrig.textContent = '';
      retType.value = g.ret_type || 'Cash'; f.elements.ret_value.value = g.ret_value || ''; f.elements.ret_gold.value = g.ret_gold || '';
      f.elements.ret_description.value = g.ret_description || ''; retGoldBox.style.display = g.ret_type === 'Gold' ? '' : 'none'; retDlg.showModal(); break;
    }
    case 'logout': e.preventDefault(); localStorage.removeItem('kk_key'); key = ''; location.hash = '#/'; location.reload(); break;
    case 'close': b.closest('dialog').close(); break;
    case 'padd': case 'pedit': {
      const u = d.act === 'pedit' ? D.people.find(x => x.id === d.id) : null;
      pTitle.textContent = u ? 'Edit person' : 'Add person';
      pid.value = u?.id || ''; pname2.value = u?.name || ''; pphone2.value = u?.phone || ''; paddr2.value = u?.address || '';
      pDlg.showModal(); break;
    }
    case 'pdel':
      if (D.gifts.some(x => x.user_id === d.id)) { alert("This person has gifts recorded, so they can't be deleted."); break; }
      if (confirm(`Delete ${d.name}?`)) change('deletePerson', { id: d.id }, 'Person deleted.'); break;
    case 'odel':
      if (D.gifts.some(x => x.occasion === d.name)) { alert("Can't delete '" + d.name + "': gifts use it."); break; }
      change('deleteOccasion', { name: d.name }, 'Deleted occasion: ' + d.name); break;
    case 'del': if (confirm(`Delete this gift from ${d.name}?`)) change('deleteGift', { id: d.id }, 'Gift deleted.'); break;
    case 'unret': if (confirm(`Undo the return record for ${d.name}?`)) change('unreturnGift', { id: d.id }, 'Return undone.'); break;
    case 'ret': {
      const v = +d.value, g = +d.gold, p = [];
      if (v) p.push(inr(v)); if (g) p.push(g + ' g gold');
      $('#retDlg form').reset(); retId.value = d.id; retDate.value = today();
      retWho.textContent = 'Returning the gift of ' + d.name; retOrig.textContent = p.length ? 'They gave: ' + p.join(' · ') : '';
      retGoldBox.style.display = 'none'; retDlg.showModal(); break;
    }
  }
});

// ---------------------------------------------------------------- start
async function start() {
  const app = $('#app');
  if (!window.CONFIG?.API_URL || window.CONFIG.API_URL.startsWith('PASTE')) {
    app.innerHTML = '<div class="empty">Open <b>config.js</b> and paste your Apps Script Web app URL (README step 3).</div>'; return;
  }
  if (!key) return loginScreen();
  try { D = await call('load'); queue.forEach(it => applyLocal(it.action, it.payload)); route(); pump(); }
  catch (e) {
    if (!key) return loginScreen('Wrong passcode. Please try again.');
    app.innerHTML = `<div class="empty">Could not load data: ${h(e.message)}<br><br><button onclick="location.reload()">Try again</button></div>`;
  }
}
function loginScreen(err) {
  $('#side').innerHTML = ''; $('#topnav').innerHTML = '';
  $('#app').innerHTML = `<section class="card" style="max-width:420px;margin:30px auto"><h2>Enter passcode</h2>
    <p class="sub">Type the secret key you set in Apps Script (<code>SECRET</code>). It is remembered on this device.</p>
    ${err ? `<div class="msg">${h(err)}</div>` : ''}
    <form class="grid" data-form="login" style="grid-template-columns:1fr">
      <label>Secret key<input name="key" type="password" autocomplete="current-password" required autofocus></label>
      <div class="row"><button type="submit">Open</button></div></form></section>`;
}
start();
