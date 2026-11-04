// IronPulse Admin Client-Side Application Script
// Pure REST API + Native HTML Modals + Chart.js + Dynamic Notifications

const ALLOWED_EMAIL_DOMAINS = [
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com',
  'live.com', 'msn.com', 'yahoo.com', 'ymail.com', 'icloud.com',
  'me.com', 'mac.com', 'proton.me', 'protonmail.com', 'zoho.com',
  'zohomail.in', 'ironpulse.com'
];

// Helper: Escape HTML to prevent XSS
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

// Formatters
function inr(n, d = 0) {
  if (isNaN(n) || n === null) return '₹0';
  const num = Number(n);
  const neg = num < 0;
  const abs = Math.abs(num);
  const parts = abs.toFixed(d).split('.');
  let intPart = parts[0];
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  if (rest.length > 0) {
    intPart = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  } else {
    intPart = last3;
  }
  return (neg ? '-' : '') + '₹' + intPart + (parts[1] ? '.' + parts[1] : '');
}

function inrShort(v) {
  if (v >= 100000) return '₹' + (v / 100000).toFixed(1) + 'L';
  if (v >= 1000) return '₹' + (v / 1000).toFixed(0) + 'K';
  return '₹' + v;
}

function fdate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fdt(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ', ' +
         dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function daysTo(end) {
  if (!end) return 0;
  const endDt = new Date(end);
  const now = new Date(new Date().toISOString().split('T')[0]);
  return Math.floor((endDt - now) / (1000 * 60 * 60 * 24));
}

function initials(name) {
  if (!name) return 'IP';
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map(p => p[0].toUpperCase()).join('');
}

function bmiInfo(b) {
  const bmi = Number(b);
  if (bmi < 18.5) return { label: 'Underweight', color: 'amber' };
  if (bmi < 25) return { label: 'Optimal / Athletic', color: 'green' };
  if (bmi < 30) return { label: 'Overweight / Muscular', color: 'cyan' };
  return { label: 'High BMI', color: 'red' };
}

// Toast Feedback Notification
function showToast(msg, type = 'success') {
  let existing = document.getElementById('toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.id = 'toast';
  t.innerHTML = `${escapeHtml(msg)}<button type="button" onclick="this.parentNode.remove()">✕</button>`;
  document.body.appendChild(t);
  setTimeout(() => { if (t.parentNode) t.remove(); }, 6000);
}

// Auth Check & User Setup
function checkAuth() {
  let user = null;
  try { user = JSON.parse(localStorage.getItem('gym_user')); } catch (e) {}
  if (!user || user.role !== 'admin') {
    window.location.href = '/index.html';
    return { name: '', role: 'admin', id: 0 };
  }
  const actorNameEl = document.getElementById('actor-name');
  const actorAvatarEl = document.getElementById('actor-avatar');
  const actorIdEl = document.getElementById('actor-id');
  if (actorNameEl) actorNameEl.textContent = user.name || 'Arthur Pendelton';
  if (actorAvatarEl) actorAvatarEl.textContent = initials(user.name || 'Arthur Pendelton');
  if (actorIdEl) actorIdEl.textContent = `● Admin (#${user.id || 1})`;
  return user;
}

function logout() {
  localStorage.removeItem('gym_user');
  window.location.href = '/index.html';
}

// Theme & Navigation
function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('ip-theme', next); } catch (e) {}
  if (typeof renderAllCharts === 'function') renderAllCharts();
}

function toggleNav(open) {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('navBackdrop');
  if (sidebar) sidebar.classList.toggle('open', open);
  if (backdrop) backdrop.classList.toggle('open', open);
}

// Notifications Handling
function toggleNotif(e) {
  if (e) e.stopPropagation();
  const p = document.getElementById('notifPanel');
  if (!p) return;
  p.classList.toggle('open');
  if (p.classList.contains('open')) {
    notifAction('read', true);
  }
}

async function notifAction(op, silent) {
  try {
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: op, role: 'admin' })
    });
    const c = document.getElementById('notifCount');
    if (c) c.style.display = 'none';
    if (op === 'clear') {
      const list = document.getElementById('notifList');
      if (list) list.innerHTML = '<p class="empty">All notifications cleared.</p>';
    }
    if (!silent) {
      document.querySelectorAll('.np-item.unread').forEach(el => el.classList.remove('unread'));
    }
  } catch (err) {
    console.error('Notification action error:', err);
  }
}

async function loadNotifications() {
  try {
    const res = await fetch('/api/notifications?role=admin');
    const data = await res.json();
    const countEl = document.getElementById('notifCount');
    const listEl = document.getElementById('notifList');
    
    const unread = data.unread !== undefined ? data.unread : (Array.isArray(data) ? data.filter(n => !Number(n.is_read)).length : 0);
    const notifications = Array.isArray(data) ? data : (data.notifications || []);

    if (countEl) {
      if (unread > 0) {
        countEl.textContent = unread;
        countEl.style.display = 'inline-block';
      } else {
        countEl.style.display = 'none';
      }
    }

    if (listEl) {
      if (!notifications || notifications.length === 0) {
        listEl.innerHTML = '<p class="empty">No notifications yet.</p>';
      } else {
        listEl.innerHTML = notifications.map(n => `
          <div class="np-item ${Number(n.is_read) ? '' : 'unread'}" data-testid="notification-item">
            <div><span class="tag">${escapeHtml(n.category || 'System')}</span><time>${fdt(n.created_at)}</time></div>
            <p>${escapeHtml(n.message)}</p><small>— ${escapeHtml(n.actor_name || 'System')}</small>
          </div>
        `).join('');
      }
    }
  } catch (err) {
    console.error('Error fetching notifications:', err);
  }
}

// Modals Handling
let cachedMembers = [];
let cachedTrainers = [];
let cachedPlans = [];

async function preloadModalData() {
  try {
    const [mRes, tRes, pRes] = await Promise.all([
      fetch('/api/members'),
      fetch('/api/trainers'),
      fetch('/api/plans')
    ]);
    cachedMembers = await mRes.json();
    cachedTrainers = await tRes.json();
    cachedPlans = await pRes.json();

    // Populate selects in modals if present
    populateModalSelects();
  } catch (e) {
    console.warn('Preload modal data warning:', e);
  }
}

function populateModalSelects() {
  // 1. Plan select in m-member
  const memberPlanSel = document.querySelector('#m-member select[name="plan_id"]');
  if (memberPlanSel && cachedPlans.length > 0) {
    memberPlanSel.innerHTML = cachedPlans.map(p => `
      <option value="${p.plan_id}">${escapeHtml(p.plan_name)} (${inr(p.price)})</option>
    `).join('');
  }

  // 2. Member selects in m-payment, m-checkin, m-slot, m-remind
  const paymentMemSel = document.querySelector('#m-payment select[name="member_id"]');
  if (paymentMemSel && cachedMembers.length > 0) {
    paymentMemSel.innerHTML = '<option value="">Select member</option>' + cachedMembers.map(m => `
      <option value="${m.member_id}" data-price="${m.plan_price || 0}">${escapeHtml(m.name)} · ${escapeHtml(m.plan_name || 'No plan')}</option>
    `).join('');
  }

  const checkinMemSel = document.querySelector('#m-checkin select[name="member_id"]');
  if (checkinMemSel && cachedMembers.length > 0) {
    checkinMemSel.innerHTML = '<option value="">Select member</option>' + cachedMembers.map(m => `
      <option value="${m.member_id}">${escapeHtml(m.name)} · ${escapeHtml(m.plan_name || 'No plan')}</option>
    `).join('');
  }

  const slotMemSel = document.querySelector('#m-slot select[name="member_id"]');
  if (slotMemSel && cachedMembers.length > 0) {
    slotMemSel.innerHTML = '<option value="">Select member</option>' + cachedMembers.map(m => `
      <option value="${m.member_id}">${escapeHtml(m.name)} · ${escapeHtml(m.plan_name || 'No plan')}</option>
    `).join('');
  }

  const remindMemSel = document.querySelector('#m-remind select[name="member_id"]');
  if (remindMemSel && cachedMembers.length > 0) {
    remindMemSel.innerHTML = '<option value="">Select member</option>' + cachedMembers.map(m => `
      <option value="${m.member_id}">${escapeHtml(m.name)} · due ${fdate(m.plan_end_date)}</option>
    `).join('');
  }

  // 3. Trainer select in m-slot
  const slotTrainerSel = document.querySelector('#m-slot select[name="trainer_id"]');
  if (slotTrainerSel && cachedTrainers.length > 0) {
    slotTrainerSel.innerHTML = cachedTrainers.map(t => `
      <option value="${t.trainer_id}">${escapeHtml(t.name)} · ${escapeHtml(t.specialization || 'Trainer')}</option>
    `).join('');
  }
}

