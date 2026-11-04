const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = require('./db');
const { sendCredentialsEmail } = require('./mailService');
const { buildReports } = require('./reportService');

const app = express();
const PORT = process.env.PORT || 3000;

// Allowed standard email domains for verification
const ALLOWED_DOMAINS = [
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com',
  'live.com', 'msn.com', 'yahoo.com', 'yahoo.in', 'yahoo.co.uk',
  'icloud.com', 'me.com', 'mac.com', 'proton.me', 'protonmail.com',
  'zoho.com', 'zohomail.in', 'ironpulse.com'
];

async function notify(role, recipientId, actor, category, message) {
  try {
    await pool.query(
      'INSERT INTO System_Notifications (recipient_role, recipient_id, actor_name, category, message) VALUES (?, ?, ?, ?, ?)',
      [role, Number(recipientId) || 0, String(actor || 'System').slice(0, 100), category, String(message).slice(0, 255)]
    );
  } catch (err) {
    console.error('Notification insert error:', err.message);
  }
}

function isAllowedDomain(email) {
  if (!email || !email.includes('@')) return false;
  const domain = email.split('@')[1].toLowerCase().trim();
  return ALLOWED_DOMAINS.includes(domain);
}

// Middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 1. AUTHENTICATION (LOGIN)
// ==========================================
async function handleLogin(req, res) {
  const { email, password, role } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Please enter both email and password.' });
  }

  const userRole = (role || 'member').toLowerCase();
  const table = userRole === 'admin' ? 'Admins' : (userRole === 'trainer' ? 'Trainers' : 'Members');
  const idCol = userRole === 'admin' ? 'admin_id' : (userRole === 'trainer' ? 'trainer_id' : 'member_id');

  try {
    const [rows] = await pool.query(`SELECT * FROM ${table} WHERE email = ?`, [email.trim()]);
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: `No ${userRole} account found with that email.` });
    }

    const isHash = String(user.password).startsWith('$2');
    const match = isHash ? await bcrypt.compare(password, user.password) : user.password === password;

    if (!match) {
      return res.status(401).json({ error: 'Incorrect password for selected account.' });
    }

    res.json({
      success: true,
      user: {
        id: user[idCol],
        name: user.name,
        email: user.email,
        role: userRole
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login.' });
  }
}

app.post('/api/login', handleLogin);
app.post('/login', handleLogin);

// ==========================================
// 2. FORGOT PASSWORD (CREDENTIALS DISPATCH)
// ==========================================
async function handleForgot(req, res) {
  const { email } = req.body;

  if (!isAllowedDomain(email)) {
    return res.status(400).json({
      error: 'Only recognized email providers (Gmail, Outlook, Yahoo, iCloud, Proton, Zoho, or IronPulse) are supported.'
    });
  }

  try {
    let user = null;
    let role = '';
    let table = '';
    let idCol = '';

    // Check Admin
    const [admins] = await pool.query('SELECT * FROM Admins WHERE email = ?', [email]);
    if (admins.length > 0) {
      user = admins[0];
      role = 'admin';
      table = 'Admins';
      idCol = 'admin_id';
    }

    // Check Trainer
    if (!user) {
      const [trainers] = await pool.query('SELECT * FROM Trainers WHERE email = ?', [email]);
      if (trainers.length > 0) {
        user = trainers[0];
        role = 'trainer';
        table = 'Trainers';
        idCol = 'trainer_id';
      }
    }

    // Check Member
    if (!user) {
      const [members] = await pool.query('SELECT * FROM Members WHERE email = ?', [email]);
      if (members.length > 0) {
        user = members[0];
        role = 'member';
        table = 'Members';
        idCol = 'member_id';
      }
    }

    if (!user) {
      return res.status(404).json({ error: 'No gym account registered with this email.' });
    }

    const newPassword = `Iron@${Math.floor(1000 + Math.random() * 9000)}`;
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query(`UPDATE ${table} SET password = ? WHERE ${idCol} = ?`, [hashedPassword, user[idCol]]);

    const mailResult = await sendCredentialsEmail({
      to: user.email,
      name: user.name,
      role: role,
      newPassword: newPassword,
      loginUrl: `http://localhost:${PORT}/index.html`
    });

    res.json({
      success: true,
      message: `Fresh login credentials have been sent directly to your registered email address (${user.email}).`,
      email: user.email,
      role: role
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Server error processing password recovery.' });
  }
}

app.post('/api/forgot-password', handleForgot);
app.post('/forgot-password', handleForgot);

// ==========================================
// 3. GYM STATS & OVERVIEW
// ==========================================
app.get('/api/stats', async (req, res) => {
  try {
    const [[{ total_members }]] = await pool.query('SELECT COUNT(*) AS total_members FROM Members');
    const [[{ active_members }]] = await pool.query("SELECT COUNT(*) AS active_members FROM Members WHERE status = 'Active'");
    const [[{ total_trainers }]] = await pool.query('SELECT COUNT(*) AS total_trainers FROM Trainers');
    const [[{ total_plans }]] = await pool.query('SELECT COUNT(*) AS total_plans FROM Membership_Plans');
    const [[{ total_revenue }]] = await pool.query('SELECT COALESCE(SUM(amount), 0) AS total_revenue FROM Payments');
    const [[{ pay_count }]] = await pool.query('SELECT COUNT(*) AS pay_count FROM Payments');
    const [[{ log_count }]] = await pool.query('SELECT COUNT(*) AS log_count FROM Member_Access_Logs');
    const [[{ online_now }]] = await pool.query("SELECT COUNT(*) AS online_now FROM Member_Access_Logs WHERE session_status = 'Online'");
    const [[{ today_in }]] = await pool.query('SELECT COUNT(*) AS today_in FROM Member_Access_Logs WHERE DATE(login_time) = CURDATE()');
    const [[{ slot_count }]] = await pool.query('SELECT COUNT(*) AS slot_count FROM Slot_Bookings');
    const [unreadRows] = await pool.query("SELECT COUNT(*) AS unread FROM System_Notifications WHERE recipient_role IN ('admin', 'all') AND is_read = 0");
    const unread = unreadRows[0]?.unread || 0;

    res.json({
      members: total_members,
      trainers: total_trainers,
      plans: total_plans,
      logs: log_count,
      total_members,
      active_members,
      inactive_members: total_members - active_members,
      total_trainers,
      total_revenue,
      pay_count,
      today_checkins: today_in,
      online: online_now,
      slots: slot_count,
      unread
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch gym statistics.' });
  }
});

app.get('/api/admin/dashboard', async (req, res) => {
  try {
    const [members] = await pool.query(`
      SELECT m.*, p.plan_name, p.price AS plan_price,
             COALESCE(b.bmi, 24.5) AS bmi
      FROM Members m
      LEFT JOIN Membership_Plans p ON m.membership_plan_id = p.plan_id
      LEFT JOIN Member_Biometrics b ON m.member_id = b.member_id
      ORDER BY m.member_id ASC
    `);
    const todayStr = new Date().toISOString().split('T')[0];
    const mappedMembers = members.map(r => {
      const days = r.plan_end_date ? Math.floor((new Date(r.plan_end_date) - new Date(todayStr)) / (1000 * 60 * 60 * 24)) : 0;
      const overdue = r.plan_end_date ? (new Date(r.plan_end_date) < new Date(todayStr)) : false;
      return { ...r, days, overdue };
    });

    const active = mappedMembers.filter(m => m.status === 'Active');
    const overdue = mappedMembers.filter(m => m.overdue).sort((a, b) => a.days - b.days);
    const expiring = mappedMembers.filter(m => !m.overdue && m.days <= 30 && m.status === 'Active').sort((a, b) => a.days - b.days);

    const [[{ rev_total }]] = await pool.query('SELECT COALESCE(SUM(amount), 0) AS rev_total FROM Payments');
    const [[{ pay_count }]] = await pool.query('SELECT COUNT(*) AS pay_count FROM Payments');
    const outstanding = overdue.reduce((sum, m) => sum + (Number(m.plan_price) || 0), 0);

    const [[{ today_in }]] = await pool.query('SELECT COUNT(*) AS today_in FROM Member_Access_Logs WHERE DATE(login_time) = CURDATE()');
    const [[{ online_now }]] = await pool.query("SELECT COUNT(*) AS online_now FROM Member_Access_Logs WHERE session_status = 'Online'");
    const [[{ slot_count }]] = await pool.query('SELECT COUNT(*) AS slot_count FROM Slot_Bookings');

    const [recentPay] = await pool.query(`
      SELECT p.*, m.name
      FROM Payments p
      JOIN Members m ON p.member_id = m.member_id
      ORDER BY p.payment_date DESC, p.payment_id DESC LIMIT 6
    `);
    const [attendance] = await pool.query(`
      SELECT l.*, m.name
      FROM Member_Access_Logs l
      JOIN Members m ON l.member_id = m.member_id
      ORDER BY l.login_time DESC LIMIT 6
    `);
    const [bookings] = await pool.query(`
      SELECT s.*, m.name AS member_name, t.name AS trainer_name
      FROM Slot_Bookings s
      JOIN Members m ON s.member_id = m.member_id
      JOIN Trainers t ON s.trainer_id = t.trainer_id
      ORDER BY s.booking_id DESC LIMIT 6
    `);

    const [[{ total_trainers }]] = await pool.query('SELECT COUNT(*) AS total_trainers FROM Trainers');
    const [[{ total_plans }]] = await pool.query('SELECT COUNT(*) AS total_plans FROM Membership_Plans');
    const [[{ log_count }]] = await pool.query('SELECT COUNT(*) AS log_count FROM Member_Access_Logs');

    let R = { revenue: [] };
    try {
      R = await buildReports();
    } catch (e) {
      console.error('buildReports error:', e);
    }

    const [unreadRows] = await pool.query("SELECT COUNT(*) AS unread FROM System_Notifications WHERE recipient_role IN ('admin', 'all') AND is_read = 0");

    res.json({
      revenue: rev_total,
      payCount: pay_count,
      total_members: members.length,
      active_members: active.length,
      inactive_members: members.length - active.length,
      outstanding,
      overdue_count: overdue.length,
      expiring_count: expiring.length,
      today_in,
      online_now,
      slot_count,
      revenue_trend: R.revenue || [],
      expiring,
      overdue,
      recent_payments: recentPay,
      attendance,
      bookings,
      counts: {
        members: members.length,
        trainers: total_trainers,
        plans: total_plans,
        logs: log_count
      },
      unread: unreadRows[0]?.unread || 0
    });
  } catch (err) {
    console.error('Admin dashboard API error:', err);
    res.status(500).json({ error: 'Failed to fetch admin dashboard data: ' + err.message });
  }
});

// ==========================================
// 4. MEMBERS API
// ==========================================
app.get('/api/members', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT m.member_id, m.name, m.email, m.phone, m.status, m.plan_end_date,
             COALESCE(p.plan_name, 'Standard Plan') AS plan_name,
             b.height_cm, b.weight_kg, b.bmi, b.body_fat_pct, b.fitness_goal, b.trainer_notes
      FROM Members m
      LEFT JOIN Membership_Plans p ON m.membership_plan_id = p.plan_id
      LEFT JOIN Member_Biometrics b ON m.member_id = b.member_id
      ORDER BY m.member_id DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch members.' });
  }
});

app.post('/api/members', async (req, res) => {
  const { name, email, phone, plan_id, plan_end_date, password, height_cm, weight_kg, fitness_goal } = req.body;

  if (!isAllowedDomain(email)) {
    return res.status(400).json({
      error: 'Only recognized email providers (Gmail, Outlook, Yahoo, iCloud, Proton, Zoho, or IronPulse) are supported.'
    });
  }

  try {
    const rawPassword = password || `Iron@${Math.floor(1000 + Math.random() * 9000)}`;
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    const [result] = await pool.query(
      `INSERT INTO Members (name, email, password, phone, membership_plan_id, plan_end_date, status)
       VALUES (?, ?, ?, ?, ?, ?, 'Active')`,
      [name, email, hashedPassword, phone || null, plan_id || 1, plan_end_date || new Date(Date.now() + 365*24*60*60*1000)]
    );

    const newMemberId = result.insertId;

    const h = (Number(height_cm) || 175) / 100;
    const w = Number(weight_kg) || 75;
    const bmi = (w / (h * h)).toFixed(1);

    await pool.query(
      `INSERT INTO Member_Biometrics (member_id, height_cm, weight_kg, bmi, fitness_goal)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE height_cm = VALUES(height_cm), weight_kg = VALUES(weight_kg), bmi = VALUES(bmi), fitness_goal = VALUES(fitness_goal)`,
      [newMemberId, height_cm || 175, weight_kg || 75, bmi, fitness_goal || 'General Fitness']
    );

    const [plan] = await pool.query('SELECT price FROM Membership_Plans WHERE plan_id = ?', [plan_id || 1]);
    const planPrice = plan.length > 0 ? plan[0].price : 18000;
    await pool.query(
      `INSERT INTO Payments (member_id, amount, payment_date, method) VALUES (?, ?, CURDATE(), 'Cash')`,
      [newMemberId, planPrice]
    );

    const mailResult = await sendCredentialsEmail({
      to: email,
      name: name,
      role: 'member',
      newPassword: rawPassword,
      loginUrl: `http://localhost:${PORT}/index.html`
    });

    res.json({
      success: true,
      member_id: newMemberId,
      previewUrl: mailResult.previewUrl
    });
  } catch (err) {
    console.error('Add member error:', err);
    res.status(500).json({ error: 'Could not enroll member: ' + err.message });
  }
});

app.delete('/api/members/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM Members WHERE member_id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete member: ' + err.message });
  }
});

