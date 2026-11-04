// IronPulse Trainer — theme, nav, tabs, notifications.
// Theme preference uses the same 'ip-theme' key as the Admin portal.
function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('ip-theme', next); } catch (e) {}
}
function toggleNav(open) {
  document.getElementById('sidebar').classList.toggle('open', open);
  document.getElementById('navBackdrop').classList.toggle('open', open);
}

// Tabs (client-side switch, URL kept in sync so a refresh stays on the same tab)
function switchTab(tabName) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidebar nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  const panel = document.getElementById('tab-' + tabName);
  if (panel) panel.classList.add('active');
  history.replaceState(null, '', '/dashboard?tab=' + tabName);
  toggleNav(false);
  window.scrollTo({ top: 0 });
}

// Notification drawer: toggle, mark all read, clear
function toggleNotifDrawer(e) {
  e.stopPropagation();
  const drawer = document.getElementById('notifDrawer');
  drawer.classList.toggle('open');
  document.getElementById('notifBellBtn').classList.remove('pulse-ring');
  if (drawer.classList.contains('open')) markAllNotificationsRead(false);
}
document.addEventListener('click', () => {
  const drawer = document.getElementById('notifDrawer');
  if (drawer) drawer.classList.remove('open');
});

function markAllNotificationsRead(updateVisualList = true) {
  fetch('/ajax_notif?ajax_notif=mark_read').then(() => {
    const badge = document.getElementById('notifBadge');
    if (badge) badge.hidden = true;
    if (updateVisualList) document.querySelectorAll('.np-item.unread').forEach(el => el.classList.remove('unread'));
  });
}

function clearAllNotifications() {
  fetch('/ajax_notif?ajax_notif=clear_all').then(() => {
    const badge = document.getElementById('notifBadge');
    if (badge) badge.hidden = true;
    const list = document.getElementById('notifListContainer');
    if (list) list.innerHTML = '<p class="empty">All notifications cleared.</p>';
  });
}

// Toast auto-hide
setTimeout(() => { const t = document.getElementById('toast'); if (t) t.remove(); }, 4500);

// Biometrics form: start from the selected client's real values (not fixed defaults),
// so saving a note never overwrites their height/weight/body-fat/goal by accident.
function fillBiometrics() {
  const sel = document.getElementById('bioClient'); const f = sel && sel.form;
  const o = sel && sel.selectedOptions[0]; if (!o) return;
  f.elements.height_cm.value = o.dataset.height; f.elements.weight_kg.value = o.dataset.weight;
  f.elements.body_fat_pct.value = o.dataset.bf; f.elements.fitness_goal.value = o.dataset.goal;
  f.elements.trainer_notes.value = o.dataset.notes;
}
document.addEventListener('DOMContentLoaded', fillBiometrics);
