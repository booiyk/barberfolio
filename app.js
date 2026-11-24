/* Barberfolio — pencatatan barbershop per cabang, khusus owner.
   Tanpa build step, tanpa framework, tanpa CDN. Data di localStorage.
   Rumus mengikuti Bab 7 spek: subtotal = qty x unit_price;
   komisi per item = subtotal x commission_percent / 100;
   omzet kotor = jumlah subtotal; omzet bersih = kotor - diskon;
   profit = bersih - komisi - biaya; margin = profit / bersih x 100%;
   tiket rata-rata = bersih / transaksi completed.
   Tip BUKAN omzet dan BUKAN dasar komisi. Void/refunded dikeluarkan. */
'use strict';

var LS_KEY = 'barberfolio-v1';
var PAYMENT_METHODS = ['cash', 'qris', 'transfer', 'card', 'ewallet'];
var PAYMENT_LABELS = { cash: 'Tunai', qris: 'QRIS', transfer: 'Transfer', card: 'Kartu', ewallet: 'E-wallet' };
var EXPENSE_CATEGORIES = ['rent', 'salary', 'utilities', 'supplies', 'marketing', 'maintenance', 'other'];
var EXPENSE_LABELS = { rent: 'Sewa', salary: 'Gaji pokok', utilities: 'Listrik/air', supplies: 'Stok/bahan', marketing: 'Marketing', maintenance: 'Perawatan', other: 'Lainnya' };
var CLOSING_LABELS = { draft: 'Draf', submitted: 'Terkirim', locked: 'Terkunci' };