// ==========================================
// 5. TRAINERS API
// ==========================================
app.get('/api/trainers', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT t.trainer_id, t.name, t.email, t.specialization,
             COUNT(DISTINCT s.member_id) AS assigned_clients,
             COUNT(s.booking_id) AS assigned_count
      FROM Trainers t
      LEFT JOIN Slot_Bookings s ON t.trainer_id = s.trainer_id
      GROUP BY t.trainer_id, t.name, t.email, t.specialization
      ORDER BY t.trainer_id DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch trainers.' });
  }
});

app.post('/api/trainers', async (req, res) => {
  const { name, email, specialization, password } = req.body;

  if (!isAllowedDomain(email)) {
    return res.status(400).json({
      error: 'Only recognized email providers (Gmail, Outlook, Yahoo, iCloud, Proton, Zoho, or IronPulse) are supported.'
    });
  }

  try {
    const rawPassword = password || 'password123';
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    const [result] = await pool.query(
      `INSERT INTO Trainers (name, email, password, specialization, contact_email)
       VALUES (?, ?, ?, ?, ?)`,
      [name, email, hashedPassword, specialization || 'General Fitness', email]
    );

    await sendCredentialsEmail({
      to: email,
      name: name,
      role: 'trainer',
      newPassword: rawPassword,
      loginUrl: `http://localhost:${PORT}/index.html`
    });

    res.json({ success: true, trainer_id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add trainer: ' + err.message });
  }
});

app.delete('/api/trainers/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM Trainers WHERE trainer_id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete trainer: ' + err.message });
  }
});

