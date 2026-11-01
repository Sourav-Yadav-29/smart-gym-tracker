// IronPulse Member — theme, nav, notifications, billing calculator.
function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('ip-theme', next);   // same key as the admin panel
}
function toggleNav(open) {
  document.getElementById('sidebar').classList.toggle('open', open);
  document.getElementById('navBackdrop').classList.toggle('open', open);
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
  fetch('member_dashboard.php?ajax_notif=' + (op === 'clear' ? 'clear_all' : 'mark_read')).then(() => {
    const c = document.getElementById('notifCount'); if (c) c.remove();
    if (op === 'clear') document.getElementById('notifList').innerHTML = '<p class="empty">All notifications cleared.</p>';
    if (!silent) document.querySelectorAll('.np-item.unread').forEach(el => el.classList.remove('unread'));
  });
}

// Billing cycle calculator (same discounts as the server: 3 mo 5%, 6 mo 10%, 12 mo 15%)
function selectBillingCycle(months, el) {
  document.getElementById('selectedCycleMonths').value = months;
  document.querySelectorAll('.cycle').forEach(c => c.classList.remove('selected'));
  if (el) el.classList.add('selected');
  recalcDuesPreview();
}
function recalcDuesPreview() {
  const sel = document.getElementById('duesPlanSelect');
  if (!sel) return;
  const rate = parseFloat(sel.options[sel.selectedIndex].getAttribute('data-monthly')) || 1250;
  const months = parseInt(document.getElementById('selectedCycleMonths').value) || 3;
  const discount = {3: 0.95, 6: 0.90, 12: 0.85}[months] || 1;
  document.getElementById('payablePreview').textContent = '₹' + Math.round(rate * months * discount).toLocaleString('en-IN');
  document.getElementById('cycleSubtext').textContent = 'Extends membership by +' + months + (months === 1 ? ' Month' : ' Months');
}
document.addEventListener('DOMContentLoaded', recalcDuesPreview);

// Toast auto-hide
setTimeout(() => { const t = document.getElementById('toast'); if (t) t.remove(); }, 4500);