/* ---------- util ---------- */
function uid() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}
function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function addDays(dateStr, n) {
  var d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function dateOf(transactedAt) { return String(transactedAt).slice(0, 10); }
function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function fmtIDR(n) { return 'Rp' + Math.round(num(n)).toLocaleString('id-ID'); }
function fmtPct(n) { return (Math.round(num(n) * 10) / 10).toLocaleString('id-ID') + '%'; }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/* ---------- data ---------- */
function emptyData() {
  return { branches: [], services: [], barbers: [], customers: [], transactions: [], expenses: [], closings: [] };
}
function loadData() {
  try {
    var raw = localStorage.getItem(LS_KEY);
    if (!raw) return emptyData();
    var d = JSON.parse(raw);
    var base = emptyData();
    Object.keys(base).forEach(function (k) { if (Array.isArray(d[k])) base[k] = d[k]; });
    return base;
  } catch (e) { return emptyData(); }
}
function saveData(db) { localStorage.setItem(LS_KEY, JSON.stringify(db)); }

/* ---------- rumus (Bab 7 spek) ---------- */
function itemSubtotal(item) { return num(item.qty) * num(item.unit_price); }
function itemCommission(item) { return Math.round(itemSubtotal(item) * num(item.commission_percent) / 100); }
function isCompleted(tx) { return tx.status === 'completed'; }
function txGross(tx) { return (tx.items || []).reduce(function (s, it) { return s + itemSubtotal(it); }, 0); }
function txNet(tx) { return txGross(tx) - num(tx.discount_amount); }
function txCommission(tx) { return (tx.items || []).reduce(function (s, it) { return s + itemCommission(it); }, 0); }
/* Tunai bersih yang seharusnya ada di laci dari satu transaksi tunai. */
function txCashNet(tx) { return tx.payment_method === 'cash' ? txNet(tx) : 0; }

function closingFor(db, branchId, dateStr) {
  var txs = db.transactions.filter(function (t) {
    return t.branch_id === branchId && dateOf(t.transacted_at) === dateStr && isCompleted(t);
  });
  var exps = db.expenses.filter(function (e) { return e.branch_id === branchId && e.expense_date === dateStr; });
  var gross = txs.reduce(function (s, t) { return s + txGross(t); }, 0);
  var discount = txs.reduce(function (s, t) { return s + num(t.discount_amount); }, 0);
  var net = gross - discount;
  var commission = txs.reduce(function (s, t) { return s + txCommission(t); }, 0);
  var expenses = exps.reduce(function (s, e) { return s + num(e.amount); }, 0);
  var tip = txs.reduce(function (s, t) { return s + num(t.tip_amount); }, 0);
  var cashExpected = txs.reduce(function (s, t) { return s + txCashNet(t); }, 0);
  var profit = net - commission - expenses;
  return {
    total_transactions: txs.length, total_customers: txs.length,
    gross_revenue: gross, discount_total: discount, net_revenue: net,
    commission_total: commission, expense_total: expenses, tip_total: tip,
    cash_expected: cashExpected, profit: profit,
    margin: net > 0 ? profit / net * 100 : 0
  };
}

function summarize(db, branchId, startDate, endDate) {
  var txs = db.transactions.filter(function (t) {
    var d = dateOf(t.transacted_at);
    return isCompleted(t) && (!branchId || branchId === 'all' || t.branch_id === branchId)
      && (!startDate || d >= startDate) && (!endDate || d <= endDate);
  });
  var exps = db.expenses.filter(function (e) {
    return (!branchId || branchId === 'all' || e.branch_id === branchId)
      && (!startDate || e.expense_date >= startDate) && (!endDate || e.expense_date <= endDate);
  });
  var gross = txs.reduce(function (s, t) { return s + txGross(t); }, 0);
  var discount = txs.reduce(function (s, t) { return s + num(t.discount_amount); }, 0);
  var net = gross - discount;
  var commission = txs.reduce(function (s, t) { return s + txCommission(t); }, 0);
  var expenses = exps.reduce(function (s, e) { return s + num(e.amount); }, 0);
  var tip = txs.reduce(function (s, t) { return s + num(t.tip_amount); }, 0);
  var profit = net - commission - expenses;
  return {
    gross: gross, discount: discount, net: net, commission: commission,
    expenses: expenses, tip: tip, profit: profit,
    margin: net > 0 ? profit / net * 100 : 0,
    customers: txs.length, avgTicket: txs.length > 0 ? net / txs.length : 0,
    transactions: txs
  };
}

function isLocked(db, branchId, dateStr) {
  return db.closings.some(function (c) {
    return c.branch_id === branchId && c.closing_date === dateStr && c.status === 'locked';
  });
}
function findClosing(db, branchId, dateStr) {
  return db.closings.find(function (c) { return c.branch_id === branchId && c.closing_date === dateStr; }) || null;
}

/* ---------- data contoh Bab 11 spek ---------- */
function demoData() {
  var date = todayStr();
  var branchId = uid(), svcPotong = uid(), svcCukur = uid(), svcColor = uid(), svcPomade = uid();
  var barberA = uid(), barberB = uid();
  function item(serviceId, barberId, qty, price, pct) {
    return { id: uid(), service_id: serviceId, barber_id: barberId, qty: qty, unit_price: price, commission_percent: pct, commission_amount: Math.round(qty * price * pct / 100) };
  }
  function tx(method, barberId, discount, tip, items) {
    return {
      id: uid(), branch_id: branchId, customer_id: null, served_by_barber_id: barberId,
      transacted_at: date + 'T10:00:00', discount_amount: discount, tip_amount: tip,
      payment_method: method, payment_ref: '', source: 'manual', status: 'completed',
      created_by: 'owner', notes: 'Data contoh Bab 11 spek', items: items
    };
  }
  return {
    branches: [{ id: branchId, name: 'Cabang Contoh', code: 'CTH', address: '', city: 'Cirebon', phone: '', timezone: 'Asia/Jakarta', opened_at: date, rent_monthly: 0, is_active: true }],
    services: [
      { id: svcPotong, branch_id: branchId, name: 'Potong Rambut', category: 'service', price: 50000, duration_minutes: 30, commission_percent: 40, is_active: true },
      { id: svcCukur, branch_id: branchId, name: 'Cukur Jenggot', category: 'service', price: 30000, duration_minutes: 15, commission_percent: 40, is_active: true },
      { id: svcColor, branch_id: branchId, name: 'Coloring', category: 'service', price: 150000, duration_minutes: 90, commission_percent: 40, is_active: true },
      { id: svcPomade, branch_id: branchId, name: 'Pomade', category: 'product', price: 60000, duration_minutes: null, commission_percent: 10, is_active: true }
    ],
    barbers: [
      { id: barberA, branch_id: branchId, full_name: 'Kapster A', phone: '', commission_scheme: 'percent', commission_percent: 40, base_salary_monthly: 0, is_active: true },
      { id: barberB, branch_id: branchId, full_name: 'Kapster B', phone: '', commission_scheme: 'percent', commission_percent: 40, base_salary_monthly: 0, is_active: true }
    ],
    customers: [],
    transactions: [
      tx('cash', barberA, 0, 0, [item(svcPotong, barberA, 1, 50000, 40)]),
      tx('qris', barberA, 0, 0, [item(svcPotong, barberA, 1, 50000, 40), item(svcCukur, barberA, 1, 30000, 40)]),
      tx('cash', barberB, 10000, 15000, [item(svcColor, barberB, 1, 150000, 40), item(svcPomade, barberB, 1, 60000, 10)])
    ],
    expenses: [
      { id: uid(), branch_id: branchId, expense_date: date, category: 'other', description: 'Makan kru', amount: 45000, is_recurring: false, receipt_url: '', created_by: 'owner' },
      { id: uid(), branch_id: branchId, expense_date: date, category: 'supplies', description: 'Isi ulang sampo', amount: 75000, is_recurring: false, receipt_url: '', created_by: 'owner' }
    ],
    closings: []
  };
}

/* ---------- ekspor CSV ---------- */
function buildTransactionsCSV(db, branchId, startDate, endDate) {
  var s = summarize(db, branchId, startDate, endDate);
  var rows = [['tanggal', 'cabang', 'kapster', 'layanan', 'qty', 'harga_satuan', 'subtotal', 'komisi_item', 'diskon', 'tip', 'metode_bayar', 'status']];
  var branchName = function (id) { var b = db.branches.find(function (x) { return x.id === id; }); return b ? b.name : id; };
  var barberName = function (id) { var b = db.barbers.find(function (x) { return x.id === id; }); return b ? b.full_name : ''; };
  var serviceName = function (id) { var b = db.services.find(function (x) { return x.id === id; }); return b ? b.name : ''; };
  s.transactions.forEach(function (t) {
    (t.items || []).forEach(function (it) {
      rows.push([dateOf(t.transacted_at), branchName(t.branch_id), barberName(it.barber_id), serviceName(it.service_id), it.qty, it.unit_price, itemSubtotal(it), itemCommission(it), t.discount_amount, t.tip_amount, PAYMENT_LABELS[t.payment_method] || t.payment_method, t.status]);
    });
  });
  return rows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
}

/* Diekspos untuk pengujian di Node; di browser tidak berpengaruh. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { emptyData: emptyData, demoData: demoData, summarize: summarize, closingFor: closingFor, isLocked: isLocked, buildTransactionsCSV: buildTransactionsCSV, itemSubtotal: itemSubtotal, itemCommission: itemCommission, txGross: txGross, txNet: txNet, txCommission: txCommission };
}

/* ================= UI (browser) ================= */
if (typeof document !== 'undefined') {
var db = loadData();
var currentTab = 'dashboard';
var filters = { branch: 'all', start: addDays(todayStr(), -29), end: todayStr() };
var txDraft = []; /* item draf di form Input: {service_id, barber_id, qty, unit_price, commission_percent} */
var closingSel = { branch: '', date: todayStr() };

function $(id) { return document.getElementById(id); }
function toast(msg) {
  var t = $('toast');
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(function () { t.style.display = 'none'; }, 3500);
}
function branchById(id) { return db.branches.find(function (b) { return b.id === id; }); }
function serviceById(id) { return db.services.find(function (s) { return s.id === id; }); }
function barberById(id) { return db.barbers.find(function (b) { return b.id === id; }); }
function activeBranches() { return db.branches.filter(function (b) { return b.is_active; }); }
function persist() { saveData(db); }

function commissionPercentFor(service, barber) {
  if (service && service.commission_percent != null && service.commission_percent !== '') return num(service.commission_percent);
  if (barber && barber.commission_percent != null && barber.commission_percent !== '') return num(barber.commission_percent);
  return 0;
}

function refreshFilterOptions() {
  var sel = $('filterBranch');
  var cur = filters.branch;
  sel.innerHTML = '<option value="all">Semua cabang</option>' + activeBranches().map(function (b) {
    return '<option value="' + b.id + '">' + esc(b.name) + ' (' + esc(b.code) + ')</option>';
  }).join('');
  sel.value = activeBranches().some(function (b) { return b.id === cur; }) || cur === 'all' ? cur : 'all';
  filters.branch = sel.value;
  $('filterStart').value = filters.start;
  $('filterEnd').value = filters.end;
}

function switchTab(name) {
  currentTab = name;
  document.querySelectorAll('.tab').forEach(function (btn) {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
  document.querySelectorAll('.panel').forEach(function (p) { p.hidden = p.id !== 'tab-' + name; });
  $('globalFilters').style.display = (name === 'panduan') ? 'none' : 'flex';
  render();
}

function render() {
  refreshFilterOptions();
  if (currentTab === 'dashboard') renderDashboard();
  else if (currentTab === 'input') renderInput();
  else if (currentTab === 'biaya') renderBiaya();
  else if (currentTab === 'tutupkas') renderTutupKas();
  else if (currentTab === 'laporan') renderLaporan();
  else if (currentTab === 'master') renderMaster();
  else if (currentTab === 'panduan') renderPanduan();
}

/* ---------- Dashboard ---------- */
function renderDashboard() {
  var s = summarize(db, filters.branch, filters.start, filters.end);
  var el = $('tab-dashboard');
  var rows = activeBranches().map(function (b) {
    var bs = summarize(db, b.id, filters.start, filters.end);
    return { branch: b, s: bs };
  });
  var trend = {};
  s.transactions.forEach(function (t) {
    var d = dateOf(t.transacted_at);
    trend[d] = (trend[d] || 0) + txNet(t);
  });
  var days = [];
  for (var d = filters.start; d <= filters.end; d = addDays(d, 1)) days.push(d);
  var maxVal = Math.max.apply(null, days.map(function (d) { return trend[d] || 0; }).concat([1]));
  var chart = days.length > 60
    ? '<p class="muted">Rentang lebih dari 60 hari — perkecil rentang tanggal untuk melihat grafik harian.</p>'
    : '<div class="chart">' + days.map(function (d) {
        var v = trend[d] || 0;
        var h = v > 0 ? Math.max(4, Math.round(v / maxVal * 120)) : 0;
        return '<div class="bar-wrap" title="' + d + ': ' + fmtIDR(v) + '"><div class="bar" style="height:' + h + 'px"></div><div class="bar-label">' + d.slice(5) + '</div></div>';
      }).join('') + '</div>';
  el.innerHTML =
    '<h2>Dashboard owner</h2>' +
    '<p class="muted">Periode ' + esc(filters.start) + ' s.d. ' + esc(filters.end) + (filters.branch === 'all' ? ' — semua cabang' : ' — ' + esc((branchById(filters.branch) || {}).name || '')) + '.</p>' +
    '<div class="cards">' +
    '<div class="card"><div class="label">Omzet bersih</div><div class="value">' + fmtIDR(s.net) + '</div><div class="sub">Kotor ' + fmtIDR(s.gross) + ' − diskon ' + fmtIDR(s.discount) + '</div></div>' +
    '<div class="card"><div class="label">Profit operasional</div><div class="value">' + fmtIDR(s.profit) + '</div><div class="sub">Margin ' + fmtPct(s.margin) + '</div></div>' +
    '<div class="card"><div class="label">Pelanggan</div><div class="value">' + s.customers + '</div><div class="sub">Tiket rata-rata ' + fmtIDR(s.avgTicket) + '</div></div>' +
    '<div class="card"><div class="label">Komisi kapster</div><div class="value">' + fmtIDR(s.commission) + '</div><div class="sub">Biaya ' + fmtIDR(s.expenses) + ' · Tip ' + fmtIDR(s.tip) + ' (di luar omzet)</div></div>' +
    '</div>' +
    '<h3>Tren harian — omzet bersih</h3>' + chart +
    '<h3>Perbandingan antar cabang</h3>' +
    (rows.length === 0
      ? '<div class="notice"><strong>Belum ada cabang.</strong>Buka tab Master, tambah cabang pertama, lalu layanan dan kapsternya.</div>'
      : '<div style="overflow-x:auto"><table><thead><tr><th>Cabang</th><th class="num">Omzet bersih</th><th class="num">Pelanggan</th><th class="num">Tiket rata-rata</th><th class="num">Komisi</th><th class="num">Biaya</th><th class="num">Profit</th><th class="num">Margin</th></tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><td>' + esc(r.branch.name) + ' (' + esc(r.branch.code) + ')</td><td class="num">' + fmtIDR(r.s.net) + '</td><td class="num">' + r.s.customers + '</td><td class="num">' + fmtIDR(r.s.avgTicket) + '</td><td class="num">' + fmtIDR(r.s.commission) + '</td><td class="num">' + fmtIDR(r.s.expenses) + '</td><td class="num">' + fmtIDR(r.s.profit) + '</td><td class="num">' + fmtPct(r.s.margin) + '</td></tr>';
        }).join('') +
        '</tbody><tfoot><tr><td>Total gabungan</td><td class="num">' + fmtIDR(s.net) + '</td><td class="num">' + s.customers + '</td><td class="num">' + fmtIDR(s.avgTicket) + '</td><td class="num">' + fmtIDR(s.commission) + '</td><td class="num">' + fmtIDR(s.expenses) + '</td><td class="num">' + fmtIDR(s.profit) + '</td><td class="num">' + fmtPct(s.margin) + '</td></tr></tfoot></table></div>');
}

/* ---------- Input transaksi ---------- */
var txForm = { discount: 0, tip: 0, method: 'cash', when: '', notes: '' };
function draftTotals() {
  var gross = txDraft.reduce(function (s, it) { return s + itemSubtotal(it); }, 0);
  var commission = txDraft.reduce(function (s, it) { return s + itemCommission(it); }, 0);
  return { gross: gross, commission: commission, net: gross - num(txForm.discount) };
}
function renderInput() {
  var el = $('tab-input');
  var branches = activeBranches();
  if (branches.length === 0) {
    el.innerHTML = '<h2>Input transaksi</h2><div class="notice"><strong>Belum ada cabang.</strong>Tambah cabang dulu di tab Master.</div>';
    return;
  }
  /* Pertahankan isi form saat render ulang (mis. setelah tambah layanan). */
  if ($('txDiscount')) txForm.discount = num($('txDiscount').value);
  if ($('txTip')) txForm.tip = num($('txTip').value);
  if ($('txMethod')) txForm.method = $('txMethod').value;
  if ($('txWhen')) txForm.when = $('txWhen').value;
  if ($('txNotes')) txForm.notes = $('txNotes').value;
  if ($('txBranch')) txForm.branch = $('txBranch').value;
  var selBranch = txForm.branch || branches[0].id;
  if (!branchById(selBranch)) selBranch = branches[0].id;
  var services = db.services.filter(function (s) { return s.branch_id === selBranch && s.is_active; });
  var barbers = db.barbers.filter(function (b) { return b.branch_id === selBranch && b.is_active; });
  var t = draftTotals();
  var recent = db.transactions
    .filter(function (x) { return x.branch_id === selBranch; })
    .slice().sort(function (a, b) { return String(b.transacted_at).localeCompare(String(a.transacted_at)); })
    .slice(0, 10);
  el.innerHTML =
    '<h2>Input transaksi</h2>' +
    '<p class="muted">Satu transaksi = satu kunjungan. Harga dan persen komisi disalin (snapshot) saat disimpan, jadi perubahan harga nanti tidak mengubah laporan lama.</p>' +
    '<div class="form-grid">' +
    '<label>Cabang<select id="txBranch" onchange="onTxBranchChange()">' + branches.map(function (b) { return '<option value="' + b.id + '"' + (b.id === selBranch ? ' selected' : '') + '>' + esc(b.name) + '</option>'; }).join('') + '</select></label>' +
    '<label>Tanggal &amp; jam<input type="datetime-local" id="txWhen" value="' + esc(txForm.when || (todayStr() + 'T10:00')) + '"></label>' +
    '<label>Metode bayar<select id="txMethod">' + PAYMENT_METHODS.map(function (m) { return '<option value="' + m + '"' + (m === txForm.method ? ' selected' : '') + '>' + PAYMENT_LABELS[m] + '</option>'; }).join('') + '</select></label>' +
    '<label>Diskon (Rp)<input type="number" id="txDiscount" min="0" value="' + txForm.discount + '" oninput="renderInput()"></label>' +
    '<label>Tip (Rp) — bukan omzet<input type="number" id="txTip" min="0" value="' + txForm.tip + '"></label>' +
    '<label>Catatan<input type="text" id="txNotes" placeholder="opsional" value="' + esc(txForm.notes) + '"></label>' +
    '</div>' +
    '<h3>Layanan dalam transaksi ini</h3>' +
    (services.length === 0 || barbers.length === 0
      ? '<div class="notice"><strong>Belum ada layanan atau kapster di cabang ini.</strong>Tambah dulu di tab Master.</div>'
      : '<div class="form-grid">' +
        '<label>Layanan<select id="draftService">' + services.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + ' — ' + fmtIDR(s.price) + '</option>'; }).join('') + '</select></label>' +
        '<label>Kapster<select id="draftBarber">' + barbers.map(function (b) { return '<option value="' + b.id + '">' + esc(b.full_name) + '</option>'; }).join('') + '</select></label>' +
        '<label>Jumlah<input type="number" id="draftQty" min="1" value="1"></label>' +
        '</div>' +
        '<button type="button" onclick="addDraftItem()">+ Tambah layanan</button>') +
    (txDraft.length === 0 ? '<p class="muted">Belum ada layanan ditambahkan.</p>' :
      '<table><thead><tr><th>Layanan</th><th>Kapster</th><th class="num">Qty</th><th class="num">Harga</th><th class="num">Subtotal</th><th class="num">Komisi</th><th></th></tr></thead><tbody>' +
      txDraft.map(function (it, i) {
        return '<tr><td>' + esc((serviceById(it.service_id) || {}).name || '') + '</td><td>' + esc((barberById(it.barber_id) || {}).full_name || '') + '</td><td class="num">' + it.qty + '</td><td class="num">' + fmtIDR(it.unit_price) + '</td><td class="num">' + fmtIDR(itemSubtotal(it)) + '</td><td class="num">' + fmtIDR(itemCommission(it)) + ' (' + it.commission_percent + '%)</td><td><button type="button" onclick="removeDraftItem(' + i + ')">Hapus</button></td></tr>';
      }).join('') + '</tbody></table>') +
    '<div class="notice"><strong>Pratinjau:</strong> omzet kotor ' + fmtIDR(t.gross) + ' − diskon ' + fmtIDR(txForm.discount) + ' = omzet bersih ' + fmtIDR(t.net) + ' · komisi ' + fmtIDR(t.commission) + '</div>' +
    '<button type="button" class="primary" onclick="saveTransaction()">Simpan transaksi</button>' +
    '<h3>Transaksi terakhir di cabang ini</h3>' +
    (recent.length === 0 ? '<p class="muted">Belum ada transaksi.</p>' :
      '<table><thead><tr><th>Tanggal</th><th>Isi</th><th class="num">Bersih</th><th class="num">Komisi</th><th>Bayar</th><th>Status</th><th></th></tr></thead><tbody>' +
      recent.map(function (x) {
        var items = (x.items || []).map(function (it) { return esc((serviceById(it.service_id) || {}).name || '') + ' x' + it.qty; }).join(', ');
        return '<tr><td>' + esc(String(x.transacted_at).replace('T', ' ')) + '</td><td>' + items + (x.tip_amount ? '<br><span class="muted">Tip ' + fmtIDR(x.tip_amount) + '</span>' : '') + '</td><td class="num">' + fmtIDR(txNet(x)) + '</td><td class="num">' + fmtIDR(txCommission(x)) + '</td><td>' + (PAYMENT_LABELS[x.payment_method] || x.payment_method) + '</td><td>' + (x.status === 'completed' ? 'Selesai' : 'Void') + '</td><td>' + (x.status === 'completed' ? '<button type="button" onclick="voidTransaction(\'' + x.id + '\')">Void</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table>');
}
function onTxBranchChange() { txDraft = []; renderInput(); }
function addDraftItem() {
  var svc = serviceById($('draftService').value);
  var barber = barberById($('draftBarber').value);
  var qty = Math.max(1, num($('draftQty').value) || 1);
  if (!svc || !barber) return;
  var pct = commissionPercentFor(svc, barber);
  txDraft.push({ id: uid(), service_id: svc.id, barber_id: barber.id, qty: qty, unit_price: num(svc.price), commission_percent: pct, commission_amount: Math.round(qty * num(svc.price) * pct / 100) });
  renderInput();
}
function removeDraftItem(i) { txDraft.splice(i, 1); renderInput(); }
function saveTransaction() {
  if (txDraft.length === 0) { toast('Tambah minimal satu layanan dulu.'); return; }
  var branchId = $('txBranch').value;
  var when = $('txWhen').value || (todayStr() + 'T10:00');
  var dateStr = when.slice(0, 10);
  if (isLocked(db, branchId, dateStr)) { toast('Tanggal ' + dateStr + ' sudah terkunci di Tutup Kas — transaksi tidak bisa ditambah. Buka kunci dulu.'); return; }
  var items = txDraft.map(function (it) {
    return { id: uid(), service_id: it.service_id, barber_id: it.barber_id, qty: it.qty, unit_price: it.unit_price, commission_percent: it.commission_percent, commission_amount: itemCommission(it) };
  });
  db.transactions.push({
    id: uid(), branch_id: branchId, customer_id: null,
    served_by_barber_id: items[0].barber_id, transacted_at: when.replace('T', 'T'),
    discount_amount: num($('txDiscount').value), tip_amount: num($('txTip').value),
    payment_method: $('txMethod').value, payment_ref: '', source: 'manual',
    status: 'completed', created_by: 'owner', notes: $('txNotes').value || '', items: items
  });
  txDraft = [];
  txForm = { discount: 0, tip: 0, method: 'cash', when: '', notes: '', branch: branchId };
  persist();
  toast('Transaksi tersimpan.');
  renderInput();
}
function voidTransaction(id) {
  var tx = db.transactions.find(function (t) { return t.id === id; });
  if (!tx) return;
  if (isLocked(db, tx.branch_id, dateOf(tx.transacted_at))) { toast('Tanggal ini sudah terkunci — transaksi tidak bisa di-void. Buka kunci dulu di Tutup Kas.'); return; }
  if (!confirm('Void transaksi ini? Transaksi tetap tersimpan untuk jejak audit, tapi dikeluarkan dari semua perhitungan.')) return;
  tx.status = 'void';
  persist();
  toast('Transaksi di-void.');
  render();
}

/* ---------- Biaya ---------- */
function renderBiaya() {
  var el = $('tab-biaya');
  var branches = activeBranches();
  if (branches.length === 0) {
    el.innerHTML = '<h2>Biaya</h2><div class="notice"><strong>Belum ada cabang.</strong>Tambah cabang dulu di tab Master.</div>';
    return;
  }
  var list = db.expenses.slice().sort(function (a, b) { return String(b.expense_date).localeCompare(String(a.expense_date)); }).slice(0, 30);
  el.innerHTML =
    '<h2>Biaya</h2>' +
    '<p class="muted">Gaji pokok kapster dicatat di sini (kategori Gaji pokok). Komisi tidak dicatat di sini — komisi sudah terhitung otomatis dari transaksi, supaya tidak double.</p>' +
    '<div class="form-grid">' +
    '<label>Cabang<select id="exBranch">' + branches.map(function (b) { return '<option value="' + b.id + '">' + esc(b.name) + '</option>'; }).join('') + '</select></label>' +
    '<label>Tanggal<input type="date" id="exDate" value="' + todayStr() + '"></label>' +
    '<label>Kategori<select id="exCategory">' + EXPENSE_CATEGORIES.map(function (c) { return '<option value="' + c + '">' + EXPENSE_LABELS[c] + '</option>'; }).join('') + '</select></label>' +
    '<label>Jumlah (Rp)<input type="number" id="exAmount" min="0" value=""></label>' +
    '<label>Deskripsi<input type="text" id="exDesc" placeholder="cth. Listrik bulan ini"></label>' +
    '<label>Biaya tetap bulanan?<select id="exRecurring"><option value="0">Tidak</option><option value="1">Ya</option></select></label>' +
    '</div>' +
    '<button type="button" class="primary" onclick="saveExpense()">Simpan biaya</button>' +
    '<h3>Biaya terakhir</h3>' +
    (list.length === 0 ? '<p class="muted">Belum ada biaya.</p>' :
      '<table><thead><tr><th>Tanggal</th><th>Cabang</th><th>Kategori</th><th>Deskripsi</th><th class="num">Jumlah</th><th></th></tr></thead><tbody>' +
      list.map(function (e) {
        return '<tr><td>' + esc(e.expense_date) + '</td><td>' + esc((branchById(e.branch_id) || {}).name || '') + '</td><td>' + esc(EXPENSE_LABELS[e.category] || e.category) + (e.is_recurring ? ' (tetap)' : '') + '</td><td>' + esc(e.description) + '</td><td class="num">' + fmtIDR(e.amount) + '</td><td><button type="button" onclick="deleteExpense(\'' + e.id + '\')">Hapus</button></td></tr>';
      }).join('') + '</tbody></table>');
}
function saveExpense() {
  var branchId = $('exBranch').value;
  var dateStr = $('exDate').value || todayStr();
  if (isLocked(db, branchId, dateStr)) { toast('Tanggal ' + dateStr + ' sudah terkunci di Tutup Kas — biaya tidak bisa ditambah. Buka kunci dulu.'); return; }
  var amount = num($('exAmount').value);
  var desc = $('exDesc').value.trim();
  if (!desc || amount <= 0) { toast('Isi deskripsi dan jumlah biaya yang benar.'); return; }
  db.expenses.push({ id: uid(), branch_id: branchId, expense_date: dateStr, category: $('exCategory').value, description: desc, amount: amount, is_recurring: $('exRecurring').value === '1', receipt_url: '', created_by: 'owner' });
  persist();
  toast('Biaya tersimpan.');
  renderBiaya();
}
function deleteExpense(id) {
  var e = db.expenses.find(function (x) { return x.id === id; });
  if (!e) return;
  if (isLocked(db, e.branch_id, e.expense_date)) { toast('Tanggal ini sudah terkunci — biaya tidak bisa dihapus. Buka kunci dulu di Tutup Kas.'); return; }
  if (!confirm('Hapus biaya ini?')) return;
  db.expenses = db.expenses.filter(function (x) { return x.id !== id; });
  persist();
  toast('Biaya dihapus.');
  renderBiaya();
}

/* ---------- Tutup Kas ---------- */
function renderTutupKas() {
  var el = $('tab-tutupkas');
  var branches = activeBranches();
  if (branches.length === 0) {
    el.innerHTML = '<h2>Tutup Kas</h2><div class="notice"><strong>Belum ada cabang.</strong>Tambah cabang dulu di tab Master.</div>';
    return;
  }
  if (!branchById(closingSel.branch)) closingSel.branch = branches[0].id;
  var c = closingFor(db, closingSel.branch, closingSel.date);
  var saved = findClosing(db, closingSel.branch, closingSel.date);
  var status = saved ? saved.status : 'draft';
  var cashActual = saved && saved.cash_actual != null ? saved.cash_actual : '';
  var diff = cashActual === '' ? null : num(cashActual) - c.cash_expected;
  var closings = db.closings.slice().sort(function (a, b) { return String(b.closing_date).localeCompare(String(a.closing_date)); }).slice(0, 15);
  el.innerHTML =
    '<h2>Tutup Kas</h2>' +
    '<p class="muted">Rekap dihitung otomatis dari transaksi dan biaya hari itu. Hitung uang tunai di laci, isi ke kolom tunai fisik — selisih tampil apa adanya, jangan ditutup dengan mengubah transaksi.</p>' +
    '<div class="form-grid">' +
    '<label>Cabang<select id="ckBranch" onchange="onClosingSelChange()">' + branches.map(function (b) { return '<option value="' + b.id + '"' + (b.id === closingSel.branch ? ' selected' : '') + '>' + esc(b.name) + '</option>'; }).join('') + '</select></label>' +
    '<label>Tanggal<input type="date" id="ckDate" value="' + closingSel.date + '" onchange="onClosingSelChange()"></label>' +
    '</div>' +
    '<p>Status rekap: <span class="badge' + (status === 'locked' ? ' locked' : '') + '">' + CLOSING_LABELS[status] + '</span>' + (status === 'locked' ? ' — hari ini beku, transaksi/biaya tanggal ini tidak bisa diubah.' : '') + '</p>' +
    '<table><tbody>' +
    '<tr><td>Transaksi selesai</td><td class="num">' + c.total_transactions + '</td></tr>' +
    '<tr><td>Omzet kotor</td><td class="num">' + fmtIDR(c.gross_revenue) + '</td></tr>' +
    '<tr><td>Diskon</td><td class="num">− ' + fmtIDR(c.discount_total) + '</td></tr>' +
    '<tr><td>Omzet bersih</td><td class="num"><strong>' + fmtIDR(c.net_revenue) + '</strong></td></tr>' +
    '<tr><td>Komisi kapster</td><td class="num">− ' + fmtIDR(c.commission_total) + '</td></tr>' +
    '<tr><td>Biaya hari itu</td><td class="num">− ' + fmtIDR(c.expense_total) + '</td></tr>' +
    '<tr><td>Profit operasional</td><td class="num"><strong>' + fmtIDR(c.profit) + '</strong> (' + fmtPct(c.margin) + ')</td></tr>' +
    '<tr><td>Tip (di luar omzet)</td><td class="num">' + fmtIDR(c.tip_total) + '</td></tr>' +
    '<tr><td>Tunai yang seharusnya ada (cash expected)</td><td class="num">' + fmtIDR(c.cash_expected) + '</td></tr>' +
    '</tbody></table>' +
    '<div class="form-grid"><label>Tunai fisik hasil hitung (Rp)<input type="number" id="ckCashActual" min="0" value="' + cashActual + '" ' + (status === 'locked' ? 'disabled' : '') + '></label></div>' +
    (diff === null ? '' : '<p>Selisih tunai: <strong>' + fmtIDR(diff) + '</strong>' + (diff === 0 ? ' — pas.' : diff > 0 ? ' — lebih.' : ' — kurang.') + '</p>') +
    '<div class="inline-row">' +
    '<button type="button" onclick="saveClosing(\'draft\')" ' + (status === 'locked' ? 'disabled' : '') + '>Simpan draf</button>' +
    '<button type="button" onclick="saveClosing(\'submitted\')" ' + (status === 'locked' ? 'disabled' : '') + '>Kirim (Terkirim)</button>' +
    '<button type="button" class="primary" onclick="saveClosing(\'locked\')" ' + (status === 'locked' ? 'disabled' : '') + '>Kunci rekap</button>' +
    (status === 'locked' ? '<button type="button" onclick="unlockClosing()">Buka kunci (kembali Terkirim)</button>' : '') +
    '</div>' +
    '<h3>Rekap tersimpan</h3>' +
    (closings.length === 0 ? '<p class="muted">Belum ada rekap tersimpan.</p>' :
      '<table><thead><tr><th>Tanggal</th><th>Cabang</th><th class="num">Omzet bersih</th><th class="num">Profit</th><th class="num">Tunai seharusnya</th><th class="num">Tunai fisik</th><th>Status</th></tr></thead><tbody>' +
      closings.map(function (x) {
        return '<tr><td>' + esc(x.closing_date) + '</td><td>' + esc((branchById(x.branch_id) || {}).name || '') + '</td><td class="num">' + fmtIDR(x.net_revenue) + '</td><td class="num">' + fmtIDR(x.net_revenue - x.commission_total - x.expense_total) + '</td><td class="num">' + fmtIDR(x.cash_expected) + '</td><td class="num">' + (x.cash_actual != null ? fmtIDR(x.cash_actual) : '—') + '</td><td><span class="badge' + (x.status === 'locked' ? ' locked' : '') + '">' + CLOSING_LABELS[x.status] + '</span></td></tr>';
      }).join('') + '</tbody></table>');
}
function onClosingSelChange() {
  closingSel.branch = $('ckBranch').value;
  closingSel.date = $('ckDate').value || todayStr();
  renderTutupKas();
}
function saveClosing(status) {
  var c = closingFor(db, closingSel.branch, closingSel.date);
  var cashActual = $('ckCashActual').value === '' ? null : num($('ckCashActual').value);
  var existing = findClosing(db, closingSel.branch, closingSel.date);
  var snap = {
    total_transactions: c.total_transactions, total_customers: c.total_customers,
    gross_revenue: c.gross_revenue, discount_total: c.discount_total, net_revenue: c.net_revenue,
    commission_total: c.commission_total, expense_total: c.expense_total, tip_total: c.tip_total,
    cash_expected: c.cash_expected, cash_actual: cashActual
  };
  if (existing) { Object.assign(existing, snap, { status: status }); }
  else {
    db.closings.push(Object.assign({ id: uid(), branch_id: closingSel.branch, closing_date: closingSel.date, status: status }, snap));
  }
  persist();
  toast(status === 'locked' ? 'Rekap terkunci. Hari ini beku.' : status === 'submitted' ? 'Rekap terkirim.' : 'Draf tersimpan.');
  renderTutupKas();
}
function unlockClosing() {
  var existing = findClosing(db, closingSel.branch, closingSel.date);
  if (!existing) return;
  existing.status = 'submitted';
  persist();
  toast('Kunci dibuka — rekap kembali Terkirim.');
  renderTutupKas();
}

/* ---------- Laporan ---------- */
function renderLaporan() {
  var el = $('tab-laporan');
  var s = summarize(db, filters.branch, filters.start, filters.end);
  var txs = s.transactions;
  var byBarber = {};
  txs.forEach(function (t) {
    (t.items || []).forEach(function (it) {
      var b = byBarber[it.barber_id] || (byBarber[it.barber_id] = { revenue: 0, commission: 0, items: 0 });
      b.revenue += itemSubtotal(it); b.commission += itemCommission(it); b.items += num(it.qty);
    });
  });
  var byService = {};
  txs.forEach(function (t) {
    (t.items || []).forEach(function (it) {
      var v = byService[it.service_id] || (byService[it.service_id] = { qty: 0, revenue: 0 });
      v.qty += num(it.qty); v.revenue += itemSubtotal(it);
    });
  });
  var byMethod = {};
  txs.forEach(function (t) { var m = byMethod[t.payment_method] || (byMethod[t.payment_method] = { n: 0, net: 0 }); m.n += 1; m.net += txNet(t); });
  var exps = db.expenses.filter(function (e) {
    return (!filters.branch || filters.branch === 'all' || e.branch_id === filters.branch)
      && (!filters.start || e.expense_date >= filters.start) && (!filters.end || e.expense_date <= filters.end);
  });
  var byCategory = {};
  exps.forEach(function (e) { byCategory[e.category] = (byCategory[e.category] || 0) + num(e.amount); });
  function tableOrEmpty(rows, head, emptyMsg) {
    if (rows.length === 0) return '<p class="muted">' + emptyMsg + '</p>';
    return '<table><thead><tr>' + head.map(function (h) { return '<th' + (h.num ? ' class="num"' : '') + '>' + h.t + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table>';
  }
  el.innerHTML =
    '<h2>Laporan</h2>' +
    '<p class="muted">Periode ' + esc(filters.start) + ' s.d. ' + esc(filters.end) + (filters.branch === 'all' ? ' — semua cabang.' : ' — ' + esc((branchById(filters.branch) || {}).name || '') + '.') + ' Ubah filter di atas untuk periode/cabang lain.</p>' +
    '<h3>Per kapster</h3>' +
    tableOrEmpty(Object.keys(byBarber).map(function (id) {
      var b = byBarber[id];
      return '<tr><td>' + esc((barberById(id) || {}).full_name || '—') + '</td><td class="num">' + b.items + '</td><td class="num">' + fmtIDR(b.revenue) + '</td><td class="num">' + fmtIDR(b.commission) + '</td></tr>';
    }), [{ t: 'Kapster' }, { t: 'Item dikerjakan', num: true }, { t: 'Pendapatan dihasilkan', num: true }, { t: 'Komisi', num: true }], 'Belum ada transaksi pada periode ini.') +
    '<h3>Per layanan / produk</h3>' +
    tableOrEmpty(Object.keys(byService).map(function (id) {
      var v = byService[id];
      return '<tr><td>' + esc((serviceById(id) || {}).name || '—') + '</td><td class="num">' + v.qty + '</td><td class="num">' + fmtIDR(v.revenue) + '</td></tr>';
    }), [{ t: 'Layanan / produk' }, { t: 'Terjual', num: true }, { t: 'Omzet', num: true }], 'Belum ada transaksi pada periode ini.') +
    '<h3>Per metode bayar</h3>' +
    tableOrEmpty(Object.keys(byMethod).map(function (m) {
      var v = byMethod[m];
      return '<tr><td>' + esc(PAYMENT_LABELS[m] || m) + '</td><td class="num">' + v.n + '</td><td class="num">' + fmtIDR(v.net) + '</td></tr>';
    }), [{ t: 'Metode' }, { t: 'Transaksi', num: true }, { t: 'Omzet bersih', num: true }], 'Belum ada transaksi pada periode ini.') +
    '<h3>Per kategori biaya</h3>' +
    tableOrEmpty(Object.keys(byCategory).map(function (c) {
      return '<tr><td>' + esc(EXPENSE_LABELS[c] || c) + '</td><td class="num">' + fmtIDR(byCategory[c]) + '</td></tr>';
    }), [{ t: 'Kategori' }, { t: 'Jumlah', num: true }], 'Belum ada biaya pada periode ini.');
}

/* ---------- Master ---------- */
function renderMaster() {
  var el = $('tab-master');
  el.innerHTML =
    '<h2>Master data</h2>' +
    '<p class="muted">Nonaktifkan (bukan hapus) cabang, layanan, atau kapster yang berhenti — riwayat transaksi tetap utuh.</p>' +
    '<h3>Cabang</h3>' +
    '<div class="form-grid">' +
    '<label>Nama cabang<input type="text" id="mBranchName" placeholder="cth. Cabang Pusat"></label>' +
    '<label>Kode unik<input type="text" id="mBranchCode" placeholder="cth. PST"></label>' +
    '<label>Kota<input type="text" id="mBranchCity"></label>' +
    '<label>Telepon<input type="text" id="mBranchPhone"></label>' +
    '<label>Sewa bulanan (Rp)<input type="number" id="mBranchRent" min="0" value="0"></label>' +
    '</div><button type="button" class="primary" onclick="addBranch()">+ Tambah cabang</button>' +
    (db.branches.length === 0 ? '<p class="muted">Belum ada cabang.</p>' :
      '<table><thead><tr><th>Nama</th><th>Kode</th><th>Kota</th><th class="num">Sewa/bulan</th><th>Status</th><th></th></tr></thead><tbody>' +
      db.branches.map(function (b) {
        return '<tr><td>' + esc(b.name) + '</td><td>' + esc(b.code) + '</td><td>' + esc(b.city || '') + '</td><td class="num">' + fmtIDR(b.rent_monthly || 0) + '</td><td>' + (b.is_active ? 'Aktif' : 'Nonaktif') + '</td><td><button type="button" onclick="toggleBranch(\'' + b.id + '\')">' + (b.is_active ? 'Nonaktifkan' : 'Aktifkan') + '</button></td></tr>';
      }).join('') + '</tbody></table>') +
    '<h3>Layanan &amp; harga per cabang</h3>' +
    '<div class="form-grid">' +
    '<label>Cabang<select id="mSvcBranch">' + activeBranches().map(function (b) { return '<option value="' + b.id + '">' + esc(b.name) + '</option>'; }).join('') + '</select></label>' +
    '<label>Nama layanan<input type="text" id="mSvcName" placeholder="cth. Potong Rambut"></label>' +
    '<label>Kategori<select id="mSvcCat"><option value="service">Jasa</option><option value="product">Produk retail</option></select></label>' +
    '<label>Harga (Rp)<input type="number" id="mSvcPrice" min="0"></label>' +
    '<label>Komisi layanan (%)<input type="number" id="mSvcPct" min="0" max="100" step="0.01" placeholder="kosong = ikut kapster"></label>' +
    '</div><button type="button" class="primary" onclick="addService()">+ Tambah layanan</button>' +
    (db.services.length === 0 ? '<p class="muted">Belum ada layanan.</p>' :
      '<table><thead><tr><th>Layanan</th><th>Cabang</th><th>Kategori</th><th class="num">Harga</th><th class="num">Komisi</th><th>Status</th><th></th></tr></thead><tbody>' +
      db.services.map(function (s) {
        return '<tr><td>' + esc(s.name) + '</td><td>' + esc((branchById(s.branch_id) || {}).name || '') + '</td><td>' + (s.category === 'product' ? 'Produk' : 'Jasa') + '</td><td class="num">' + fmtIDR(s.price) + '</td><td class="num">' + (s.commission_percent != null && s.commission_percent !== '' ? s.commission_percent + '%' : 'ikut kapster') + '</td><td>' + (s.is_active ? 'Aktif' : 'Nonaktif') + '</td><td><button type="button" onclick="toggleService(\'' + s.id + '\')">' + (s.is_active ? 'Nonaktifkan' : 'Aktifkan') + '</button></td></tr>';
      }).join('') + '</tbody></table>') +
    '<h3>Kapster</h3>' +
    '<div class="form-grid">' +
    '<label>Cabang<select id="mBarBranch">' + activeBranches().map(function (b) { return '<option value="' + b.id + '">' + esc(b.name) + '</option>'; }).join('') + '</select></label>' +
    '<label>Nama kapster<input type="text" id="mBarName" placeholder="cth. Kapster A"></label>' +
    '<label>Telepon<input type="text" id="mBarPhone"></label>' +
    '<label>Komisi default kapster (%)<input type="number" id="mBarPct" min="0" max="100" step="0.01" value="40"></label>' +
    '<label>Gaji pokok/bulan (Rp)<input type="number" id="mBarSalary" min="0" value="0"></label>' +
    '</div><button type="button" class="primary" onclick="addBarber()">+ Tambah kapster</button>' +
    (db.barbers.length === 0 ? '<p class="muted">Belum ada kapster.</p>' :
      '<table><thead><tr><th>Kapster</th><th>Cabang</th><th class="num">Komisi</th><th class="num">Gaji pokok</th><th>Status</th><th></th></tr></thead><tbody>' +
      db.barbers.map(function (b) {
        return '<tr><td>' + esc(b.full_name) + '</td><td>' + esc((branchById(b.branch_id) || {}).name || '') + '</td><td class="num">' + (b.commission_percent != null ? b.commission_percent + '%' : '—') + '</td><td class="num">' + fmtIDR(b.base_salary_monthly || 0) + '</td><td>' + (b.is_active ? 'Aktif' : 'Nonaktif') + '</td><td><button type="button" onclick="toggleBarber(\'' + b.id + '\')">' + (b.is_active ? 'Nonaktifkan' : 'Aktifkan') + '</button></td></tr>';
      }).join('') + '</tbody></table>');
}
function addBranch() {
  var name = $('mBranchName').value.trim();
  var code = $('mBranchCode').value.trim().toUpperCase();
  if (!name || !code) { toast('Isi nama dan kode cabang.'); return; }
  if (db.branches.some(function (b) { return b.code.toUpperCase() === code; })) { toast('Kode cabang sudah dipakai.'); return; }
  db.branches.push({ id: uid(), name: name, code: code, address: '', city: $('mBranchCity').value.trim(), phone: $('mBranchPhone').value.trim(), timezone: 'Asia/Jakarta', opened_at: todayStr(), rent_monthly: num($('mBranchRent').value), is_active: true });
  persist(); toast('Cabang ditambah.'); renderMaster();
}
function toggleBranch(id) { var b = branchById(id); if (b) { b.is_active = !b.is_active; persist(); renderMaster(); } }
function addService() {
  var branchId = $('mSvcBranch').value;
  var name = $('mSvcName').value.trim();
  var price = num($('mSvcPrice').value);
  if (!branchId || !name || price < 0) { toast('Pilih cabang, isi nama layanan dan harga.'); return; }
  var pct = $('mSvcPct').value === '' ? null : num($('mSvcPct').value);
  db.services.push({ id: uid(), branch_id: branchId, name: name, category: $('mSvcCat').value, price: price, duration_minutes: null, commission_percent: pct, is_active: true });
  persist(); toast('Layanan ditambah.'); renderMaster();
}
function toggleService(id) { var s = serviceById(id); if (s) { s.is_active = !s.is_active; persist(); renderMaster(); } }
function addBarber() {
  var branchId = $('mBarBranch').value;
  var name = $('mBarName').value.trim();
  if (!branchId || !name) { toast('Pilih cabang dan isi nama kapster.'); return; }
  db.barbers.push({ id: uid(), branch_id: branchId, full_name: name, phone: $('mBarPhone').value.trim(), commission_scheme: 'percent', commission_percent: num($('mBarPct').value), base_salary_monthly: num($('mBarSalary').value), is_active: true });
  persist(); toast('Kapster ditambah.'); renderMaster();
}
function toggleBarber(id) { var b = barberById(id); if (b) { b.is_active = !b.is_active; persist(); renderMaster(); } }

/* ---------- Panduan ---------- */
function renderPanduan() {
  $('tab-panduan').innerHTML =
    '<div class="guide"><h2>Panduan — cara pakai Barberfolio</h2>' +
    '<p>Aplikasi ini khusus owner. Urutan pakainya selalu sama: siapkan master data dulu, lalu catat transaksi dan biaya setiap hari, lalu tutup kas.</p>' +
    '<h3>1. Penyiapan awal (sekali saja)</h3><ol>' +
    '<li>Buka tab <strong>Master</strong>, tambah <strong>cabang</strong> (nama + kode unik, contoh: Cabang Pusat / PST).</li>' +
    '<li>Di cabang itu, tambah <strong>layanan</strong> beserta harganya. Harga per cabang, karena harga tiap cabang bisa beda. Isi persen komisi layanan kalau komisi beda per layanan; kalau kosong, komisi ikut persen kapster.</li>' +
    '<li>Tambah <strong>kapster</strong> di cabang itu beserta persen komisi default-nya (contoh: 40% untuk jasa, 10% untuk produk retail).</li>' +
    '</ol>' +
    '<h3>2. Rutinitas harian</h3><ol>' +
    '<li><strong>Input</strong> — setiap pelanggan selesai dan membayar, catat transaksinya: pilih cabang, tambah layanannya (boleh lebih dari satu: potong + cukur + pomade), isi diskon dan tip kalau ada, pilih metode bayar, lalu simpan. Harga dan persen komisi disalin saat itu juga, jadi harga lama tidak berubah walau harga layanan naik.</li>' +
    '<li><strong>Biaya</strong> — catat setiap pengeluaran hari itu: sewa, gaji pokok, listrik/air, stok/bahan, marketing, perawatan, atau lainnya.</li>' +
    '<li><strong>Tutup Kas</strong> — di akhir hari, pilih cabang dan tanggal. Sistem menghitung rekap otomatis. Hitung uang tunai di laci, isi ke kolom tunai fisik, lihat selisihnya. Lalu <strong>Simpan draf</strong> → <strong>Kirim</strong> → <strong>Kunci rekap</strong>. Setelah terkunci, transaksi dan biaya tanggal itu tidak bisa diubah lagi. Kalau ada koreksi, buka kunci dulu (status kembali Terkirim).</li>' +
    '</ol>' +
    '<h3>3. Membaca Dashboard &amp; Laporan</h3><ul>' +
    '<li><strong>Dashboard</strong> — kartu omzet bersih, profit, pelanggan, dan komisi untuk periode yang dipilih; tabel perbandingan antar cabang dengan baris total gabungan; grafik tren harian.</li>' +
    '<li><strong>Laporan</strong> — kapster paling produktif dan komisinya, layanan terlaris, porsi tiap metode bayar, dan biaya per kategori. Semua bisa difilter per cabang dan rentang tanggal di bilah filter atas.</li>' +
    '<li>Transaksi yang di-<strong>void</strong> tetap tersimpan untuk jejak audit, tapi dikeluarkan dari semua perhitungan.</li>' +
    '</ul>' +
    '<h3>4. Ekspor CSV</h3><p>Tombol <strong>Ekspor CSV transaksi</strong> di bilah filter mengunduh transaksi pada periode dan cabang yang sedang dipilih — bisa dibuka di spreadsheet.</p>' +
    '<h3>5. Rumus yang dipakai (Bab 7 spek)</h3>' +
    '<table><thead><tr><th>Ukuran</th><th>Rumus</th></tr></thead><tbody>' +
    '<tr><td>Subtotal item</td><td>qty × harga satuan (snapshot)</td></tr>' +
    '<tr><td>Komisi per item</td><td>subtotal × persen komisi / 100</td></tr>' +
    '<tr><td>Omzet kotor</td><td>jumlah subtotal semua item</td></tr>' +
    '<tr><td>Omzet bersih</td><td>omzet kotor − diskon</td></tr>' +
    '<tr><td>Profit operasional</td><td>omzet bersih − komisi − biaya</td></tr>' +
    '<tr><td>Margin profit</td><td>profit / omzet bersih × 100%</td></tr>' +
    '<tr><td>Tiket rata-rata</td><td>omzet bersih / jumlah transaksi selesai</td></tr>' +
    '<tr><td>Tunai yang seharusnya</td><td>jumlah omzet bersih transaksi tunai</td></tr>' +
    '</tbody></table>' +
    '<p><strong>Tip bukan omzet</strong> dan bukan dasar komisi — tip dilaporkan terpisah. Komisi dihitung dari subtotal sebelum diskon tingkat transaksi.</p>' +
    '<h3>6. Data contoh &amp; hapus data</h3>' +
    '<p>Data mulai kosong. Untuk memeriksa rumus, muat data contoh Bab 11 spek (1 cabang, Kapster A/B, 3 transaksi, 2 biaya) — hasilnya harus: omzet bersih Rp330.000, komisi Rp118.000, profit Rp92.000, margin 27,9%.</p>' +
    '<div class="inline-row"><button type="button" onclick="loadDemoData()">Muat data contoh</button>' +
    '<button type="button" class="danger" onclick="wipeData()">Hapus semua data</button></div>' +
    '<p class="muted">Data tersimpan lokal di browser ini (localStorage). Hapus data browser atau tombol di atas akan menghilangkan semua catatan — ekspor CSV dulu kalau perlu arsip.</p></div>';
}
function loadDemoData() {
  if (db.transactions.length > 0 || db.branches.length > 0) {
    if (!confirm('Data yang ada sekarang akan diganti dengan data contoh Bab 11. Lanjutkan?')) return;
  }
  db = demoData();
  persist();
  filters.branch = 'all';
  filters.start = addDays(todayStr(), -29);
  filters.end = todayStr();
  toast('Data contoh dimuat. Cek Dashboard: omzet bersih harus Rp330.000, profit Rp92.000.');
  switchTab('dashboard');
}
function wipeData() {
  if (!confirm('Hapus SEMUA data Barberfolio di browser ini? Tindakan ini tidak bisa dibatalkan.')) return;
  db = emptyData();
  txDraft = [];
  persist();
  toast('Semua data dihapus.');
  render();
}

/* ---------- ekspor, tema, init ---------- */
function exportCSV() {
  var csv = buildTransactionsCSV(db, filters.branch, filters.start, filters.end);
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'barberfolio-transaksi-' + filters.start + '-sd-' + filters.end + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast('CSV diunduh.');
}

function initTheme() {
  var saved = null;
  try { saved = localStorage.getItem('barberfolio-theme'); } catch (e) {}
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  updateThemeBtn();
}
function updateThemeBtn() {
  $('themeToggle').textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? 'Mode terang' : 'Mode gelap';
}

document.querySelectorAll('.tab').forEach(function (btn) {
  btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
});
$('filterBranch').addEventListener('change', function () { filters.branch = this.value; render(); });
$('filterStart').addEventListener('change', function () { filters.start = this.value; render(); });
$('filterEnd').addEventListener('change', function () { filters.end = this.value; render(); });
$('exportCsvBtn').addEventListener('click', exportCSV);
$('themeToggle').addEventListener('click', function () {
  var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('barberfolio-theme', next); } catch (e) {}
  updateThemeBtn();
});
initTheme();
switchTab('dashboard');
}