// ==========================================
// 6. MEMBERSHIP PLANS API
// ==========================================
app.get('/api/plans', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM Membership_Plans ORDER BY duration_months ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch plans.' });
  }
});

app.get('/api/plans/stats', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.plan_id, p.plan_name AS name, p.duration_months, p.price,
             COUNT(DISTINCT m.member_id) AS members,
             COALESCE(SUM(pay.amount), 0) AS revenue
      FROM Membership_Plans p
      LEFT JOIN Members m ON p.plan_id = m.membership_plan_id
      LEFT JOIN Payments pay ON m.member_id = pay.member_id
      GROUP BY p.plan_id, p.plan_name, p.duration_months, p.price
      ORDER BY p.price DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch plan stats: ' + err.message });
  }
});

app.post('/api/plans', async (req, res) => {
  const { plan_id, plan_name, duration_months, price } = req.body;
  try {
    if (plan_id && Number(plan_id) > 0) {
      await pool.query(
        'UPDATE Membership_Plans SET plan_name = ?, duration_months = ?, price = ? WHERE plan_id = ?',
        [plan_name, Number(duration_months) || 12, Number(price) || 0, plan_id]
      );
      res.json({ success: true, plan_id });
    } else {
      const [result] = await pool.query(
        'INSERT INTO Membership_Plans (plan_name, duration_months, price) VALUES (?, ?, ?)',
        [plan_name, Number(duration_months) || 12, Number(price) || 0]
      );
      res.json({ success: true, plan_id: result.insertId });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to save plan: ' + err.message });
  }
});

// ==========================================
// 7. SLOT BOOKINGS API
// ==========================================
app.get('/api/bookings', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT s.booking_id, s.slot_time, s.locker_number,
             m.name AS member_name,
             t.name AS trainer_name,
             t.specialization
      FROM Slot_Bookings s
      JOIN Members m ON s.member_id = m.member_id
      JOIN Trainers t ON s.trainer_id = t.trainer_id
      ORDER BY s.booking_id DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch slot bookings.' });
  }
});