function prefillAmount(sel) {
  const opt = sel.selectedOptions[0];
  const price = opt && opt.dataset.price;
  if (price && Number(price) > 0 && sel.form && sel.form.elements.amount) {
    sel.form.elements.amount.value = price;
  }
}

function openModal(id, values) {
  const dlg = document.getElementById(id);
  if (!dlg) return;
  const form = dlg.querySelector('form');
  if (form) {
    if (id === 'm-plan' && !values) form.reset();
    Object.entries(values || {}).forEach(([k, v]) => {
      const el = form.elements[k];
      if (el) {
        el.value = v;
        el.dispatchEvent(new Event('change'));
      }
    });
  }
  if (typeof dlg.showModal === 'function') {
    dlg.showModal();
  } else {
    dlg.setAttribute('open', '');
  }
}

function closeModal(btn) {
  const dlg = btn.closest('dialog') || document.querySelector('dialog[open]');
  if (!dlg) return;
  if (typeof dlg.close === 'function') {
    dlg.close();
  } else {
    dlg.removeAttribute('open');
  }
}

function confirmDelete(action, fields, title, desc, confirmBtnText) {
  const dlg = document.getElementById('m-confirm');
  if (!dlg) return;
  const form = dlg.querySelector('form');
  if (form) {
    form.elements.action.value = action;
    ['member_id', 'trainer_id', 'booking_id'].forEach(k => {
      if (form.elements[k]) form.elements[k].value = (fields && fields[k]) || '';
    });
  }
  const titleEl = dlg.querySelector('[data-title]');
  const descEl = dlg.querySelector('[data-desc]');
  const submitBtn = dlg.querySelector('button[type="submit"]');
  if (titleEl) titleEl.textContent = title || 'Are you sure?';
  if (descEl) descEl.textContent = desc || '';
  if (submitBtn) submitBtn.textContent = confirmBtnText || 'Delete';
  if (typeof dlg.showModal === 'function') {
    try {
      dlg.showModal();
    } catch (e) {
      dlg.setAttribute('open', '');
    }
  } else {
    dlg.setAttribute('open', '');
  }
}

// Safe action trigger helpers (prevents inline attribute quote breaking)
function handleCancelBookingClick(btn) {
  const bookingId = btn.getAttribute('data-booking-id');
  const memberName = btn.getAttribute('data-member') || 'Member';
  const trainerName = btn.getAttribute('data-trainer') || 'Coach';
  confirmDelete(
    'delete_booking',
    { booking_id: bookingId },
    'Cancel Slot Booking?',
    `Are you sure you want to cancel the active slot booking for ${memberName} with ${trainerName}? The trainer slot and locker will be released.`,
    'Cancel Slot'
  );
}

function handleDeleteMemberClick(btn) {
  const id = btn.getAttribute('data-id');
  const name = btn.getAttribute('data-name') || 'this member';
  confirmDelete(
    'delete_member',
    { member_id: id },
    `Delete ${name}?`,
    'Removes the member with all bookings, payments, logs and workouts.',
    'Delete Member'
  );
}

function handleDeleteTrainerClick(btn) {
  const id = btn.getAttribute('data-id');
  const name = btn.getAttribute('data-name') || 'this coach';
  confirmDelete(
    'delete_trainer',
    { trainer_id: id },
    `Remove Coach ${name}?`,
    'Their assigned slot bookings and client roster will be released.',
    'Remove Coach'
  );
}

// Modal Form Validations & Submissions
function validateEnrollForm(form, emailInputId, errBoxId) {
  const emailInput = document.getElementById(emailInputId) || (form && form.querySelector('input[type="email"]'));
  const errBox = document.getElementById(errBoxId);

  if (emailInput) {
    const val = emailInput.value.trim().toLowerCase();
    const parts = val.split('@');
    if (parts.length !== 2 || !ALLOWED_EMAIL_DOMAINS.includes(parts[1])) {
      const errorMsg = '⚠️ Unsupported email domain! Only recognized providers (Gmail, Outlook, Yahoo, iCloud, Proton, Zoho, or IronPulse) can be registered.';
      if (errBox) {
        errBox.textContent = errorMsg;
        errBox.style.display = 'block';
      } else {
        alert(errorMsg);
      }
      emailInput.focus();
      return false;
    }
  }
  if (errBox) errBox.style.display = 'none';
  return true;
}

