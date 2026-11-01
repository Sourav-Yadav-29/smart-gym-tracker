// IronPulse Admin — theme, nav, modals, notifications, charts.
function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('ip-theme', next);
  renderCharts();
}
function toggleNav(open) {
  document.getElementById('sidebar').classList.toggle('open', open);
  document.getElementById('navBackdrop').classList.toggle('open', open);
}

// Modals: openModal('m-payment', {member_id: 3}) pre-fills matching named fields.
function openModal(id, values) {
  const dlg = document.getElementById(id);
  if (!dlg) return;
  const form = dlg.querySelector('form');
  if (id === 'm-plan' && !values) form.reset();
  Object.entries(values || {}).forEach(([k, v]) => {
    const el = form.elements[k];
    if (el) { el.value = v; el.dispatchEvent(new Event('change')); }
  });
  dlg.showModal();
}
function closeModal(btn) { btn.closest('dialog').close(); }
document.querySelectorAll('dialog.modal').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

function confirmDelete(action, fields, title, desc) {
  const dlg = document.getElementById('m-confirm');
  const form = dlg.querySelector('form');
  form.elements.action.value = action;
  ['member_id', 'trainer_id', 'booking_id'].forEach(k => { form.elements[k].value = fields[k] || ''; });
  dlg.querySelector('[data-title]').textContent = title;
  dlg.querySelector('[data-desc]').textContent = desc || '';
  dlg.showModal();
}
function prefillAmount(sel) {
  const price = sel.selectedOptions[0] && sel.selectedOptions[0].dataset.price;
  if (price && Number(price) > 0) sel.form.elements.amount.value = price;
}

// Notifications
function toggleNotif(e) {
  e.stopPropagation();
  const p = document.getElementById('notifPanel');
  p.classList.toggle('open');
  if (p.classList.contains('open')) notifAction('read', true);
}
document.addEventListener('click', () => { const p = document.getElementById('notifPanel'); if (p) p.classList.remove('open'); });
function notifAction(op, silent) {
  fetch('admin_dashboard.php?notif=' + op).then(() => {
    const c = document.getElementById('notifCount'); if (c) c.remove();
    if (op === 'clear') document.getElementById('notifList').innerHTML = '<p class="empty">All notifications cleared.</p>';
    if (!silent) document.querySelectorAll('.np-item.unread').forEach(el => el.classList.remove('unread'));
  });
}

// Toast auto-hide
setTimeout(() => { const t = document.getElementById('toast'); if (t) t.remove(); }, 4500);

// Charts (Chart.js from CDN). Each <canvas data-chart='{"type","labels","data"}'>.
const charts = [];
function inrShort(v) { return v >= 100000 ? '₹' + (v / 100000).toFixed(1) + 'L' : v >= 1000 ? '₹' + (v / 1000).toFixed(0) + 'K' : '₹' + v; }
function renderCharts() {
  if (!window.Chart) return;
  charts.splice(0).forEach(c => c.destroy());
  const css = getComputedStyle(document.documentElement);
  const col = n => css.getPropertyValue('--c' + n).trim();
  const muted = css.getPropertyValue('--muted').trim(), border = css.getPropertyValue('--border').trim();
  Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
  Chart.defaults.color = muted;
  document.querySelectorAll('canvas[data-chart]').forEach(cv => {
    const cfg = JSON.parse(cv.dataset.chart);
    const money = cfg.type === 'line' || cfg.type === 'bar';
    let type = cfg.type, ds = { data: cfg.data, borderRadius: 8, maxBarThickness: 44 };
    if (type === 'line') Object.assign(ds, { borderColor: col(1), backgroundColor: col(1) + '33', fill: true, tension: .4, borderWidth: 2.5, pointRadius: 3 });
    if (type === 'bar') ds.backgroundColor = col(1);
    if (type === 'bar2') { type = 'bar'; ds.backgroundColor = col(2); }
    if (type === 'doughnut') Object.assign(ds, { backgroundColor: [1, 2, 3, 4, 5].map(col), borderWidth: 0, borderRadius: 0 });
    const hbar = type === 'hbar'; if (hbar) { type = 'bar'; ds.backgroundColor = col(4); }
    charts.push(new Chart(cv, {
      type, data: { labels: cfg.labels, datasets: [ds] },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: hbar ? 'y' : 'x', cutout: type === 'doughnut' ? '62%' : undefined,
        plugins: { legend: { display: type === 'doughnut', position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } },
          tooltip: { callbacks: { label: c => money ? '₹' + Number(c.raw).toLocaleString('en-IN') : ' ' + c.raw } } },
        scales: type === 'doughnut' ? {} : hbar ? {
          x: { grid: { color: border }, ticks: { precision: 0 } },
          y: { grid: { display: false } }
        } : {
          x: { grid: { display: false } },
          y: { grid: { color: border }, ticks: { precision: 0, callback: money ? (v => inrShort(v)) : undefined } } }
      }
    }));
  });
}
window.addEventListener('load', renderCharts);