app.post('/api/bookings', async (req, res) => {
  const { member_id, trainer_id, slot_time, locker_number } = req.body;
  try {
    const [result] = await pool.query(
      `INSERT INTO Slot_Bookings (member_id, trainer_id, slot_time, locker_number)
       VALUES (?, ?, ?, ?)`,
      [member_id, trainer_id, slot_time, locker_number || 'L-101']
    );
    const [[m]] = await pool.query('SELECT name FROM Members WHERE member_id = ?', [member_id]);
    if (m) await notify('trainer', trainer_id, m.name, 'New Client Slot', `${m.name} booked your ${slot_time} slot (${locker_number || 'L-101'}).`);
    res.json({ success: true, booking_id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create booking: ' + err.message });
  }
});

app.delete('/api/bookings/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM Slot_Bookings WHERE booking_id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel booking: ' + err.message });
  }
});

app.post('/api/trainer/cancel-slot', async (req, res) => {
  const { booking_id, trainer_id, member_id, reason } = req.body;
  try {
    let mId = member_id;
    let sTime = '';
    let lNum = '';

    if (booking_id) {
      const [[b]] = await pool.query('SELECT member_id, slot_time, locker_number FROM Slot_Bookings WHERE booking_id = ?', [booking_id]);
      if (b) {
        mId = mId || b.member_id;
        sTime = b.slot_time || '';
        lNum = b.locker_number || '';
      }
      await pool.query('DELETE FROM Slot_Bookings WHERE booking_id = ?', [booking_id]);
    } else if (trainer_id && member_id) {
      const [[b]] = await pool.query('SELECT booking_id, slot_time, locker_number FROM Slot_Bookings WHERE trainer_id = ? AND member_id = ? LIMIT 1', [trainer_id, member_id]);
      if (b) {
        sTime = b.slot_time || '';
        lNum = b.locker_number || '';
        await pool.query('DELETE FROM Slot_Bookings WHERE booking_id = ?', [b.booking_id]);
      }
    }

    const [[t]] = await pool.query('SELECT name FROM Trainers WHERE trainer_id = ?', [trainer_id || 0]);
    const trainerName = t ? t.name : 'Your Coach';
    const cleanReason = (reason || 'Scheduling conflict').trim();

    if (mId) {
      const slotDetail = sTime ? ` (${sTime})` : '';
      await notify(
        'member',
        mId,
        trainerName,
        'Slot Cancelled',
        `Your training session${slotDetail} was cancelled by ${trainerName}. Reason: "${cleanReason}". Please book another slot when available.`
      );
    }

    // Also notify admin
    await notify(
      'admin',
      0,
      trainerName,
      'Slot Cancelled',
      `Trainer ${trainerName} cancelled client slot${sTime ? ' ' + sTime : ''}. Reason: ${cleanReason}`
    );

    res.json({ success: true, message: 'Slot cancelled and member notified successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel slot: ' + err.message });
  }
});

// ==========================================
// 8. TRAINER APIS (CLIENTS, BIOMETRICS, WORKOUTS)
// ==========================================
app.get('/api/trainer/:id/clients', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM Trainer_Assigned_View WHERE trainer_id = ?',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch trainer clients.' });
  }
});