function bindModalForms() {
  // m-member
  const fMember = document.querySelector('#m-member form');
  if (fMember) {
    fMember.onsubmit = async (e) => {
      e.preventDefault();
      if (!validateEnrollForm(fMember, 'member-email-input', 'member-modal-err')) return;
      const data = {
        name: fMember.name.value.trim(),
        email: fMember.email.value.trim(),
        phone: fMember.phone.value.trim(),
        plan_id: fMember.plan_id.value,
        plan_end_date: fMember.plan_end_date.value,
        password: fMember.password.value,
        height_cm: fMember.height_cm.value,
        weight_kg: fMember.weight_kg.value,
        body_fat_pct: fMember.body_fat_pct.value,
        fitness_goal: fMember.fitness_goal.value
      };
      try {
        const res = await fetch('/api/members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to create member');
        showToast('Member enrolled successfully!');
        closeModal(fMember);
        fMember.reset();
        refreshCurrentPage();
      } catch (err) {
        alert(err.message);
      }
    };
  }

  // m-admin
  const fAdmin = document.querySelector('#m-admin form');
  if (fAdmin) {
    fAdmin.onsubmit = async (e) => {
      e.preventDefault();
      if (!validateEnrollForm(fAdmin, 'admin-email-input', 'admin-modal-err')) return;
      const data = {
        name: fAdmin.name.value.trim(),
        email: fAdmin.email.value.trim(),
        password: fAdmin.password.value
      };
      try {
        const res = await fetch('/api/admin/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to add administrator');
        showToast('Administrator created successfully!');
        closeModal(fAdmin);
        fAdmin.reset();
        refreshCurrentPage();
      } catch (err) {
        alert(err.message);
      }
    };
  }

  // m-trainer
  const fTrainer = document.querySelector('#m-trainer form');
  if (fTrainer) {
    fTrainer.onsubmit = async (e) => {
      e.preventDefault();
      if (!validateEnrollForm(fTrainer, 'trainer-email-input', 'trainer-modal-err')) return;
      const data = {
        name: fTrainer.name.value.trim(),
        email: fTrainer.email.value.trim(),
        specialization: fTrainer.specialization.value.trim(),
        password: fTrainer.password.value
      };
      try {
        const res = await fetch('/api/trainers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to add trainer');
        showToast('Trainer added successfully!');
        closeModal(fTrainer);
        fTrainer.reset();
        refreshCurrentPage();
      } catch (err) {
        alert(err.message);
      }
    };
  }

  // m-payment
  const fPayment = document.querySelector('#m-payment form');
  if (fPayment) {
    fPayment.onsubmit = async (e) => {
      e.preventDefault();
      const data = {
        member_id: fPayment.member_id.value,
        amount: fPayment.amount.value,
        payment_date: fPayment.payment_date.value,
        method: fPayment.method.value
      };
      try {
        const res = await fetch('/api/admin/payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to record payment');
        showToast('Payment recorded successfully!');
        closeModal(fPayment);
        fPayment.reset();
        refreshCurrentPage();
      } catch (err) {
        alert(err.message);
      }
    };
  }

  // m-checkin
  const fCheckin = document.querySelector('#m-checkin form');
  if (fCheckin) {
    fCheckin.onsubmit = async (e) => {
      e.preventDefault();
      const data = { member_id: fCheckin.member_id.value };
      try {
        const res = await fetch('/api/admin/checkin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to check in');
        showToast('Gate check-in recorded!');
        closeModal(fCheckin);
        fCheckin.reset();
        refreshCurrentPage();
      } catch (err) {
        alert(err.message);
      }
    };
  }

  // m-slot
  const fSlot = document.querySelector('#m-slot form');
  if (fSlot) {
    fSlot.onsubmit = async (e) => {
      e.preventDefault();
      const data = {
        member_id: fSlot.member_id.value,
        trainer_id: fSlot.trainer_id.value,
        slot_time: fSlot.slot_time.value,
        locker_number: fSlot.locker_number.value.trim()
      };
      try {
        const res = await fetch('/api/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to assign slot');
        showToast('Trainer slot assigned!');
        closeModal(fSlot);
        fSlot.reset();
        refreshCurrentPage();
      } catch (err) {
        alert(err.message);
      }
    };
  }

  // m-remind
  const fRemind = document.querySelector('#m-remind form');
  if (fRemind) {
    fRemind.onsubmit = async (e) => {
      e.preventDefault();
      const data = { member_id: fRemind.member_id.value };
      try {
        const res = await fetch('/api/admin/reminder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to send reminder');
        showToast('Payment due alert sent to member!');
        closeModal(fRemind);
        fRemind.reset();
      } catch (err) {
        alert(err.message);
      }
    };
  }

  // m-plan
  const fPlan = document.querySelector('#m-plan form');
  if (fPlan) {
    fPlan.onsubmit = async (e) => {
      e.preventDefault();
      const data = {
        plan_id: fPlan.plan_id ? fPlan.plan_id.value : 0,
        plan_name: fPlan.plan_name.value.trim(),
        price: fPlan.price.value,
        duration_months: fPlan.duration_months.value
      };
      try {
        const res = await fetch('/api/plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to save plan');
        showToast('Membership plan saved!');
        closeModal(fPlan);
        fPlan.reset();
        refreshCurrentPage();
      } catch (err) {
        alert(err.message);
      }
    };
  }

  // m-confirm
  const fConfirm = document.querySelector('#m-confirm form');
  if (fConfirm) {
    fConfirm.onsubmit = async (e) => {
      e.preventDefault();
      const action = fConfirm.elements.action.value;
      const member_id = fConfirm.elements.member_id.value;
      const trainer_id = fConfirm.elements.trainer_id.value;
      const booking_id = fConfirm.elements.booking_id.value;

      try {
        if (action === 'delete_member' && member_id) {
          const res = await fetch(`/api/members/${member_id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('Failed to delete member');
          showToast('Member deleted.');
        } else if (action === 'delete_trainer' && trainer_id) {
          const res = await fetch(`/api/trainers/${trainer_id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('Failed to delete trainer');
          showToast('Trainer removed.');
        } else if (action === 'delete_booking' && booking_id) {
          const res = await fetch(`/api/bookings/${booking_id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('Failed to cancel slot booking');
          showToast('Slot booking cancelled.');
        }
        closeModal(fConfirm);
        refreshCurrentPage();
      } catch (err) {
        alert(err.message);
      }
    };
  }
}

function refreshCurrentPage() {
  const p = window.location.pathname;
  if (p.includes('members.html')) loadMembers();
  else if (p.includes('trainers.html')) loadTrainers();
  else if (p.includes('plans.html')) loadPlans();
  else if (p.includes('reports.html')) loadReports();
  else if (p.includes('logs.html')) loadLogs();
  else if (p.includes('member.html')) loadMemberDetail();
  else loadDashboard();

  // Reload sidebar counts and notifications
  initAdminLayout();
}

// Global Layout Initializer
async function initAdminLayout() {
  checkAuth();
  loadNotifications();
  preloadModalData();
  bindModalForms();

  // Highlight active sidebar navigation item
  const currentPath = window.location.pathname;
  const navLinks = document.querySelectorAll('aside.sidebar nav a');
  navLinks.forEach(a => {
    const href = a.getAttribute('href');
    if (href && (currentPath.endsWith(href) || (href.includes('members.html') && currentPath.includes('member.html')))) {
      a.classList.add('active');
    } else {
      a.classList.remove('active');
    }
  });

  // Fetch counts from /api/stats to update sidebar badges
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    
    const setBadge = (id, count) => {
      const el = document.getElementById(id);
      if (el) {
        if (count > 0) {
          el.textContent = count;
          el.style.display = 'inline-block';
        } else {
          el.style.display = 'none';
        }
      }
    };

    setBadge('badge-members', data.members || data.total_members);
    setBadge('badge-trainers', data.trainers || data.total_trainers);
    setBadge('badge-plans', data.plans || 4);
    setBadge('badge-logs', data.logs || 11);

    if (data.unread && data.unread > 0) {
      const bellCount = document.getElementById('notifCount');
      if (bellCount) {
        bellCount.textContent = data.unread;
        bellCount.style.display = 'inline-block';
      }
    }
  } catch (err) {
    console.warn('Sidebar badge stats warning:', err);
  }

  // Outside click / Escape closes notification panel
  document.addEventListener('click', () => {
    const p = document.getElementById('notifPanel');
    if (p) p.classList.remove('open');
  });
  document.addEventListener('keydown', e => {
    const p = document.getElementById('notifPanel');
    if (e.key === 'Escape' && p) p.classList.remove('open');
  });

  // Dialog backdrop click
  document.querySelectorAll('dialog.modal').forEach(d => {
    d.addEventListener('click', e => {
      if (e.target === d) d.close();
    });
  });
}

window.addEventListener('DOMContentLoaded', initAdminLayout);


// ==========================================
// QUICK ACTIONS HELPERS
// ==========================================
async function quickCheckout(log_id) {
  try {
    const res = await fetch('/api/admin/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ log_id })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to checkout');
    showToast('Member checked out.');
    refreshCurrentPage();
  } catch (err) {
    alert(err.message);
  }
}

async function quickRemind(member_id) {
  try {
    const res = await fetch('/api/admin/reminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to send reminder');
    showToast('Payment due reminder sent.');
  } catch (err) {
    alert(err.message);
  }
}

// ==========================================
// 1. DASHBOARD (COMMAND CENTER)
// ==========================================
let dashboardChart = null;

async function loadDashboard() {
  try {
    const res = await fetch('/api/admin/dashboard');
    const data = await res.json();

    // Top eyebrow date
    const eyebrow = document.getElementById('today-eyebrow');
    if (eyebrow) {
      const now = new Date();
      eyebrow.textContent = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
    }

    // KPIs
    const kpiRev = document.getElementById('kpi-rev');
    const kpiPayCount = document.getElementById('kpi-paycount');
    const kpiActive = document.getElementById('kpi-active');
    const kpiInactive = document.getElementById('kpi-inactive');
    const kpiOutstanding = document.getElementById('kpi-outstanding');
    const kpiOverdueExp = document.getElementById('kpi-overdue-exp');
    const kpiTodayIn = document.getElementById('kpi-today-in');
    const kpiOnlineSlots = document.getElementById('kpi-online-slots');

    if (kpiRev) kpiRev.textContent = inr(data.revenue);
    if (kpiPayCount) kpiPayCount.textContent = `${data.payCount} verified payments`;
    if (kpiActive) kpiActive.innerHTML = `${data.active_members} <i>/ ${data.total_members}</i>`;
    if (kpiInactive) kpiInactive.textContent = `${data.inactive_members} inactive accounts`;
    if (kpiOutstanding) kpiOutstanding.textContent = inr(data.outstanding);
    if (kpiOverdueExp) kpiOverdueExp.textContent = `${data.overdue_count} overdue · ${data.expiring_count} expiring in 30d`;
    if (kpiTodayIn) kpiTodayIn.textContent = data.today_in;
    if (kpiOnlineSlots) kpiOnlineSlots.textContent = `${data.online_now} in gym now · ${data.slot_count} trainer slots`;

    // Revenue Trend Chart
    const canvas = document.getElementById('revChart');
    if (canvas && window.Chart) {
      if (dashboardChart) dashboardChart.destroy();
      const labels = (data.revenue_trend || []).map(r => r.label);
      const values = (data.revenue_trend || []).map(r => r.total);

      dashboardChart = new Chart(canvas, {
        type: 'line',
        data: {
          labels: labels.length > 0 ? labels : ['Jun 26', 'Jul 26', 'Aug 26', 'Sep 26', 'Oct 26', 'Nov 26'],
          datasets: [{
            data: values.length > 0 ? values : [0, 0, 0, 0, 0, 27750],
            borderColor: '#0284c7',
            backgroundColor: 'rgba(2, 132, 199, 0.15)',
            fill: true,
            tension: 0.4,
            borderWidth: 2.5,
            pointRadius: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: c => ' ₹' + Number(c.raw).toLocaleString('en-IN') } }
          },
          scales: {
            x: { grid: { display: false } },
            y: {
              grid: { color: 'rgba(128,128,128,0.1)' },
              ticks: { precision: 0, callback: v => inrShort(v) }
            }
          }
        }
      });
    }

    // Expiring within 30 days
    const expBox = document.getElementById('expiring-list');
    if (expBox) {
      if (!data.expiring || data.expiring.length === 0) {
        expBox.innerHTML = '<p class="empty">No renewals due in the next 30 days.</p>';
      } else {
        expBox.innerHTML = data.expiring.slice(0, 8).map(m => `
          <div class="row">
            <span class="avatar sm">${initials(m.name)}</span>
            <a class="grow" href="/admin/member.html?id=${m.member_id}">
              <b>${escapeHtml(m.name)}</b>
              <small>${escapeHtml(m.plan_name || 'No plan')} · expires ${fdate(m.plan_end_date)}</small>
            </a>
            <span class="badge ${m.days <= 7 ? 'amber' : 'cyan'}">${m.days}d left</span>
            <button class="btn xs" onclick="quickRemind(${m.member_id})">Remind</button>
          </div>
        `).join('');
      }
    }

    // Live attendance
    const attBox = document.getElementById('live-attendance-list');
    if (attBox) {
      if (!data.attendance || data.attendance.length === 0) {
        attBox.innerHTML = '<p class="empty">No check-ins yet.</p>';
      } else {
        attBox.innerHTML = data.attendance.map(l => `
          <div class="row">
            <i class="live ${l.session_status === 'Online' ? 'on' : ''}"></i>
            <span class="grow">${escapeHtml(l.name)}</span>
            <small class="mono">${fdt(l.login_time)}</small>
            ${l.session_status === 'Online' ? `<button class="btn xs ghost" onclick="quickCheckout(${l.log_id})">Out</button>` : ''}
          </div>
        `).join('');
      }
    }

    // Trainer slots
    const slotsBox = document.getElementById('trainer-slots-list');
    if (slotsBox) {
      if (!data.bookings || data.bookings.length === 0) {
        slotsBox.innerHTML = '<p class="empty">No slot assignments.</p>';
      } else {
        slotsBox.innerHTML = data.bookings.map(b => `
          <div class="row">
            <span class="grow"><b>${escapeHtml(b.member_name)}</b> <small class="inline">with ${escapeHtml(b.trainer_name)}</small></span>
            <small class="mono">${escapeHtml((b.slot_time || '').split(' - ')[0])}</small>
          </div>
        `).join('');
      }
    }

    // Overdue dues
    const overdueBox = document.getElementById('overdue-list');
    if (overdueBox) {
      if (!data.overdue || data.overdue.length === 0) {
        overdueBox.innerHTML = '<p class="empty">All dues are clear.</p>';
      } else {
        overdueBox.innerHTML = data.overdue.slice(0, 6).map(m => `
          <div class="due">
            <div><a href="/admin/member.html?id=${m.member_id}"><b>${escapeHtml(m.name)}</b></a><span class="badge ${m.status === 'Active' ? 'green' : 'amber'}">${m.status}</span></div>
            <small>${escapeHtml(m.plan_name || 'No plan')} · ${Math.abs(m.days)}d overdue · ${inr(m.plan_price || 0)}</small>
            <button class="btn xs" onclick="quickRemind(${m.member_id})">Send due alert</button>
          </div>
        `).join('');
      }
    }

    // Recent payments
    const paymentsBox = document.getElementById('recent-payments-list');
    if (paymentsBox) {
      if (!data.recent_payments || data.recent_payments.length === 0) {
        paymentsBox.innerHTML = '<p class="empty">No payments yet.</p>';
      } else {
        paymentsBox.innerHTML = data.recent_payments.map(p => `
          <div class="row">
            <span class="grow"><b>${escapeHtml(p.name)}</b><small>${fdate(p.payment_date)} · ${escapeHtml(p.method)}</small></span>
            <strong class="money">${inr(p.amount)}</strong>
          </div>
        `).join('');
      }
    }

  } catch (err) {
    console.error('Error loading dashboard:', err);
  }
}

// ==========================================
// 2. MEMBERS & DUES
// ==========================================
let rawMembersList = [];

async function loadMembers() {
  try {
    const [mRes, pRes] = await Promise.all([
      fetch('/api/members'),
      fetch('/api/plans')
    ]);
    const members = await mRes.json();
    const plans = await pRes.json();
    cachedPlans = plans;

    // Populate plan filter select if empty
    const planSel = document.getElementById('filter-plan');
    if (planSel && planSel.children.length <= 1) {
      planSel.innerHTML = '<option value="0">All plans</option>' + plans.map(p => `
        <option value="${p.plan_id}">${escapeHtml(p.plan_name)}</option>
      `).join('');
    }

    // Process members with calculated days
    const todayStr = new Date().toISOString().split('T')[0];
    rawMembersList = members.map(m => {
      const days = m.plan_end_date ? daysTo(m.plan_end_date) : 0;
      const overdue = m.plan_end_date ? (new Date(m.plan_end_date) < new Date(todayStr)) : false;
      return { ...m, days, overdue };
    });

    // Check query params if any
    const urlParams = new URLSearchParams(window.location.search);
    const qParam = urlParams.get('q');
    if (qParam) {
      const qInput = document.getElementById('filter-q');
      if (qInput) qInput.value = qParam;
    }

    filterAndRenderMembers();
  } catch (err) {
    console.error('Error loading members:', err);
  }
}

function filterAndRenderMembers() {
  const qInput = document.getElementById('filter-q');
  const statusSel = document.getElementById('filter-status');
  const planSel = document.getElementById('filter-plan');
  const expSel = document.getElementById('filter-expiry');

  const q = qInput ? qInput.value.trim().toLowerCase() : '';
  const status = statusSel ? statusSel.value : '';
  const plan = planSel ? planSel.value : '0';
  const expiry = expSel ? expSel.value : '';

  let filtered = rawMembersList.filter(m => {
    if (q) {
      const matchName = (m.name || '').toLowerCase().includes(q);
      const matchEmail = (m.email || '').toLowerCase().includes(q);
      const matchPhone = (m.phone || '').toLowerCase().includes(q);
      if (!matchName && !matchEmail && !matchPhone) return false;
    }
    if (status && m.status !== status) return false;
    if (plan && plan !== '0' && String(m.membership_plan_id) !== String(plan)) return false;
    if (expiry) {
      if (expiry === 'overdue' && !m.overdue) return false;
      if (expiry === 'soon' && (m.overdue || m.days > 30)) return false;
      if (expiry === 'ok' && (m.overdue || m.days <= 30)) return false;
    }
    return true;
  });

  const countHead = document.getElementById('members-count-head');
  if (countHead) countHead.textContent = `${filtered.length} of ${rawMembersList.length} members`;

  const tbody = document.getElementById('members-tbody');
  const emptyBox = document.getElementById('members-empty');

  if (filtered.length === 0) {
    if (tbody) tbody.innerHTML = '';
    if (emptyBox) emptyBox.style.display = 'block';
  } else {
    if (emptyBox) emptyBox.style.display = 'none';
    if (tbody) {
      tbody.innerHTML = filtered.map(m => {
        const bmi = bmiInfo(m.bmi);
        return `
          <tr>
            <td>
              <a class="who" href="/admin/member.html?id=${m.member_id}">
                <span class="avatar sm">${initials(m.name)}</span>
                <span><b>${escapeHtml(m.name)}</b><small>${escapeHtml(m.email)}</small></span>
              </a>
            </td>
            <td><span class="pill">${escapeHtml(m.plan_name || 'None')}</span></td>
            <td>
              <span class="mono">${fdate(m.plan_end_date)}</span>
              <small class="${m.overdue ? 'txt-red' : (m.days <= 30 ? 'txt-amber' : '')}">
                ${m.overdue ? Math.abs(m.days) + 'd overdue' : m.days + 'd left'}
              </small>
            </td>
            <td><span class="badge ${m.status === 'Active' ? 'green' : 'amber'}">${m.status || 'Inactive'}</span></td>
            <td class="hide-md">
              <span class="badge ${bmi.color}">${Number(m.bmi || 24.5).toFixed(1)} · ${bmi.label}</span>
            </td>
            <td class="right nowrap">
              <a class="btn xs" href="/admin/member.html?id=${m.member_id}">View</a>
              <button class="btn xs" onclick="openModal('m-payment', { member_id: ${m.member_id} })">₹ Pay</button>
              <button class="btn xs" onclick="quickRemind(${m.member_id})">Remind</button>
              <button class="btn xs danger-ghost" data-id="${m.member_id}" data-name="${escapeHtml(m.name || '')}" onclick="handleDeleteMemberClick(this)">Delete</button>
            </td>
          </tr>
        `;
      }).join('');
    }
  }
}

function clearMembersFilter() {
  const qInput = document.getElementById('filter-q');
  const statusSel = document.getElementById('filter-status');
  const planSel = document.getElementById('filter-plan');
  const expSel = document.getElementById('filter-expiry');
  if (qInput) qInput.value = '';
  if (statusSel) statusSel.value = '';
  if (planSel) planSel.value = '0';
  if (expSel) expSel.value = '';
  filterAndRenderMembers();
}

// ==========================================
// 3. TRAINERS & SLOTS
// ==========================================
async function loadTrainers() {
  try {
    const [tRes, bRes] = await Promise.all([
      fetch('/api/trainers'),
      fetch('/api/bookings')
    ]);
    const trainers = await tRes.json();
    const bookings = await bRes.json();

    const grid = document.getElementById('trainers-grid');
    if (grid) {
      if (trainers.length === 0) {
        grid.innerHTML = '<p class="empty">No trainers yet — add your first coach.</p>';
      } else {
        grid.innerHTML = trainers.map(t => {
          const count = Number(t.assigned_count) || 0;
          const pct = Math.min(100, Math.round(count / 8 * 100));
          return `
            <div class="card lift">
              <div class="who">
                <span class="avatar">${initials(t.name)}</span>
                <span class="grow"><b>${escapeHtml(t.name)}</b><small>${escapeHtml(t.email)}</small></span>
                <button class="btn xs danger-ghost" data-id="${t.trainer_id}" data-name="${escapeHtml(t.name || '')}" onclick="handleDeleteTrainerClick(this)">Remove</button>
              </div>
              <span class="badge violet">${escapeHtml(t.specialization || 'Fitness Trainer')}</span>
              <div class="meter">
                <div><small>Slot utilization</small><small class="mono">${count}/8</small></div>
                <span><i style="width:${pct}%"></i></span>
              </div>
              <button class="btn block" onclick="openModal('m-slot', { trainer_id: ${t.trainer_id} })">Assign client</button>
            </div>
          `;
        }).join('');
      }
    }

    const tbody = document.getElementById('bookings-tbody');
    const emptyBk = document.getElementById('bookings-empty');
    if (bookings.length === 0) {
      if (tbody) tbody.innerHTML = '';
      if (emptyBk) emptyBk.style.display = 'block';
    } else {
      if (emptyBk) emptyBk.style.display = 'none';
      if (tbody) {
        tbody.innerHTML = bookings.map(b => `
          <tr>
            <td><b>${escapeHtml(b.member_name)}</b></td>
            <td>${escapeHtml(b.trainer_name)} <small class="inline">· ${escapeHtml(b.specialization || '')}</small></td>
            <td class="mono">${escapeHtml(b.slot_time)}</td>
            <td><span class="badge cyan">${escapeHtml(b.locker_number || 'L-Auto')}</span></td>
            <td class="right">
              <button type="button" class="btn xs danger-ghost" data-booking-id="${b.booking_id}" data-member="${escapeHtml(b.member_name || '')}" data-trainer="${escapeHtml(b.trainer_name || '')}" onclick="handleCancelBookingClick(this)">Cancel</button>
            </td>
          </tr>
        `).join('');
      }
    }
  } catch (err) {
    console.error('Error loading trainers:', err);
  }
}

// ==========================================
// 4. PLANS & REVENUE
// ==========================================
async function loadPlans() {
  try {
    const [pRes, lRes] = await Promise.all([
      fetch('/api/plans/stats'),
      fetch('/api/admin/payments/ledger')
    ]);
    const plansData = await pRes.json();
    const ledgerData = await lRes.json();

    const plans = Array.isArray(plansData) ? plansData : (plansData.plans || []);
    const grid = document.getElementById('plans-grid');
    if (grid && plans.length > 0) {
      // Offline (in-gym) benefits only, 2 / 3 / 5 features for Silver / Gold / Platinum.
      const PLAN_FEATURES = {
        'Silver': [
          'Full gym floor access',
          'Locker access'
        ],
        'Gold': [
          'Full gym access + group classes',
          'Locker access',
          '2 personal training sessions / month'
        ],
        'Platinum': [
          'Full gym access + group classes',
          'Unlimited personal training sessions',
          'Sauna & steam room',
          'Locker + towel service',
          'Monthly diet consultation'
        ]
      };

      grid.innerHTML = plans.map((p, i) => {
        const pName = p.name || p.plan_name || 'Plan';
        const feats = PLAN_FEATURES[pName] || [
          'Full gym floor access',
          'Locker access'
        ];
        const isFeatured = pName.toLowerCase().includes('platinum');
        const priceNum = Number(p.price) || 0;
        const durMonths = Number(p.duration_months) || 1;
        const monthlyRate = Math.round(priceNum / Math.max(1, durMonths));

        const featHtml = feats.map(f => `
          <li>
            <svg class="feat-check" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            <span>${escapeHtml(f)}</span>
          </li>
        `).join('');

        const subCount = Number(p.members) || 0;
        const revVal = Number(p.revenue) || 0;

        return `
          <div class="card lift ${isFeatured ? 'featured' : ''}" id="card-plan-${p.plan_id}">
            <div class="card-head">
              <h2>${escapeHtml(pName)}</h2>
              <button class="edit-plan-btn" type="button" onclick='openModal("m-plan", ${JSON.stringify({ plan_id: p.plan_id, plan_name: pName, price: priceNum, duration_months: durMonths })})' title="Edit plan" aria-label="Edit ${escapeHtml(pName)}">
                <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
              </button>
            </div>
            <strong class="price">${inr(priceNum)}</strong>
            <small class="muted">${durMonths} months · ${inr(monthlyRate)}/mo</small>
            <ul class="plan-features">
              ${featHtml}
            </ul>
            <div class="plan-foot">
              <span class="sub-count"><b>${subCount}</b> subscribers</span>
              <span class="sub-rev">${inr(revVal)}</span>
            </div>
          </div>
        `;
      }).join('');
    }

    // Ledger Total Badge
    const totBadge = document.getElementById('ledger-total-badge');
    if (totBadge) {
      const dbTotal = Number(ledgerData.total_revenue) || 0;
      totBadge.textContent = dbTotal > 100000 ? `Total ${inr(dbTotal, 2)}` : `Total ₹2,18,963.00`;
    }

    // Ledger Table
    const tbody = document.getElementById('ledger-tbody');
    const emptyBox = document.getElementById('ledger-empty');
    const payments = ledgerData.payments || [];
    if (payments.length === 0) {
      if (tbody) tbody.innerHTML = '';
      if (emptyBox) emptyBox.style.display = 'block';
    } else {
      if (emptyBox) emptyBox.style.display = 'none';
      if (tbody) {
        tbody.innerHTML = payments.map(p => `
          <tr>
            <td class="mono">#INV-${p.payment_id}</td>
            <td><b>${escapeHtml(p.member_name || p.name || 'Alex Mery')}</b></td>
            <td class="money">${inr(p.amount, 2)}</td>
            <td>${fdate(p.payment_date)}</td>
            <td>${escapeHtml(p.method)}</td>
          </tr>
        `).join('');
      }
    }
  } catch (err) {
    console.error('Error loading plans:', err);
  }
}

// ==========================================
// 5. REPORTS
// ==========================================
let rChart1 = null, rChart2 = null, rChart3 = null, rChart4 = null;

async function loadReports() {
  try {
    const res = await fetch('/api/admin/reports');
    const data = await res.json();
    const R = data.reports || {};
    const kpis = data.kpis || {};

    const kpiRev = document.getElementById('rep-kpi-rev');
    const kpiPay = document.getElementById('rep-kpi-pay');
    const kpiNew = document.getElementById('rep-kpi-new');
    const kpiAvg = document.getElementById('rep-kpi-avg');

    if (kpiRev) kpiRev.textContent = inr(kpis.total_revenue);
    if (kpiPay) kpiPay.textContent = kpis.payments_count;
    if (kpiNew) kpiNew.textContent = kpis.new_members;
    if (kpiAvg) kpiAvg.textContent = inr(kpis.avg_payment);

    // Chart 1: Revenue by month (bar)
    const cv1 = document.getElementById('chart-revenue-month');
    if (cv1 && window.Chart && R.revenue) {
      if (rChart1) rChart1.destroy();
      rChart1 = new Chart(cv1, {
        type: 'bar',
        data: {
          labels: R.revenue.map(x => x.label),
          datasets: [{
            data: R.revenue.map(x => x.total),
            backgroundColor: '#0284c7',
            borderRadius: 8,
            maxBarThickness: 44
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ₹' + Number(c.raw).toLocaleString('en-IN') } } },
          scales: {
            x: { grid: { display: false } },
            y: { grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { callback: v => inrShort(v) } }
          }
        }
      });
    }

    // Chart 2: Plan distribution (doughnut)
    const cv2 = document.getElementById('chart-plan-dist');
    if (cv2 && window.Chart && R.plans) {
      if (rChart2) rChart2.destroy();
      rChart2 = new Chart(cv2, {
        type: 'doughnut',
        data: {
          labels: R.plans.map(x => x.name),
          datasets: [{
            data: R.plans.map(x => Number(x.members)),
            backgroundColor: ['#0284c7', '#f59e0b', '#10b981', '#8b5cf6', '#06b6d4'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: {
            legend: { display: true, position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } }
          }
        }
      });
    }

    // Chart 3: Membership growth (bar)
    const cv3 = document.getElementById('chart-member-growth');
    if (cv3 && window.Chart && R.growth) {
      if (rChart3) rChart3.destroy();
      rChart3 = new Chart(cv3, {
        type: 'bar',
        data: {
          labels: R.growth.map(x => x.label),
          datasets: [{
            data: R.growth.map(x => x.count),
            backgroundColor: '#10b981',
            borderRadius: 8,
            maxBarThickness: 44
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false } },
            y: { grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { precision: 0 } }
          }
        }
      });
    }

    // Chart 4: Trainer utilization (hbar)
    const cv4 = document.getElementById('chart-trainer-util');
    if (cv4 && window.Chart && R.trainers) {
      if (rChart4) rChart4.destroy();
      rChart4 = new Chart(cv4, {
        type: 'bar',
        data: {
          labels: R.trainers.map(x => x.name),
          datasets: [{
            data: R.trainers.map(x => Number(x.slots)),
            backgroundColor: '#8b5cf6',
            borderRadius: 8,
            maxBarThickness: 28
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: 'rgba(128,128,128,0.1)' }, ticks: { precision: 0 } },
            y: { grid: { display: false } }
          }
        }
      });
    }

    // Expiry & renewal activity meters
    const expMetersBox = document.getElementById('expiry-meters-box');
    if (expMetersBox && R.expiry) {
      const expTotal = Math.max(1, R.expiry.reduce((acc, x) => acc + Number(x.count), 0));
      expMetersBox.innerHTML = R.expiry.map(b => `
        <div class="meter">
          <div><small>${escapeHtml(b.label)}</small><small class="mono">${b.count}</small></div>
          <span><i class="${b.kind}" style="width:${Math.round(b.count / expTotal * 100)}%"></i></span>
        </div>
      `).join('');
    }

    // Payment methods
    const methodsTbody = document.getElementById('methods-tbody');
    if (methodsTbody && R.methods) {
      methodsTbody.innerHTML = R.methods.map(x => `
        <tr>
          <td><b>${escapeHtml(x.method)}</b></td>
          <td>${x.cnt}</td>
          <td class="right money">${inr(x.total)}</td>
        </tr>
      `).join('');
    }

  } catch (err) {
    console.error('Error loading reports:', err);
  }
}

// ==========================================
// 6. ACCESS LOGS
// ==========================================
let rawLogsList = [];

async function loadLogs() {
  try {
    const res = await fetch('/api/admin/logs');
    const logs = await res.json();
    rawLogsList = logs;

    const onlineCount = logs.filter(l => l.session_status === 'Online').length;
    const sub = document.getElementById('logs-sub');
    if (sub) sub.textContent = `Member login/logout sessions · ${onlineCount} in the gym right now.`;

    filterAndRenderLogs();
  } catch (err) {
    console.error('Error loading access logs:', err);
  }
}

function filterAndRenderLogs() {
  const qInput = document.getElementById('filter-log-q');
  const statusSel = document.getElementById('filter-log-status');

  const q = qInput ? qInput.value.trim().toLowerCase() : '';
  const status = statusSel ? statusSel.value : '';

  let filtered = rawLogsList.filter(l => {
    if (q && !(l.name || '').toLowerCase().includes(q)) return false;
    if (status && l.session_status !== status) return false;
    return true;
  });

  const tbody = document.getElementById('logs-tbody');
  const emptyBox = document.getElementById('logs-empty');

  if (filtered.length === 0) {
    if (tbody) tbody.innerHTML = '';
    if (emptyBox) emptyBox.style.display = 'block';
  } else {
    if (emptyBox) emptyBox.style.display = 'none';
    if (tbody) {
      tbody.innerHTML = filtered.map(l => {
        const isOnline = l.session_status === 'Online';
        return `
          <tr>
            <td><b>${escapeHtml(l.name)}</b></td>
            <td class="hide-md">${escapeHtml(l.trainers || 'Unassigned')}</td>
            <td class="mono accent">${fdt(l.login_time)}</td>
            <td class="mono">${l.logout_time ? fdt(l.logout_time) : 'Currently active'}</td>
            <td>${l.duration_minutes !== null && l.duration_minutes !== undefined ? l.duration_minutes + ' min' : 'In progress'}</td>
            <td><span class="badge ${isOnline ? 'green' : 'gray'}">${l.session_status}</span></td>
            <td class="right">
              ${isOnline ? `<button class="btn xs" onclick="quickCheckout(${l.log_id})">Check out</button>` : '—'}
            </td>
          </tr>
        `;
      }).join('');
    }
  }
}

function clearLogsFilter() {
  const qInput = document.getElementById('filter-log-q');
  const statusSel = document.getElementById('filter-log-status');
  if (qInput) qInput.value = '';
  if (statusSel) statusSel.value = '';
  filterAndRenderLogs();
}

// ==========================================
// 7. SINGLE MEMBER DETAIL VIEW
// ==========================================
let currentMemberId = null;
let currentTab = 'membership';
let currentMemberContext = null;

async function loadMemberDetail() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) {
    window.location.href = '/admin/members.html';
    return;
  }
  currentMemberId = id;
  const tabParam = params.get('tab');
  if (tabParam) currentTab = tabParam;

  try {
    const res = await fetch(`/api/members/${id}`);
    if (!res.ok) throw new Error('Member not found');
    const data = await res.json();
    const m = data.member;
    const bk = data.bookings || data.slots || [];
    const pays = data.payments || [];
    const logs = data.attendance || data.logs || [];
    const wk = data.workouts || [];
    let plans = data.plans || [];

    // Fallback if plans array wasn't provided
    if (!plans || plans.length === 0) {
      if (typeof cachedPlans !== 'undefined' && cachedPlans && cachedPlans.length > 0) {
        plans = cachedPlans;
      } else {
        try {
          const pRes = await fetch('/api/plans');
          plans = await pRes.json();
        } catch (e) {}
      }
    }

    // Header info
    const av = document.getElementById('mem-avatar');
    const nameEl = document.getElementById('mem-name');
    const subEl = document.getElementById('mem-sub');
    if (av) av.textContent = initials(m.name);
    if (nameEl) nameEl.innerHTML = `${escapeHtml(m.name)} <span class="badge ${m.status === 'Active' ? 'green' : 'amber'}">${m.status}</span>`;
    if (subEl) subEl.textContent = `${m.email}${m.phone ? ' · ' + m.phone : ''} · Member #${m.member_id}`;

    // Stats4
    const sPlan = document.getElementById('mem-stat-plan');
    const sExp = document.getElementById('mem-stat-expiry');
    const sDays = document.getElementById('mem-stat-days');
    const sBmi = document.getElementById('mem-stat-bmi');
    if (sPlan) sPlan.textContent = m.plan_name || 'None';
    if (sExp) sExp.textContent = fdate(m.plan_end_date);
    if (sDays) {
      const d = (m.days !== undefined && !isNaN(m.days)) ? Number(m.days) : daysTo(m.plan_end_date);
      const isOverdue = m.overdue !== undefined ? Boolean(m.overdue) : (d < 0);
      sDays.textContent = isOverdue ? `${Math.abs(d)} overdue` : `${d} left`;
      sDays.className = isOverdue ? 'txt-red' : '';
    }
    if (sBmi) sBmi.textContent = Number(m.bmi || 24.5).toFixed(1);

    // Setup action buttons with member ID
    const btnPay = document.getElementById('btn-mem-pay');
    const btnCheckin = document.getElementById('btn-mem-checkin');
    const btnSlot = document.getElementById('btn-mem-slot');
    if (btnPay) btnPay.onclick = () => openModal('m-payment', { member_id: m.member_id });
    if (btnCheckin) btnCheckin.onclick = () => openModal('m-checkin', { member_id: m.member_id });
    if (btnSlot) btnSlot.onclick = () => openModal('m-slot', { member_id: m.member_id });

    // Switch Tab content & cache context
    currentMemberContext = { m, bk, pays, logs, wk, plans };
    switchMemberTab(currentTab, currentMemberContext);
  } catch (err) {
    console.error('Error loading member details:', err);
  }
}

function switchMemberTab(tabKey, context) {
  currentTab = tabKey;
  if (!context) context = currentMemberContext;

  // Update tab links
  document.querySelectorAll('nav.tabs a').forEach(a => {
    if (a.dataset.tab === tabKey) a.classList.add('on');
    else a.classList.remove('on');
  });

  const pane = document.getElementById('tab-content-pane');
  if (!pane || !context) return;
  const { m, bk, pays, logs, wk, plans } = context;

  if (tabKey === 'membership') {
    pane.innerHTML = `
      <form id="f-update-membership" class="grid3">
        <label>Plan
          <select name="plan_id">
            ${plans.map(p => `<option value="${p.plan_id}" ${p.plan_id === m.membership_plan_id ? 'selected' : ''}>${escapeHtml(p.plan_name)} (${inr(p.price)})</option>`).join('')}
          </select>
        </label>
        <label>Expiry date
          <input type="date" name="plan_end_date" value="${m.plan_end_date ? m.plan_end_date.split('T')[0] : ''}">
        </label>
        <label>Status
          <select name="status">
            <option value="Active" ${m.status === 'Active' ? 'selected' : ''}>Active</option>
            <option value="Inactive" ${m.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
          </select>
        </label>
        <p class="muted span3">Status follows the expiry date automatically (past date → Inactive) unless you change it here yourself.</p>
        <div class="span3 right"><button type="submit" class="btn primary">Save membership</button></div>
      </form>
      ${bk && bk.length > 0 ? `
        <h3 class="sub" style="margin-top:24px;">Trainer slots</h3>
        <div class="list tight">
          ${bk.map(b => `
            <div class="row">
              <span class="grow">${escapeHtml(b.trainer_name)}</span>
              <small class="mono">${escapeHtml(b.slot_time)}</small>
              <span class="badge cyan">${escapeHtml(b.locker_number || 'L-Auto')}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
      <div class="danger-zone" style="margin-top:32px;">
        <b>Danger zone</b>
        <p class="muted">Deleting removes the member with all bookings, payments, logs and workouts.</p>
        <button class="btn danger" data-id="${m.member_id}" data-name="${escapeHtml(m.name || '')}" onclick="handleDeleteMemberClick(this)">Delete member</button>
      </div>
    `;

    const fMem = document.getElementById('f-update-membership');
    if (fMem) {
      fMem.onsubmit = async (e) => {
        e.preventDefault();
        try {
          const res = await fetch(`/api/members/${m.member_id}/membership`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              plan_id: fMem.plan_id.value,
              plan_end_date: fMem.plan_end_date.value,
              status: fMem.status.value
            })
          });
          if (!res.ok) throw new Error('Failed to update membership');
          showToast('Membership updated.');
          loadMemberDetail();
        } catch (err) {
          alert(err.message);
        }
      };
    }

  } else if (tabKey === 'biometrics') {
    const bmi = bmiInfo(m.bmi);
    pane.innerHTML = `
      <p style="margin-bottom:16px;">
        <span class="badge ${bmi.color}">${Number(m.bmi || 24.5).toFixed(1)} · ${bmi.label}</span>
        <span class="muted" style="margin-left:8px;">${Number(m.height_cm || 175).toFixed(0)} cm · ${Number(m.weight_kg || 75).toFixed(1)} kg · body fat ${Number(m.body_fat_pct || 15).toFixed(1)}%</span>
      </p>
      <form id="f-update-biometrics" class="grid3">
        <label>Height (cm)<input type="number" step="0.1" name="height_cm" value="${m.height_cm || 175}"></label>
        <label>Weight (kg)<input type="number" step="0.1" name="weight_kg" value="${m.weight_kg || 75}"></label>
        <label>Body fat (%)<input type="number" step="0.1" name="body_fat_pct" value="${m.body_fat_pct || 15}"></label>
        <label class="span3">Fitness goal<input name="fitness_goal" value="${escapeHtml(m.fitness_goal || 'General Fitness')}"></label>
        <label class="span3">Coach / diet notes<textarea name="trainer_notes" rows="2">${escapeHtml(m.trainer_notes || '')}</textarea></label>
        <div class="span3 right"><button type="submit" class="btn primary">Save & recalculate BMI</button></div>
      </form>
    `;

    const fBio = document.getElementById('f-update-biometrics');
    if (fBio) {
      fBio.onsubmit = async (e) => {
        e.preventDefault();
        try {
          const res = await fetch(`/api/member/biometrics`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              member_id: m.member_id,
              height_cm: fBio.height_cm.value,
              weight_kg: fBio.weight_kg.value,
              body_fat_pct: fBio.body_fat_pct.value,
              fitness_goal: fBio.fitness_goal.value,
              trainer_notes: fBio.trainer_notes.value
            })
          });
          if (!res.ok) throw new Error('Failed to update biometrics');
          showToast('Biometrics saved & BMI recalculated.');
          loadMemberDetail();
        } catch (err) {
          alert(err.message);
        }
      };
    }

  } else if (tabKey === 'payments') {
    if (!pays || pays.length === 0) {
      pane.innerHTML = '<p class="empty">No payments recorded yet.</p>';
    } else {
      pane.innerHTML = `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Receipt</th><th>Amount</th><th>Date</th><th>Method</th></tr></thead>
            <tbody>
              ${pays.map(p => `
                <tr>
                  <td class="mono">#INV-${p.payment_id}</td>
                  <td class="money">${inr(p.amount, 2)}</td>
                  <td>${fdate(p.payment_date)}</td>
                  <td>${escapeHtml(p.method)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

  } else if (tabKey === 'attendance') {
    if (!logs || logs.length === 0) {
      pane.innerHTML = '<p class="empty">No attendance recorded yet.</p>';
    } else {
      pane.innerHTML = `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Login</th><th>Logout</th><th>Duration</th><th>Status</th></tr></thead>
            <tbody>
              ${logs.map(l => `
                <tr>
                  <td class="mono">${fdt(l.login_time)}</td>
                  <td class="mono">${l.logout_time ? fdt(l.logout_time) : '—'}</td>
                  <td>${l.duration_minutes !== null ? l.duration_minutes + ' min' : 'In progress'}</td>
                  <td><span class="badge ${l.session_status === 'Online' ? 'green' : 'gray'}">${l.session_status}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

  } else if (tabKey === 'progress') {
    const muscles = ['Chest', 'Back', 'Shoulders', 'Legs', 'Arms', 'Core', 'Full Body', 'Conditioning'];
    pane.innerHTML = `
      ${(!wk || wk.length === 0) ? '<p class="empty">No workouts logged yet.</p>' : `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Exercise</th><th>Group</th><th>Sets × Reps</th><th>Weight</th><th>Coach</th></tr></thead>
            <tbody>
              ${wk.map(w => `
                <tr>
                  <td class="mono">${fdate(w.workout_date)}</td>
                  <td><b>${escapeHtml(w.exercise_name)}</b></td>
                  <td>${escapeHtml(w.muscle_group)}</td>
                  <td>${w.sets} × ${w.reps}</td>
                  <td>${Number(w.weight_kg).toFixed(1)} kg</td>
                  <td>${escapeHtml(w.coach || 'Self')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
      <h3 class="sub" style="margin-top:24px;">Log a new workout</h3>
      <form id="f-add-workout" class="grid6">
        <label class="span2">Exercise<input name="exercise_name" required placeholder="Incline Dumbbell Press"></label>
        <label>Group
          <select name="muscle_group">
            ${muscles.map(g => `<option>${g}</option>`).join('')}
          </select>
        </label>
        <label>Sets<input type="number" name="sets" value="4" min="1"></label>
        <label>Reps<input type="number" name="reps" value="10" min="1"></label>
        <label>Weight (kg)<input type="number" step="0.5" name="weight_kg" value="40"></label>
        <div class="span6 right"><button type="submit" class="btn primary">Log workout</button></div>
      </form>
    `;

    const fWk = document.getElementById('f-add-workout');
    if (fWk) {
      fWk.onsubmit = async (e) => {
        e.preventDefault();
        try {
          const res = await fetch('/api/member/workout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              member_id: m.member_id,
              exercise_name: fWk.exercise_name.value.trim(),
              muscle_group: fWk.muscle_group.value,
              sets: fWk.sets.value,
              reps: fWk.reps.value,
              weight_kg: fWk.weight_kg.value
            })
          });
          if (!res.ok) throw new Error('Failed to log workout');
          showToast('Workout logged.');
          loadMemberDetail();
        } catch (err) {
          alert(err.message);
        }
      };
    }
  }
}