app.post('/api/trainer/biometrics', async (req, res) => {
  const { member_id, trainer_id, height_cm, weight_kg, body_fat_pct, fitness_goal, trainer_notes } = req.body;
  try {
    const h = (Number(height_cm) || 175) / 100;
    const w = Number(weight_kg) || 75;
    const bmi = (w / (h * h)).toFixed(1);

    await pool.query(
      `INSERT INTO Member_Biometrics (member_id, height_cm, weight_kg, bmi, body_fat_pct, fitness_goal, trainer_notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         height_cm = VALUES(height_cm),
         weight_kg = VALUES(weight_kg),
         bmi = VALUES(bmi),
         body_fat_pct = VALUES(body_fat_pct),
         fitness_goal = VALUES(fitness_goal),
         trainer_notes = VALUES(trainer_notes)`,
      [member_id, height_cm, weight_kg, bmi, body_fat_pct || 15.0, fitness_goal || 'General Fitness', trainer_notes || '']
    );
    const [[t]] = await pool.query('SELECT name FROM Trainers WHERE trainer_id = ?', [trainer_id || 0]);
    await notify('member', member_id, t ? t.name : 'Your Coach', 'Trainer Note', `Your metrics were updated (BMI ${bmi}).${trainer_notes ? ' Note: ' + trainer_notes : ''}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update client biometrics: ' + err.message });
  }
});

app.post('/api/trainer/workout', async (req, res) => {
  let { trainer_id, member_id, exercise_name, muscle_group, sets, reps, weight_kg } = req.body;
  if (!member_id) {
    return res.status(400).json({ error: 'Client selection is required.' });
  }
  if (!exercise_name || !exercise_name.trim()) {
    return res.status(400).json({ error: 'Exercise name is required.' });
  }

  const tid = (trainer_id && Number(trainer_id) > 0) ? Number(trainer_id) : null;
  const mid = Number(member_id);
  const numSets = parseInt(sets, 10) || 3;
  const numReps = parseInt(reps, 10) || 10;
  const numWeight = parseFloat(weight_kg) || 0;
  const grp = (muscle_group && muscle_group.trim()) ? muscle_group.trim() : 'Full Body';

  try {
    const [result] = await pool.query(
      `INSERT INTO Client_Workouts (member_id, trainer_id, exercise_name, muscle_group, sets, reps, weight_kg, workout_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE())`,
      [mid, tid, exercise_name.trim(), grp, numSets, numReps, numWeight]
    );

    let coachName = 'Your Coach';
    if (tid) {
      const [[t]] = await pool.query('SELECT name FROM Trainers WHERE trainer_id = ?', [tid]);
      if (t && t.name) coachName = t.name;
    }

    await notify('member', mid, coachName, 'Workout Assigned', `New workout: ${exercise_name.trim()} (${grp}) ${numSets}x${numReps} @ ${numWeight} kg.`);
    res.json({ success: true, workout_id: result.insertId });
  } catch (err) {
    console.error('Error logging workout:', err);
    res.status(500).json({ error: 'Failed to log workout: ' + err.message });
  }
});

app.get('/api/trainer/:id/workouts', async (req, res) => {
  const trainerId = Number(req.params.id) || 0;
  const memberId = req.query.member_id ? Number(req.query.member_id) : null;

  try {
    let sql, params;
    if (memberId) {
      sql = `
        SELECT w.*, m.name AS member_name, COALESCE(t.name, 'Admin / Self') AS coach
        FROM Client_Workouts w
        JOIN Members m ON w.member_id = m.member_id
        LEFT JOIN Trainers t ON w.trainer_id = t.trainer_id
        WHERE w.member_id = ?
        ORDER BY w.workout_date DESC, w.workout_id DESC
      `;
      params = [memberId];
    } else {
      sql = `
        SELECT w.*, m.name AS member_name, COALESCE(t.name, 'Admin / Self') AS coach
        FROM Client_Workouts w
        JOIN Members m ON w.member_id = m.member_id
        LEFT JOIN Trainers t ON w.trainer_id = t.trainer_id
        WHERE w.trainer_id = ? OR w.member_id IN (
          SELECT member_id FROM Slot_Bookings WHERE trainer_id = ?
        )
        ORDER BY w.workout_date DESC, w.workout_id DESC
        LIMIT 50
      `;
      params = [trainerId, trainerId];
    }
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching workouts:', err);
    res.status(500).json({ error: 'Failed to fetch workouts: ' + err.message });
  }
});

app.get('/api/trainer/client/:memberId/workouts', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT w.*, m.name AS member_name, COALESCE(t.name, 'Admin / Self') AS coach
      FROM Client_Workouts w
      JOIN Members m ON w.member_id = m.member_id
      LEFT JOIN Trainers t ON w.trainer_id = t.trainer_id
      WHERE w.member_id = ?
      ORDER BY w.workout_date DESC, w.workout_id DESC
    `, [req.params.memberId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch client workout routine.' });
  }
});

// ==========================================
// 9. MEMBER PORTAL APIS
// ==========================================
app.get('/api/member/:id/profile', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT m.member_id, m.name, m.email, m.phone, m.status, m.plan_end_date,
             COALESCE(p.plan_name, 'Standard Plan') AS plan_name,
             COALESCE(p.price, 18000) AS plan_price,
             b.height_cm, b.weight_kg, b.bmi, b.body_fat_pct, b.fitness_goal, b.trainer_notes,
             s.slot_time, s.locker_number,
             t.name AS trainer_name
      FROM Members m
      LEFT JOIN Membership_Plans p ON m.membership_plan_id = p.plan_id
      LEFT JOIN Member_Biometrics b ON m.member_id = b.member_id
      LEFT JOIN Slot_Bookings s ON m.member_id = s.member_id
      LEFT JOIN Trainers t ON s.trainer_id = t.trainer_id
      WHERE m.member_id = ?
      LIMIT 1
    `, [req.params.id]);

    if (rows.length === 0) return res.status(404).json({ error: 'Member not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch member profile.' });
  }
});

app.post('/api/member/biometrics', async (req, res) => {
  const { member_id, height_cm, weight_kg, body_fat_pct, fitness_goal, trainer_notes } = req.body;
  try {
    const h = (Number(height_cm) || 175) / 100;
    const w = Number(weight_kg) || 75;
    const bmi = (w / (h * h)).toFixed(1);

    await pool.query(
      `INSERT INTO Member_Biometrics (member_id, height_cm, weight_kg, bmi, body_fat_pct, fitness_goal, trainer_notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         height_cm = VALUES(height_cm),
         weight_kg = VALUES(weight_kg),
         bmi = VALUES(bmi),
         body_fat_pct = VALUES(body_fat_pct),
         fitness_goal = VALUES(fitness_goal),
         trainer_notes = VALUES(trainer_notes)`,
      [member_id, height_cm, weight_kg, bmi, body_fat_pct || 15.0, fitness_goal || 'General Fitness', trainer_notes || '']
    );
    res.json({ success: true, bmi });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update biometrics: ' + err.message });
  }
});

app.post('/api/member/workout', async (req, res) => {
  const { member_id, exercise_name, muscle_group, sets, reps, weight_kg } = req.body;
  try {
    await pool.query(
      `INSERT INTO Client_Workouts (member_id, exercise_name, muscle_group, sets, reps, weight_kg, workout_date)
       VALUES (?, ?, ?, ?, ?, ?, CURDATE())`,
      [member_id, exercise_name, muscle_group || 'Chest', sets || 3, reps || 10, weight_kg || 0]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to log workout: ' + err.message });
  }
});

app.get('/api/member/:id/workouts', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM Client_Workouts WHERE member_id = ? ORDER BY workout_id DESC LIMIT 20',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch workouts.' });
  }
});

app.get('/api/member/:id/slots', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT s.booking_id, s.slot_time, s.locker_number,
             t.name AS trainer_name, t.specialization
      FROM Slot_Bookings s
      JOIN Trainers t ON s.trainer_id = t.trainer_id
      WHERE s.member_id = ?
      ORDER BY s.booking_id DESC
    `, [req.params.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch member slots.' });
  }
});

app.post('/api/member/pay', async (req, res) => {
  const { member_id, plan_id, cycle_months, amount, method } = req.body;
  try {
    // Record payment
    await pool.query(
      `INSERT INTO Payments (member_id, amount, payment_date, method) VALUES (?, ?, CURDATE(), ?)`,
      [member_id, amount, method || 'Credit Card']
    );

    // Extend membership plan_end_date
    const daysToAdd = (Number(cycle_months) || 3) * 30;
    await pool.query(
      `UPDATE Members
       SET membership_plan_id = ?,
           plan_end_date = DATE_ADD(GREATEST(plan_end_date, CURDATE()), INTERVAL ? DAY),
           status = 'Active'
       WHERE member_id = ?`,
      [plan_id || 1, daysToAdd, member_id]
    );

    const [[m]] = await pool.query('SELECT name FROM Members WHERE member_id = ?', [member_id]);
    if (m) await notify('admin', 0, m.name, 'Dues Received', `${m.name} paid ₹${Number(amount).toLocaleString('en-IN')} for ${cycle_months || 3} month(s) via ${method || 'Credit Card'}.`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Payment processing error: ' + err.message });
  }
});

app.get('/api/member/:id/payments', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM Payments WHERE member_id = ? ORDER BY payment_id DESC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch payments.' });
  }
});

// ==========================================
// 10. ADMIN LOGS, REPORTS & PAYMENTS
// ==========================================
app.get('/api/admin/logs', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT l.*, m.name, m.email
      FROM Member_Access_Logs l
      JOIN Members m ON l.member_id = m.member_id
      ORDER BY l.log_id DESC
      LIMIT 50
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch access logs.' });
  }
});

app.post('/api/admin/checkin', async (req, res) => {
  const { member_id } = req.body;
  try {
    await pool.query(
      `INSERT INTO Member_Access_Logs (member_id, login_time, session_status)
       VALUES (?, NOW(), 'Online')`,
      [member_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Checkin error: ' + err.message });
  }
});

app.post('/api/admin/checkout', async (req, res) => {
  const { log_id } = req.body;
  try {
    await pool.query(
      `UPDATE Member_Access_Logs
       SET logout_time = NOW(),
           duration_minutes = TIMESTAMPDIFF(MINUTE, login_time, NOW()),
           session_status = 'Logged Out'
       WHERE log_id = ?`,
      [log_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Checkout error: ' + err.message });
  }
});

app.get('/api/admin/payments/ledger', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.payment_id, p.amount, p.payment_date, p.method, m.name AS member_name, m.name AS name
      FROM Payments p
      JOIN Members m ON p.member_id = m.member_id
      ORDER BY p.payment_id DESC
    `);
    const [[{ total_revenue }]] = await pool.query('SELECT COALESCE(SUM(amount), 0) AS total_revenue FROM Payments');
    res.json({ payments: rows, total_revenue });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch financial ledger: ' + err.message });
  }
});

app.get('/api/members/:id', async (req, res) => {
  try {
    const [members] = await pool.query(`
      SELECT m.*, p.plan_name, p.price AS plan_price,
             b.height_cm, b.weight_kg, b.bmi, b.body_fat_pct, b.fitness_goal, b.trainer_notes
      FROM Members m
      LEFT JOIN Membership_Plans p ON m.membership_plan_id = p.plan_id
      LEFT JOIN Member_Biometrics b ON m.member_id = b.member_id
      WHERE m.member_id = ?
    `, [req.params.id]);

    if (members.length === 0) return res.status(404).json({ error: 'Member not found' });
    const m = members[0];

    // Compute days left / overdue
    if (m.plan_end_date) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const end = new Date(m.plan_end_date);
      end.setHours(0, 0, 0, 0);
      const diffTime = end.getTime() - today.getTime();
      m.days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      m.overdue = m.days < 0;
    } else {
      m.days = 0;
      m.overdue = false;
    }

    const [payments] = await pool.query('SELECT * FROM Payments WHERE member_id = ? ORDER BY payment_date DESC, payment_id DESC', [req.params.id]);
    const [logs] = await pool.query('SELECT * FROM Member_Access_Logs WHERE member_id = ? ORDER BY login_time DESC LIMIT 50', [req.params.id]);
    const [workouts] = await pool.query(`
      SELECT w.*, COALESCE(t.name, 'Admin / Self') AS coach
      FROM Client_Workouts w
      LEFT JOIN Trainers t ON w.trainer_id = t.trainer_id
      WHERE w.member_id = ?
      ORDER BY w.workout_date DESC, w.workout_id DESC
    `, [req.params.id]);
    const [slots] = await pool.query(`
      SELECT s.*, t.name AS trainer_name, t.specialization
      FROM Slot_Bookings s
      JOIN Trainers t ON s.trainer_id = t.trainer_id
      WHERE s.member_id = ?
    `, [req.params.id]);
    const [plans] = await pool.query('SELECT * FROM Membership_Plans ORDER BY duration_months ASC');

    res.json({
      member: m,
      payments,
      attendance: logs,
      logs,
      workouts,
      bookings: slots,
      slots,
      plans
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch member details: ' + err.message });
  }
});

app.post('/api/members/:id/membership', async (req, res) => {
  const { plan_id, plan_end_date, status } = req.body;
  try {
    await pool.query('UPDATE Members SET membership_plan_id = ?, plan_end_date = ?, status = ? WHERE member_id = ?', [plan_id, plan_end_date, status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/reminder', async (req, res) => {
  const { member_id } = req.body;
  try {
    const [[m]] = await pool.query('SELECT name, plan_end_date FROM Members WHERE member_id = ?', [member_id]);
    if (m) {
      await pool.query(
        "INSERT INTO System_Notifications (recipient_role, recipient_id, actor_name, category, message) VALUES ('member', ?, 'Billing Desk', 'Payment Reminder', ?)",
        [member_id, `Action required: your membership due date is ${m.plan_end_date ? new Date(m.plan_end_date).toLocaleDateString() : 'soon'}. Please renew.`]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/notifications', async (req, res) => {
  const role = req.query.role || 'all';
  const id = Number(req.query.id) || 0;
  try {
    const [rows] = await pool.query(`
      SELECT * FROM System_Notifications
      WHERE (recipient_role IN (?, 'all') AND (recipient_id = ? OR recipient_id = 0))
      ORDER BY notification_id DESC LIMIT 30
    `, [role, id]);
    // Members/trainers can't change shared rows, so those never count as unread for them.
    const shared = role === 'admin' || role === 'all';
    const list = shared ? rows : rows.map(n => (n.recipient_role === role && Number(n.recipient_id) > 0) ? n : { ...n, is_read: 1 });
    const unread = list.filter(n => !Number(n.is_read)).length;
    res.json({ notifications: list, unread });
  } catch (err) {
    res.json({ notifications: [], unread: 0 });
  }
});

// Admin manages shared/broadcast rows; members & trainers only touch their own personal rows.
async function mutateNotifications(action, role, id) {
  const r = role || 'all';
  const uid = Number(id) || 0;
  const shared = r === 'admin' || r === 'all';
  const where = shared
    ? "recipient_role IN (?, 'all') AND (recipient_id = ? OR recipient_id = 0)"
    : 'recipient_role = ? AND recipient_id = ? AND recipient_id > 0';
  if (action === 'read') {
    await pool.query(`UPDATE System_Notifications SET is_read = 1 WHERE ${where}`, [r, uid]);
  } else if (action === 'clear') {
    await pool.query(`DELETE FROM System_Notifications WHERE ${where}`, [r, uid]);
  }
}

app.post('/api/notifications', async (req, res) => {
  const { action, role, id } = req.body;
  try {
    await mutateNotifications(action, role, id);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

app.post('/api/notifications/read', async (req, res) => {
  try {
    await mutateNotifications('read', req.body.role, req.body.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/notifications/clear', async (req, res) => {
  try {
    await mutateNotifications('clear', req.body.role, req.body.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/export', async (req, res) => {
  try {
    await exportCsv(req, res);
  } catch (err) {
    console.error('Export error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Export failed: ' + err.message });
    else res.end();
  }
});

async function exportCsv(req, res) {
  const type = req.query.type;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ironpulse-${type}-${new Date().toISOString().split('T')[0]}.csv"`);
  res.write('\uFEFF');

  if (type === 'members') {
    const [members] = await pool.query(`
      SELECT m.*, p.plan_name, b.height_cm, b.weight_kg, b.bmi, b.body_fat_pct, b.fitness_goal
      FROM Members m
      LEFT JOIN Membership_Plans p ON m.membership_plan_id = p.plan_id
      LEFT JOIN Member_Biometrics b ON m.member_id = b.member_id
    `);
    res.write('ID,Name,Email,Phone,Plan,Expiry,Status,BMI,Body fat %,Goal\n');
    members.forEach(m => {
      res.write(`"${m.member_id}","${m.name}","${m.email}","${m.phone || ''}","${m.plan_name || ''}","${m.plan_end_date ? new Date(m.plan_end_date).toLocaleDateString() : ''}","${m.status}","${m.bmi || ''}","${m.body_fat_pct || ''}","${m.fitness_goal || ''}"\n`);
    });
  } else if (type === 'payments') {
    const [payments] = await pool.query('SELECT p.*, m.name FROM Payments p JOIN Members m ON p.member_id=m.member_id ORDER BY p.payment_date DESC');
    res.write('Payment ID,Date,Member,Amount,Method\n');
    payments.forEach(p => {
      res.write(`"${p.payment_id}","${p.payment_date ? new Date(p.payment_date).toLocaleDateString() : ''}","${p.name}","${p.amount}","${p.method}"\n`);
    });
  } else if (type === 'logs') {
    const [logs] = await pool.query('SELECT l.*, m.name FROM Member_Access_Logs l JOIN Members m ON l.member_id=m.member_id ORDER BY l.login_time DESC');
    res.write('Log ID,Member,Login,Logout,Duration (min),Status\n');
    logs.forEach(l => {
      res.write(`"${l.log_id}","${l.name}","${new Date(l.login_time).toLocaleString()}","${l.logout_time ? new Date(l.logout_time).toLocaleString() : ''}","${l.duration_minutes || ''}","${l.session_status}"\n`);
    });
  } else if (type === 'report') {
    try {
      const R = await buildReports();
      res.write('Category,Label,Value\n');
      (R.revenue || []).forEach(r => res.write(`"Revenue","${r.label}","${r.total}"\n`));
      (R.growth || []).forEach(g => res.write(`"Growth","${g.label}","${g.count}"\n`));
      (R.plans || []).forEach(p => res.write(`"Plans","${p.name}","${p.members} subscribers (${p.revenue})"\n`));
      (R.trainers || []).forEach(t => res.write(`"Trainers","${t.name}","${t.slots} slots"\n`));
      (R.methods || []).forEach(m => res.write(`"Payment Method","${m.method}","${m.cnt} payments (${m.total})"\n`));
    } catch (e) {
      res.write('Error\n"Failed to generate full report"\n');
    }
  } else {
    res.write('Status\n"Export ready"\n');
  }
  res.end();
}

app.post('/api/admin/payment', async (req, res) => {
  const { member_id, amount, payment_date, method } = req.body;
  try {
    await pool.query(
      `INSERT INTO Payments (member_id, amount, payment_date, method) VALUES (?, ?, ?, ?)`,
      [member_id, amount, payment_date || new Date(), method || 'UPI / NetBanking']
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record payment: ' + err.message });
  }
});

app.post('/api/admin/create', async (req, res) => {
  const { name, email, password } = req.body;
  if (!isAllowedDomain(email)) {
    return res.status(400).json({ error: 'Only recognized email providers are supported.' });
  }
  try {
    const rawPassword = password || 'password123';
    const hashedPassword = await bcrypt.hash(rawPassword, 10);
    const [result] = await pool.query(
      `INSERT INTO Admins (name, email, password) VALUES (?, ?, ?)`,
      [name, email, hashedPassword]
    );
    res.json({ success: true, admin_id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create admin: ' + err.message });
  }
});

app.get('/api/admin/reports', async (req, res) => {
  try {
    const R = await buildReports();
    const tot = R.revenue.reduce((acc, x) => acc + Number(x.total), 0);
    const cnt = R.revenue.reduce((acc, x) => acc + Number(x.count), 0);
    const joins = R.growth.reduce((acc, x) => acc + Number(x.count), 0);
    const avg = cnt ? Math.round(tot / cnt) : 0;

    res.json({
      reports: R,
      kpis: {
        total_revenue: tot,
        payments_count: cnt,
        new_members: joins,
        avg_payment: avg
      }
    });
  } catch (err) {
    console.error('Failed to build analytical reports:', err);
    res.status(500).json({ error: 'Failed to generate analytical reports.' });
  }
});

// ==========================================
// 11. CLEAN PAGE REDIRECTS (ROUTING)
// ==========================================
app.get('/', (req, res) => res.redirect('/index.html'));
app.get('/login', (req, res) => res.redirect('/index.html'));
app.get('/admin', (req, res) => res.redirect('/admin/index.html'));
app.get('/dashboard', (req, res) => res.redirect('/trainer/index.html'));
app.get('/trainer', (req, res) => res.redirect('/trainer/index.html'));
app.get('/member', (req, res) => res.redirect('/member/index.html'));
app.get('/logout', (req, res) => res.redirect('/index.html'));

// Start Express Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`💪 IronPulse Smart Gym Tracker RUNNING on http://localhost:${PORT}`);
  console.log(`⚡ Powered by Node.js REST API + MySQL + Pure HTML/CSS`);
  console.log(`====================================================`);
});
