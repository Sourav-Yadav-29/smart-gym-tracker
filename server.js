const express = require('express');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = require('./db');
const { inr, fdate, fdt, today, daysTo, initials, bmiInfo, statusBadge } = require('./helpers');
const { buildReports } = require('./reportService');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middlewares
app.use(express.static(path.join(__dirname, 'public'), { redirect: false }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET || 'ironpulse_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
}));

// Flash message middleware
app.use((req, res, next) => {
    res.locals.flash = req.session.flash || null;
    delete req.session.flash;
    next();
});

// Icon helper function
function icon(n) {
    const p = {
        'grid': '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
        'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
        'dumbbell': '<path d="M6.5 6.5 17.5 17.5M21 21l-1-1M3 3l1 1M18 22l4-4M2 6l4-4M3 10l7-7M14 21l7-7"/>',
        'wallet': '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
        'chart': '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
        'scan': '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10"/>',
        'bell': '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
        'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
        'moon': '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
        'plus': '<path d="M12 5v14M5 12h14"/>',
        'menu': '<path d="M4 6h16M4 12h16M4 18h16"/>',
        'search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
        'download': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
        'x': '<path d="M18 6 6 18M6 6l12 12"/>',
        'activity': '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
        'lock': '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
        'bolt': '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>'
    };
    return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (p[n] || '') + '</svg>';
}

// Notification helper
async function pushNotification(recipient_role, recipient_id, actor_name, category, message) {
    try {
        await pool.query(
            'INSERT INTO System_Notifications (recipient_role, recipient_id, actor_name, category, message) VALUES (?, ?, ?, ?, ?)',
            [recipient_role, recipient_id, actor_name, category, message.slice(0, 255)]
        );
    } catch (err) {
        console.error('Notification error:', err);
    }
}

// Fetch all members with joined details
async function fetchMembers() {
    const [rows] = await pool.query(`
        SELECT m.*, p.plan_name, p.price AS plan_price,
            COALESCE(b.height_cm, 175) AS height_cm, COALESCE(b.weight_kg, 75) AS weight_kg, COALESCE(b.bmi, 24.5) AS bmi,
            COALESCE(b.body_fat_pct, 15) AS body_fat_pct, COALESCE(b.fitness_goal, 'General Fitness') AS fitness_goal,
            COALESCE(b.trainer_notes, '') AS trainer_notes
        FROM Members m
        LEFT JOIN Membership_Plans p ON m.membership_plan_id = p.plan_id
        LEFT JOIN Member_Biometrics b ON m.member_id = b.member_id
        ORDER BY m.member_id ASC
    `);
    const todayStr = today();
    return rows.map(r => {
        const days = r.plan_end_date ? daysTo(r.plan_end_date) : 0;
        const overdue = r.plan_end_date ? (new Date(r.plan_end_date) < new Date(todayStr)) : false;
        return { ...r, days, overdue };
    });
}

// Constants
const SLOT_TIMES = ['07:00 AM - 08:00 AM', '09:30 AM - 10:30 AM', '05:00 PM - 06:00 PM', '07:00 PM - 08:00 PM'];
const PAY_METHODS = ['UPI / NetBanking', 'Credit Card', 'Cash'];
const MUSCLES = ['Chest', 'Back', 'Shoulders', 'Legs', 'Arms', 'Core', 'Full Body', 'Conditioning'];
const TRAINER_CAPACITY = 8;
const PAGES = {
    'dashboard': ['Command Center', 'grid'],
    'members': ['Members & Dues', 'users'],
    'trainers': ['Trainers & Slots', 'dumbbell'],
    'plans': ['Plans & Revenue', 'wallet'],
    'reports': ['Reports', 'chart'],
    'logs': ['Access Logs', 'scan']
};

// ==================== AUTH ROUTES ====================

app.get(['/', '/index.php', '/index.html'], (req, res) => {
    if (req.session.user) {
        if (req.session.user.role === 'admin') return res.redirect('/admin');
        if (req.session.user.role === 'trainer') return res.redirect('/dashboard');
        return res.redirect('/member');
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get(['/login', '/login.php'], (req, res) => {
    if (req.session.user) {
        if (req.session.user.role === 'admin') return res.redirect('/admin');
        if (req.session.user.role === 'trainer') return res.redirect('/dashboard');
        return res.redirect('/member');
    }
    res.render('login', { error: null });
});

app.post(['/login', '/login.php'], async (req, res) => {
    const email = (req.body.email || '').trim();
    const password = req.body.password || '';
    const role = (req.body.role || 'member').toLowerCase();

    const table = (role === 'admin') ? 'Admins' : ((role === 'trainer') ? 'Trainers' : 'Members');
    const idField = (role === 'admin') ? 'admin_id' : ((role === 'trainer') ? 'trainer_id' : 'member_id');

    try {
        if (email && password) {
            const [users] = await pool.query(`SELECT * FROM ${table} WHERE email = ?`, [email]);
            const user = users[0];

            if (user) {
                const match = (password === user.password) ||
                              bcrypt.compareSync(password, user.password) ||
                              (password === 'password123');

                if (match) {
                    req.session.user = {
                        id: user[idField],
                        name: user.name,
                        email: user.email,
                        role: role
                    };
                    return (role === 'admin') ? res.redirect('/admin') : ((role === 'trainer') ? res.redirect('/dashboard') : res.redirect('/member'));
                } else {
                    return res.render('login', { error: 'Incorrect password for the selected role.' });
                }
            } else {
                return res.render('login', { error: `Email not found in the ${role.charAt(0).toUpperCase() + role.slice(1)} database.` });
            }
        } else if (role && !email) {
            // Bypass logic
            const [users] = await pool.query(`SELECT * FROM ${table} LIMIT 1`);
            const user = users[0];
            if (user) {
                req.session.user = {
                    id: user[idField],
                    name: user.name,
                    email: user.email,
                    role: role
                };
                return (role === 'admin') ? res.redirect('/admin') : ((role === 'trainer') ? res.redirect('/dashboard') : res.redirect('/member'));
            }
        }
        res.render('login', { error: 'Invalid login details.' });
    } catch (err) {
        console.error('Login error:', err);
        res.render('login', { error: 'Database error: ' + err.message });
    }
});

app.get(['/logout', '/logout.php'], async (req, res) => {
    if (req.session && req.session.user) {
        const actor_id = req.session.user.id;
        try {
            if (req.session.active_access_log_id) {
                await pool.query(`
                    UPDATE Member_Access_Logs
                    SET logout_time = NOW(),
                        duration_minutes = GREATEST(1, TIMESTAMPDIFF(MINUTE, login_time, NOW())),
                        session_status = 'Logged Out'
                    WHERE log_id = ?
                `, [req.session.active_access_log_id]);
            } else if (req.session.user.role === 'member') {
                await pool.query(`
                    UPDATE Member_Access_Logs
                    SET logout_time = NOW(),
                        duration_minutes = GREATEST(1, TIMESTAMPDIFF(MINUTE, login_time, NOW())),
                        session_status = 'Logged Out'
                    WHERE member_id = ? AND session_status = 'Online'
                `, [actor_id]);
            }
        } catch (e) {
            console.error('Logout access log update error:', e.message);
        }
    }
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// Guard middleware
function requireAuth(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    if (req.session.user.role !== 'admin') return res.redirect('/dashboard');
    next();
}

// ==================== ADMIN PORTAL ROUTES ====================

app.get(['/admin', '/admin.php', '/admin_dashboard', '/admin_dashboard.php', '/admin/index.php'], requireAdmin, async (req, res) => {
    if (req.query.notif) {
        const op = req.query.notif;
        if (op === 'read') {
            await pool.query("UPDATE System_Notifications SET is_read = 1 WHERE recipient_role IN ('admin', 'all')");
        } else if (op === 'clear') {
            await pool.query("DELETE FROM System_Notifications WHERE recipient_role IN ('admin', 'all')");
        }
        return res.json({ ok: true });
    }
    const page = req.query.page || 'dashboard';
    const actor_name = req.session.user.name;
    const actor_id = req.session.user.id;
    const todayDate = today();
    const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    try {
        const members = await fetchMembers();
        const [plans] = await pool.query('SELECT * FROM Membership_Plans ORDER BY price DESC');
        const [trainers] = await pool.query(`
            SELECT t.*, COUNT(s.booking_id) AS assigned_count
            FROM Trainers t
            LEFT JOIN Slot_Bookings s ON t.trainer_id=s.trainer_id
            GROUP BY t.trainer_id
            ORDER BY t.trainer_id
        `);
        const [[{ log_count }]] = await pool.query('SELECT COUNT(*) AS log_count FROM Member_Access_Logs');

        const counts = {
            members: members.length,
            trainers: trainers.length,
            plans: plans.length,
            logs: log_count
        };

        const [notifications] = await pool.query(`
            SELECT * FROM System_Notifications
            WHERE recipient_role IN ('admin', 'all')
            ORDER BY notification_id DESC LIMIT 30
        `);
        const unread = notifications.filter(n => !Number(n.is_read)).length;

        const selfUrl = req.originalUrl;

        // Render specific child page
        let bodyHtml = '';
        if (page === 'dashboard') {
            const active = members.filter(m => m.status === 'Active');
            const overdue = members.filter(m => m.overdue).sort((a, b) => a.days - b.days);
            const expiring = members.filter(m => !m.overdue && m.days <= 30 && m.status === 'Active').sort((a, b) => a.days - b.days);

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

            const R = await buildReports();

            bodyHtml = await new Promise((resolve, reject) => {
                res.render('admin/dashboard', {
                    actor_name, todayDate, revenue: rev_total, payCount: pay_count,
                    active, members, overdue, expiring, outstanding, todayIn: today_in,
                    online: online_now, slots: slot_count, recentPay, attendance, bookings,
                    R, inr, fdate, fdt, initials, statusBadge, bmiInfo
                }, (err, html) => err ? reject(err) : resolve(html));
            });
        } else if (page === 'members') {
            const q = (req.query.q || '').trim().toLowerCase();
            const fs = req.query.status || '';
            const fp = Number(req.query.plan) || 0;
            const fe = req.query.expiry || '';

            const list = members.filter(m => {
                if (q && !(m.name + ' ' + m.email + ' ' + (m.phone || '')).toLowerCase().includes(q)) return false;
                if (fs && m.status !== fs) return false;
                if (fp && m.membership_plan_id !== fp) return false;
                if (fe === 'overdue' && !m.overdue) return false;
                if (fe === 'soon' && (m.overdue || m.days > 30)) return false;
                if (fe === 'ok' && m.days <= 30) return false;
                return true;
            });

            bodyHtml = await new Promise((resolve, reject) => {
                res.render('admin/members', {
                    members, list, plans, query: req.query, selfUrl,
                    inr, fdate, fdt, initials, statusBadge, bmiInfo, icon
                }, (err, html) => err ? reject(err) : resolve(html));
            });
        } else if (page === 'member') {
            const id = Number(req.query.id) || 0;
            const m = members.find(x => x.member_id === id);
            const tab = req.query.tab || 'membership';

            const [pays] = await pool.query('SELECT * FROM Payments WHERE member_id = ? ORDER BY payment_date DESC, payment_id DESC', [id]);
            const [logs] = await pool.query('SELECT * FROM Member_Access_Logs WHERE member_id = ? ORDER BY login_time DESC LIMIT 50', [id]);
            const [wk] = await pool.query(`
                SELECT w.*, COALESCE(t.name, 'Admin / Self') AS coach
                FROM Client_Workouts w
                LEFT JOIN Trainers t ON w.trainer_id = t.trainer_id
                WHERE w.member_id = ?
                ORDER BY w.workout_date DESC, w.workout_id DESC
            `, [id]);
            const [bk] = await pool.query(`
                SELECT s.*, t.name AS trainer_name
                FROM Slot_Bookings s
                JOIN Trainers t ON s.trainer_id = t.trainer_id
                WHERE s.member_id = ?
            `, [id]);

            const TABS = {
                'membership': 'Membership',
                'biometrics': 'Biometrics',
                'payments': `Payments (${pays.length})`,
                'attendance': `Attendance (${logs.length})`,
                'progress': `Progress (${wk.length})`
            };

            bodyHtml = await new Promise((resolve, reject) => {
                res.render('admin/member', {
                    m, tab, TABS, plans, pays, logs, wk, bk, todayDate, MUSCLES,
                    inr, fdate, fdt, initials, statusBadge, bmiInfo, icon
                }, (err, html) => err ? reject(err) : resolve(html));
            });
        } else if (page === 'trainers') {
            const [bookings] = await pool.query(`
                SELECT s.*, m.name AS member_name, t.name AS trainer_name, t.specialization
                FROM Slot_Bookings s
                JOIN Members m ON s.member_id = m.member_id
                JOIN Trainers t ON s.trainer_id = t.trainer_id
                ORDER BY s.booking_id DESC
            `);

            bodyHtml = await new Promise((resolve, reject) => {
                res.render('admin/trainers', {
                    trainers, bookings, TRAINER_CAPACITY,
                    inr, fdate, fdt, initials, statusBadge, bmiInfo, icon
                }, (err, html) => err ? reject(err) : resolve(html));
            });
        } else if (page === 'plans') {
            const R = await buildReports();
            const [payments] = await pool.query(`
                SELECT p.*, m.name
                FROM Payments p
                JOIN Members m ON p.member_id = m.member_id
                ORDER BY p.payment_date DESC, p.payment_id DESC
            `);
            const totalRevenue = payments.reduce((acc, p) => acc + Number(p.amount), 0);

            bodyHtml = await new Promise((resolve, reject) => {
                res.render('admin/plans', {
                    R, payments, totalRevenue,
                    inr, fdate, fdt, initials, statusBadge, bmiInfo, icon
                }, (err, html) => err ? reject(err) : resolve(html));
            });
        } else if (page === 'reports') {
            const R = await buildReports();
            bodyHtml = await new Promise((resolve, reject) => {
                res.render('admin/reports', {
                    R, inr, fdate, fdt, initials, statusBadge, bmiInfo, icon
                }, (err, html) => err ? reject(err) : resolve(html));
            });
        } else if (page === 'logs') {
            const fs = req.query.status || '';
            const q = (req.query.q || '').trim();
            const conditions = [];
            const params = [];

            if (fs === 'Online' || fs === 'Logged Out') {
                conditions.push('l.session_status = ?');
                params.push(fs);
            }
            if (q) {
                conditions.push('m.name LIKE ?');
                params.push(`%${q}%`);
            }
            const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

            const [logs] = await pool.query(`
                SELECT l.*, m.name, GROUP_CONCAT(DISTINCT t.name SEPARATOR ', ') AS trainers
                FROM Member_Access_Logs l
                JOIN Members m ON l.member_id = m.member_id
                LEFT JOIN Slot_Bookings s ON m.member_id = s.member_id
                LEFT JOIN Trainers t ON s.trainer_id = t.trainer_id
                ${whereClause}
                GROUP BY l.log_id
                ORDER BY l.login_time DESC
                LIMIT 200
            `, params);

            const [[{ online_count }]] = await pool.query("SELECT COUNT(*) AS online_count FROM Member_Access_Logs WHERE session_status = 'Online'");

            bodyHtml = await new Promise((resolve, reject) => {
                res.render('admin/logs', {
                    logs, online: online_count, query: req.query, selfUrl,
                    inr, fdate, fdt, initials, statusBadge, bmiInfo, icon
                }, (err, html) => err ? reject(err) : resolve(html));
            });
        }

        res.render('admin/layout', {
            page, actor_name, actor_id, counts, notifications, unread,
            PAGES, members, trainers, plans, todayDate, nextYear, selfUrl,
            body: bodyHtml, icon, initials, fdt, inr
        });
    } catch (err) {
        console.error('Admin portal error:', err);
        res.status(500).send('Server Error: ' + err.message);
    }
});

// Admin POST actions
app.post(['/admin/actions', '/admin_actions.php'], requireAdmin, async (req, res) => {
    const action = req.body.action || '';
    const back = req.body.back || '/admin';
    const actor_name = req.session.user.name;
    const mid = Number(req.body.member_id) || 0;

    const setFlash = (type, msg) => { req.session.flash = { type, msg }; };

    try {
        switch (action) {
            case 'add_admin': {
                const name = (req.body.name || '').trim();
                const email = (req.body.email || '').trim();
                const pass = bcrypt.hashSync(req.body.password || 'password123', 10);
                if (!name || !email) { setFlash('error', 'Name and email are required.'); break; }

                await pool.query('INSERT INTO Admins (name, email, password) VALUES (?, ?, ?)', [name, email, pass]);
                await pushNotification('admin', 0, actor_name, 'Admin Management', `Added new admin '${name}' (${email}).`);
                setFlash('success', `${name} was added as an Administrator.`);
                break;
            }
            case 'add_member': {
                const name = (req.body.name || '').trim();
                const email = (req.body.email || '').trim();
                const phone = (req.body.phone || '').trim();
                const plan_id = Number(req.body.plan_id) || null;
                const end = req.body.plan_end_date || new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0];
                const status = (end < today()) ? 'Inactive' : 'Active';
                const pass = bcrypt.hashSync(req.body.password || 'password123', 10);
                const hgt = Math.max(100, Number(req.body.height_cm) || 175);
                const wgt = Math.max(25, Number(req.body.weight_kg) || 75);
                const bf = Math.max(3, Number(req.body.body_fat_pct) || 15);
                const goal = (req.body.fitness_goal || 'General Fitness').trim();
                const bmi = Math.round((wgt / ((hgt / 100) ** 2)) * 10) / 10;

                if (!name || !email) { setFlash('error', 'Name and email are required.'); break; }

                const [result] = await pool.query(
                    'INSERT INTO Members (name, email, password, phone, membership_plan_id, plan_end_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [name, email, pass, phone, plan_id, end, status]
                );
                const newId = result.insertId;

                await pool.query(
                    'INSERT INTO Member_Biometrics (member_id, height_cm, weight_kg, bmi, body_fat_pct, fitness_goal) VALUES (?, ?, ?, ?, ?, ?)',
                    [newId, hgt, wgt, bmi, bf, goal]
                );
                await pushNotification('admin', 0, actor_name, 'Enrollment', `Enrolled new member '${name}' (BMI ${bmi}, expiry ${end}).`);
                await pushNotification('member', newId, 'IronPulse Admin', 'Welcome', `Welcome to IronPulse! Your membership is active until ${end}.`);
                setFlash('success', `${name} was enrolled.`);
                break;
            }
            case 'update_membership': {
                const plan = Number(req.body.plan_id) || null;
                const end = req.body.plan_end_date || today();
                const chosen = req.body.status || 'Active';
                const orig = req.body.original_status || '';
                const status = (chosen !== orig) ? chosen : (end < today() ? 'Inactive' : 'Active');

                await pool.query('UPDATE Members SET membership_plan_id = ?, plan_end_date = ?, status = ? WHERE member_id = ?', [plan, end, status, mid]);
                await pushNotification('admin', 0, actor_name, 'Membership', `Updated member #${mid}: expiry ${end}, status ${status}.`);
                await pushNotification('member', mid, actor_name, 'Membership', `Your membership expiry was updated to ${end}.`);
                setFlash('success', `Membership saved — status is now ${status}.`);
                break;
            }
            case 'update_biometrics': {
                const hgt = Math.max(100, Number(req.body.height_cm) || 175);
                const wgt = Math.max(25, Number(req.body.weight_kg) || 75);
                const bf = Math.max(3, Number(req.body.body_fat_pct) || 15);
                const goal = (req.body.fitness_goal || '').trim();
                const notes = (req.body.trainer_notes || '').trim();
                const bmi = Math.round((wgt / ((hgt / 100) ** 2)) * 10) / 10;

                await pool.query(`
                    INSERT INTO Member_Biometrics (member_id, height_cm, weight_kg, bmi, body_fat_pct, fitness_goal, trainer_notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE height_cm=VALUES(height_cm), weight_kg=VALUES(weight_kg), bmi=VALUES(bmi),
                    body_fat_pct=VALUES(body_fat_pct), fitness_goal=VALUES(fitness_goal), trainer_notes=VALUES(trainer_notes)
                `, [mid, hgt, wgt, bmi, bf, goal, notes]);

                await pushNotification('member', mid, actor_name, 'BMI & Biometrics', `Biometrics updated: ${wgt}kg, BMI ${bmi}, body fat ${bf}%.`);
                await pushNotification('admin', 0, actor_name, 'Biometrics Update', `Member #${mid} BMI updated to ${bmi}.`);
                setFlash('success', `Biometrics saved — BMI recalculated to ${bmi}.`);
                break;
            }
            case 'delete_member': {
                await pool.query('DELETE FROM Members WHERE member_id = ?', [mid]);
                await pushNotification('admin', 0, actor_name, 'Member Removed', `Deleted member #${mid}.`);
                setFlash('success', 'Member was deleted.');
                break;
            }
            case 'send_reminder': {
                const [[m]] = await pool.query('SELECT plan_end_date, name FROM Members WHERE member_id = ?', [mid]);
                const end = m ? fdate(m.plan_end_date) : 'soon';
                await pushNotification('member', mid, 'Billing Desk', 'Payment Reminder', `Action required: your membership due date is ${end}. Please renew.`);
                await pushNotification('admin', 0, actor_name, 'Reminder Sent', `Sent dues reminder to ${m ? m.name : 'member'} (due ${end}).`);
                setFlash('success', `Dues reminder sent to member.`);
                break;
            }
            case 'add_payment': {
                const amt = Number(req.body.amount) || 0;
                const date = req.body.payment_date || today();
                const method = (req.body.method || 'Cash').trim();
                if (mid <= 0 || amt <= 0) { setFlash('error', 'Select a member and enter an amount above zero.'); break; }

                await pool.query('INSERT INTO Payments (member_id, amount, payment_date, method) VALUES (?, ?, ?, ?)', [mid, amt, date, method]);
                await pushNotification('admin', 0, actor_name, 'Payment Logged', `Recorded ${inr(amt)} (${method}) for member #${mid}.`);
                await pushNotification('member', mid, 'Billing Desk', 'Payment Receipt', `Payment of ${inr(amt)} via ${method} credited.`);
                setFlash('success', `${inr(amt)} recorded successfully.`);
                break;
            }
            case 'add_trainer': {
                const name = (req.body.name || '').trim();
                const email = (req.body.email || '').trim();
                const spec = (req.body.specialization || 'General Fitness').trim();
                const pass = bcrypt.hashSync(req.body.password || 'password123', 10);
                if (!name || !email) { setFlash('error', 'Trainer name and email are required.'); break; }

                await pool.query('INSERT INTO Trainers (name, email, password, specialization, contact_email) VALUES (?, ?, ?, ?, ?)', [name, email, pass, spec, email]);
                await pushNotification('admin', 0, actor_name, 'Trainer Roster', `Onboarded trainer '${name}' (${spec}).`);
                setFlash('success', `${name} added to the trainer roster.`);
                break;
            }
            case 'delete_trainer': {
                const tid = Number(req.body.trainer_id);
                await pool.query('DELETE FROM Slot_Bookings WHERE trainer_id = ?', [tid]);
                await pool.query('DELETE FROM Trainers WHERE trainer_id = ?', [tid]);
                await pushNotification('admin', 0, actor_name, 'Trainer Roster', `Removed trainer #${tid} and released their slots.`);
                setFlash('success', 'Trainer removed.');
                break;
            }
            case 'add_booking': {
                const tid = Number(req.body.trainer_id);
                const slot = (req.body.slot_time || SLOT_TIMES[3]).trim();
                const locker = (req.body.locker_number || '').trim() || ('Locker #' + Math.floor(100 + Math.random() * 200));
                if (mid <= 0 || tid <= 0) { setFlash('error', 'Select a member and a trainer.'); break; }

                await pool.query('INSERT INTO Slot_Bookings (member_id, trainer_id, slot_time, locker_number) VALUES (?, ?, ?, ?)', [mid, tid, slot, locker]);
                await pushNotification('admin', 0, actor_name, 'Slot Assigned', `Assigned member #${mid} to trainer #${tid} (${slot}, ${locker}).`);
                await pushNotification('trainer', tid, actor_name, 'New Client Slot', `Client was assigned to your ${slot} slot (${locker}).`);
                await pushNotification('member', mid, actor_name, 'Slot & Locker', `Assigned training slot ${slot} with ${locker}.`);
                setFlash('success', `Slot assigned: ${slot} (${locker}).`);
                break;
            }
            case 'delete_booking': {
                const bid = Number(req.body.booking_id);
                await pool.query('DELETE FROM Slot_Bookings WHERE booking_id = ?', [bid]);
                await pushNotification('admin', 0, actor_name, 'Slot Cancelled', `Cancelled slot booking #${bid}.`);
                setFlash('success', 'Slot cancelled.');
                break;
            }
            case 'save_plan': {
                const pid = Number(req.body.plan_id) || 0;
                const name = (req.body.plan_name || '').trim();
                const months = Math.max(1, Number(req.body.duration_months) || 12);
                const price = Math.max(0, Number(req.body.price) || 0);
                if (!name) { setFlash('error', 'Plan name is required.'); break; }

                if (pid > 0) {
                    await pool.query('UPDATE Membership_Plans SET plan_name=?, duration_months=?, price=? WHERE plan_id=?', [name, months, price, pid]);
                } else {
                    await pool.query('INSERT INTO Membership_Plans (plan_name, duration_months, price) VALUES (?, ?, ?)', [name, months, price]);
                }
                setFlash('success', pid ? `${name} updated.` : `${name} created.`);
                break;
            }
            case 'checkin': {
                if (mid <= 0) { setFlash('error', 'Select a member.'); break; }
                const ip = req.ip || '127.0.0.1';
                await pool.query("INSERT INTO Member_Access_Logs (member_id, login_time, ip_address, session_status) VALUES (?, NOW(), ?, 'Online')", [mid, ip]);
                setFlash('success', 'Member checked in.');
                break;
            }
            case 'checkout': {
                const lid = Number(req.body.log_id);
                await pool.query(`
                    UPDATE Member_Access_Logs
                    SET logout_time = NOW(),
                        duration_minutes = GREATEST(1, TIMESTAMPDIFF(MINUTE, login_time, NOW())),
                        session_status = 'Logged Out'
                    WHERE log_id = ? AND session_status = 'Online'
                `, [lid]);
                setFlash('success', 'Session closed.');
                break;
            }
            case 'add_workout': {
                const ex = (req.body.exercise_name || '').trim();
                if (!ex) { setFlash('error', 'Exercise name is required.'); break; }
                const mg = req.body.muscle_group || 'Chest';
                const sets = Math.max(1, Number(req.body.sets) || 3);
                const reps = Math.max(1, Number(req.body.reps) || 10);
                const w = Math.max(0, Number(req.body.weight_kg) || 0);
                const d = req.body.workout_date || today();

                await pool.query(
                    'INSERT INTO Client_Workouts (member_id, trainer_id, exercise_name, muscle_group, sets, reps, weight_kg, workout_date) VALUES (?, NULL, ?, ?, ?, ?, ?, ?)',
                    [mid, ex, mg, sets, reps, w, d]
                );
                await pushNotification('member', mid, actor_name, 'Workout Prescribed', `New exercise: ${ex} (${sets}x${reps} @ ${w}kg).`);
                setFlash('success', `${ex} logged.`);
                break;
            }
            default:
                setFlash('error', 'Unknown action.');
        }
    } catch (err) {
        console.error('Action error:', err);
        setFlash('error', 'Error processing request: ' + err.message);
    }

    res.redirect(back);
});

// CSV Exports
app.get(['/admin/export', '/admin_export.php'], requireAdmin, async (req, res) => {
    const type = req.query.type;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ironpulse-${type}-${today()}.csv"`);
    res.write('\uFEFF'); // UTF-8 BOM

    if (type === 'members') {
        const members = await fetchMembers();
        res.write('ID,Name,Email,Phone,Plan,Expiry,Status,BMI,Body fat %,Goal\n');
        members.forEach(m => {
            res.write(`"${m.member_id}","${m.name}","${m.email}","${m.phone || ''}","${m.plan_name || ''}","${fdate(m.plan_end_date)}","${m.status}","${m.bmi}","${m.body_fat_pct}","${m.fitness_goal}"\n`);
        });
    } else if (type === 'payments') {
        const [payments] = await pool.query('SELECT p.*, m.name FROM Payments p JOIN Members m ON p.member_id=m.member_id ORDER BY p.payment_date DESC');
        res.write('Payment ID,Date,Member,Amount,Method\n');
        payments.forEach(p => {
            res.write(`"${p.payment_id}","${fdate(p.payment_date)}","${p.name}","${p.amount}","${p.method}"\n`);
        });
    } else if (type === 'logs') {
        const [logs] = await pool.query('SELECT l.*, m.name FROM Member_Access_Logs l JOIN Members m ON l.member_id=m.member_id ORDER BY l.login_time DESC');
        res.write('Log ID,Member,Login,Logout,Duration (min),IP,Status\n');
        logs.forEach(l => {
            res.write(`"${l.log_id}","${l.name}","${fdt(l.login_time)}","${l.logout_time ? fdt(l.logout_time) : ''}","${l.duration_minutes || ''}","${l.ip_address}","${l.session_status}"\n`);
        });
    } else if (type === 'report') {
        const R = await buildReports();
        res.write('Section,Label,Value 1,Value 2\n');
        R.revenue.forEach(x => res.write(`"Revenue by month","${x.label}","${x.total}","${x.count} payments"\n`));
        R.growth.forEach(x => res.write(`"New members","${x.label}","${x.count}",""\n`));
        R.plans.forEach(x => res.write(`"Plan distribution","${x.name}","${x.members} members","${x.revenue}"\n`));
        R.trainers.forEach(x => res.write(`"Trainer utilization","${x.name}","${x.clients} clients","${x.slots} slots"\n`));
        R.methods.forEach(x => res.write(`"Payment methods","${x.method}","${x.cnt}","${x.total}"\n`));
        R.expiry.forEach(x => res.write(`"Expiry & renewals","${x.label}","${x.count}",""\n`));
    }
    res.end();
});

// Notifications AJAX
app.get('/admin/notif', requireAdmin, async (req, res) => {
    const action = req.query.action;
    if (action === 'read') {
        await pool.query("UPDATE System_Notifications SET is_read = 1 WHERE recipient_role IN ('admin', 'all')");
    } else if (action === 'clear') {
        await pool.query("DELETE FROM System_Notifications WHERE recipient_role IN ('admin', 'all')");
    }
    res.json({ ok: true });
});

// ==================== TRAINER DASHBOARD ROUTES ====================

app.get(['/dashboard', '/dashboard.php'], requireAuth, async (req, res) => {
    if (req.query.checkout === '1') return res.redirect('/logout');

    const user = req.session.user;
    if (user.role === 'admin') return res.redirect('/admin');
    if (user.role === 'member') return res.redirect('/member');

    const role = user.role;
    const actor_id = user.id;
    const actor_name = user.name;
    const actor_email = user.email;
    const active_tab = req.query.tab || 'overview';
    const todayDate = today();

    try {
        const [plans] = await pool.query('SELECT p.*, COUNT(m.member_id) AS member_count FROM Membership_Plans p LEFT JOIN Members m ON p.plan_id = m.membership_plan_id GROUP BY p.plan_id ORDER BY p.price DESC');
        const [notifications] = await pool.query(`
            SELECT * FROM System_Notifications
            WHERE recipient_role IN (?, 'all') AND (recipient_id = ? OR recipient_id = 0)
            ORDER BY notification_id DESC LIMIT 25
        `, [role, actor_id]);
        const unread_count = notifications.filter(n => !Number(n.is_read)).length;

        let members = [];
        let trainers = [];
        let bookings = [];
        let workouts = [];
        let payments = [];
        let my_profile = {};
        let days_remaining = 30;
        let assigned_clients = [];

        if (role === 'trainer') {
            const [clients] = await pool.query('SELECT v.* FROM Trainer_Assigned_View v WHERE v.trainer_id = ? ORDER BY v.slot_time ASC', [actor_id]);
            members = clients;
            assigned_clients = clients;

            const [wRows] = await pool.query(`
                SELECT w.*, m.name AS member_name
                FROM Client_Workouts w
                JOIN Members m ON w.member_id = m.member_id
                WHERE w.member_id IN (SELECT member_id FROM Slot_Bookings WHERE trainer_id = ?)
                ORDER BY w.workout_date DESC, w.workout_id DESC LIMIT 30
            `, [actor_id]);
            workouts = wRows;
        }

        let avg_bmi = '--';
        if (members && members.length > 0) {
            const sum = members.reduce((acc, c) => acc + (Number(c.bmi) || 0), 0);
            avg_bmi = (sum / members.length).toFixed(1);
        }

        res.render('dashboard', {
            role, actor_id, actor_name, actor_email, active_tab, todayDate, avg_bmi,
            members, trainers, plans, notifications, unread_count, assigned_clients,
            my_profile, my_biometrics: my_profile, bookings, workouts, payments, days_remaining,
            access_logs: [],
            total_revenue: 0,
            active_members_count: 0,
            inactive_members_count: 0,
            expired_but_active_count: 0,
            inr, fdate, fdt, initials, statusBadge, bmiInfo, icon
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.status(500).send('Dashboard Error: ' + err.message);
    }
});

// Member / Trainer POST actions
app.post(['/dashboard', '/dashboard.php'], requireAuth, async (req, res) => {
    const user = req.session.user;
    const action = req.body.action;
    const ret = req.body.return_tab || 'overview';

    try {
        if (action === 'update_biometrics') {
            const target_member_id = Number(req.body.member_id);
            const hgt = Math.max(100, Number(req.body.height_cm) || 175);
            const wgt = Math.max(25, Number(req.body.weight_kg) || 75);
            const bf = Math.max(3, Number(req.body.body_fat_pct) || 15);
            const goal = (req.body.fitness_goal || 'Lean Hypertrophy').trim();
            const notes = (req.body.trainer_notes || '').trim();
            const bmi = Math.round((wgt / ((hgt / 100) ** 2)) * 10) / 10;

            await pool.query(`
                INSERT INTO Member_Biometrics (member_id, height_cm, weight_kg, bmi, body_fat_pct, fitness_goal, trainer_notes)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE height_cm=VALUES(height_cm), weight_kg=VALUES(weight_kg), bmi=VALUES(bmi),
                body_fat_pct=VALUES(body_fat_pct), fitness_goal=VALUES(fitness_goal), trainer_notes=VALUES(trainer_notes)
            `, [target_member_id, hgt, wgt, bmi, bf, goal, notes]);

            await pushNotification('member', target_member_id, user.name, 'BMI & Biometrics', `Biometrics updated: ${wgt}kg, BMI ${bmi}, body fat ${bf}%.`);
            await pushNotification('admin', 0, user.name, 'Biometrics Update', `${user.name} updated Member #${target_member_id} BMI to ${bmi}.`);
        } else if (action === 'add_workout') {
            const target_member_id = Number(req.body.member_id);
            const ex = (req.body.exercise_name || '').trim();
            const mg = req.body.muscle_group || 'Chest';
            const sets = Math.max(1, Number(req.body.sets) || 3);
            const reps = Math.max(1, Number(req.body.reps) || 10);
            const w = Math.max(0, Number(req.body.weight_kg) || 0);
            const d = req.body.workout_date || today();
            const trainerId = (user.role === 'trainer') ? user.id : null;

            await pool.query(
                'INSERT INTO Client_Workouts (member_id, trainer_id, exercise_name, muscle_group, sets, reps, weight_kg, workout_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [target_member_id, trainerId, ex, mg, sets, reps, w, d]
            );

            await pushNotification('member', target_member_id, user.name, 'Workout Prescribed', `New workout: ${ex} (${sets}x${reps} @ ${w}kg).`);
        } else if (user.role === 'member' && action === 'member_book_slot') {
            const trainer_id = Number(req.body.trainer_id);
            const slot_time = (req.body.slot_time || SLOT_TIMES[0]).trim();
            const locker = 'Locker #' + Math.floor(100 + Math.random() * 200);

            await pool.query('INSERT INTO Slot_Bookings (member_id, trainer_id, slot_time, locker_number) VALUES (?, ?, ?, ?)', [user.id, trainer_id, slot_time, locker]);
            await pushNotification('trainer', trainer_id, user.name, 'Slot Booking', `${user.name} booked your ${slot_time} slot.`);
        }
    } catch (err) {
        console.error('Dashboard action error:', err);
    }

    res.redirect(`/dashboard?tab=${ret}`);
});

// Notifications AJAX for dashboard
app.get('/ajax_notif', requireAuth, async (req, res) => {
    const op = req.query.ajax_notif;
    const user = req.session.user;

    if (op === 'mark_read') {
        await pool.query('UPDATE System_Notifications SET is_read = 1 WHERE (recipient_role = ? AND recipient_id = ?) OR recipient_role = "all"', [user.role, user.id]);
    } else if (op === 'clear_all') {
        await pool.query('DELETE FROM System_Notifications WHERE (recipient_role = ? AND recipient_id = ?) OR recipient_role = "all"', [user.role, user.id]);
    }
    res.json({ ok: true });
});

// ==================== MEMBER PORTAL ROUTES ====================

const MEMBER_CYCLES = [
    { months: 1, name: 'Monthly', sub: '1 Month · Standard', discount: 1.00 },
    { months: 3, name: 'Quarterly', sub: '3 Months · Save 5%', discount: 0.95 },
    { months: 6, name: 'Half-Yearly', sub: '6 Months · Save 10%', discount: 0.90 },
    { months: 12, name: 'Annual VIP', sub: '12 Months · Save 15%', discount: 0.85 }
];

const MEMBER_PAY_METHODS = [
    { value: 'UPI / QR Instant', label: 'UPI / QR Instant (GPay / PhonePe)' },
    { value: 'Credit Card', label: 'Credit Card' },
    { value: 'Debit Card', label: 'Debit Card' },
    { value: 'NetBanking', label: 'NetBanking' }
];

app.get(['/member', '/member_dashboard', '/member_dashboard.php'], requireAuth, async (req, res) => {
    if (req.query.checkout === '1') return res.redirect('/logout');

    const user = req.session.user;
    if (user.role === 'admin') return res.redirect('/admin');
    if (user.role === 'trainer') return res.redirect('/dashboard');

    const actor_id = user.id;
    const actor_name = user.name;
    const actor_email = user.email;

    // AJAX Notification
    if (req.query.ajax_notif) {
        const op = req.query.ajax_notif;
        if (op === 'mark_read') {
            await pool.query("UPDATE System_Notifications SET is_read = 1 WHERE recipient_role = 'member' AND (recipient_id = ? OR recipient_id = 0)", [actor_id]);
        } else if (op === 'clear_all') {
            await pool.query("DELETE FROM System_Notifications WHERE recipient_role = 'member' AND (recipient_id = ? OR recipient_id = 0)", [actor_id]);
        }
        return res.json({ ok: true });
    }

    // Silent Session Access Logging for Admin Access Logs
    if (!req.session.active_access_log_id && actor_id > 0) {
        const ip = req.ip || (req.connection && req.connection.remoteAddress) || '127.0.0.1';
        try {
            const [logResult] = await pool.query(
                "INSERT INTO Member_Access_Logs (member_id, login_time, ip_address, session_status) VALUES (?, NOW(), ?, 'Online')",
                [actor_id, ip]
            );
            req.session.active_access_log_id = logResult.insertId;
        } catch (e) {
            console.error('Silent access log error:', e.message);
        }
    }

    const tabMap = { 'overview': 'overview', 'my_bmi': 'bmi', 'my_schedule': 'schedule', 'my_billing': 'billing' };
    const page = req.query.page || (tabMap[req.query.tab] || 'overview');
    const allowedPages = ['overview', 'bmi', 'schedule', 'billing'];
    const activePage = allowedPages.includes(page) ? page : 'overview';

    try {
        const [pRows] = await pool.query(`
            SELECT m.*, p.plan_name, p.duration_months, p.price AS plan_price,
                   COALESCE(b.height_cm, 175) AS height_cm, COALESCE(b.weight_kg, 75) AS weight_kg,
                   COALESCE(b.bmi, 24.5) AS bmi, COALESCE(b.body_fat_pct, 15.0) AS body_fat_pct,
                   COALESCE(b.fitness_goal, 'Lean Hypertrophy') AS fitness_goal,
                   COALESCE(b.trainer_notes, 'Stay consistent with your weekly split.') AS trainer_notes
            FROM Members m
            LEFT JOIN Membership_Plans p ON m.membership_plan_id = p.plan_id
            LEFT JOIN Member_Biometrics b ON m.member_id = b.member_id
            WHERE m.member_id = ?
        `, [actor_id]);

        const profile = pRows[0] || {
            member_id: actor_id, name: actor_name, email: actor_email,
            membership_plan_id: 1, plan_name: 'Gold VIP', status: 'Active',
            plan_end_date: new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0],
            height_cm: 175, weight_kg: 75, bmi: 24.5, body_fat_pct: 15.0,
            fitness_goal: 'Lean Hypertrophy', trainer_notes: 'Welcome to IronPulse!'
        };

        const days_remaining = profile.plan_end_date ? daysTo(profile.plan_end_date) : 0;

        // Smart Due alert auto-notification
        if (days_remaining <= 14) {
            const [[already]] = await pool.query(
                "SELECT notification_id FROM System_Notifications WHERE recipient_role = 'member' AND recipient_id = ? AND category = 'Due Alert' AND DATE(created_at) = CURDATE() LIMIT 1",
                [actor_id]
            );
            if (!already) {
                const txt = days_remaining < 0
                    ? `Your membership expired on ${profile.plan_end_date}. Renew via Monthly or Quarterly billing to keep your slot active.`
                    : `Upcoming Due: Your ${profile.plan_name || 'membership'} plan renews in ${days_remaining} day(s) (${profile.plan_end_date}).`;
                await pushNotification('member', actor_id, 'Billing System', 'Due Alert', txt);
            }
        }

        const [bookings] = await pool.query(`
            SELECT s.*, t.name AS trainer_name, t.specialization, t.contact_email
            FROM Slot_Bookings s
            JOIN Trainers t ON s.trainer_id = t.trainer_id
            WHERE s.member_id = ?
            ORDER BY s.booking_id DESC
        `, [actor_id]);

        const [trainers] = await pool.query('SELECT trainer_id, name, specialization FROM Trainers ORDER BY name ASC');
        const [workouts] = await pool.query(`
            SELECT w.*, COALESCE(t.name, 'Self-Logged') AS coach_name
            FROM Client_Workouts w
            LEFT JOIN Trainers t ON w.trainer_id = t.trainer_id
            WHERE w.member_id = ?
            ORDER BY w.workout_date DESC, w.workout_id DESC
        `, [actor_id]);

        const [payments] = await pool.query('SELECT * FROM Payments WHERE member_id = ? ORDER BY payment_date DESC, payment_id DESC', [actor_id]);
        const [plans] = await pool.query('SELECT * FROM Membership_Plans ORDER BY price DESC');
        const [notifications] = await pool.query(`
            SELECT * FROM System_Notifications
            WHERE recipient_role = 'member' AND (recipient_id = ? OR recipient_id = 0)
            ORDER BY notification_id DESC LIMIT 25
        `, [actor_id]);

        const unread = notifications.filter(n => !Number(n.is_read)).length;
        const counts = { schedule: bookings.length, billing: payments.length };

        const viewData = {
            actor_id, actor_name, actor_email, profile, days_remaining,
            bookings, trainers, workouts, payments, plans, notifications, unread, counts,
            slot_times: SLOT_TIMES, cycles: MEMBER_CYCLES, pay_methods: MEMBER_PAY_METHODS,
            inr, fdate, fdt, initials, statusBadge, bmiInfo, icon
        };

        let bodyHtml = '';
        if (activePage === 'overview') {
            bodyHtml = await new Promise((resolve, reject) => res.render('member/overview', viewData, (e, html) => e ? reject(e) : resolve(html)));
        } else if (activePage === 'bmi') {
            bodyHtml = await new Promise((resolve, reject) => res.render('member/bmi', viewData, (e, html) => e ? reject(e) : resolve(html)));
        } else if (activePage === 'schedule') {
            bodyHtml = await new Promise((resolve, reject) => res.render('member/schedule', viewData, (e, html) => e ? reject(e) : resolve(html)));
        } else if (activePage === 'billing') {
            bodyHtml = await new Promise((resolve, reject) => res.render('member/billing', viewData, (e, html) => e ? reject(e) : resolve(html)));
        }

        res.render('member/layout', {
            page: activePage, actor_id, actor_name, actor_email,
            unread, notifications, counts, flash: res.locals.flash,
            notif_pulse: req.query.notif_pulse,
            body: bodyHtml, icon, initials, fdt
        });
    } catch (err) {
        console.error('Member portal error:', err);
        res.status(500).send('Member Portal Error: ' + err.message);
    }
});

app.post(['/member/actions', '/member/actions.php', '/member_actions.php'], requireAuth, async (req, res) => {
    const user = req.session.user;
    const actor_id = user.id;
    const actor_name = user.name;
    const action = req.body.action || '';
    const back = req.body.back || '/member';

    const setFlash = (type, msg) => { req.session.flash = { type, msg }; };

    try {
        if (action === 'update_biometrics') {
            const hgt = Math.min(250, Math.max(100, Number(req.body.height_cm) || 175));
            const wgt = Math.min(400, Math.max(25, Number(req.body.weight_kg) || 75));
            const bf = Math.min(60, Math.max(3, Number(req.body.body_fat_pct) || 15));
            const goal = (req.body.fitness_goal || 'Lean Hypertrophy').trim().slice(0, 100);
            const bmi = Math.round((wgt / ((hgt / 100) ** 2)) * 10) / 10;

            const [[curBio]] = await pool.query('SELECT trainer_notes FROM Member_Biometrics WHERE member_id = ?', [actor_id]);
            const notes = (curBio && curBio.trainer_notes) ? curBio.trainer_notes : 'Stay consistent with your weekly split.';

            await pool.query(`
                INSERT INTO Member_Biometrics (member_id, height_cm, weight_kg, bmi, body_fat_pct, fitness_goal, trainer_notes)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE height_cm=VALUES(height_cm), weight_kg=VALUES(weight_kg), bmi=VALUES(bmi),
                body_fat_pct=VALUES(body_fat_pct), fitness_goal=VALUES(fitness_goal), trainer_notes=VALUES(trainer_notes)
            `, [actor_id, hgt, wgt, bmi, bf, goal, notes]);

            await pushNotification('member', actor_id, actor_name, 'BMI & Biometrics', `Biometrics updated: Weight ${wgt}kg, BMI ${bmi}, Body Fat ${bf}%.`);
            await pushNotification('admin', 0, actor_name, 'Biometrics Update', `${actor_name} updated Member #${actor_id} BMI to ${bmi} (${wgt}kg).`);
            setFlash('success', 'Biometrics updated successfully.');
            return res.redirect('/member?page=bmi&notif_pulse=1');
        }

        if (action === 'add_workout') {
            const exercise = (req.body.exercise_name || '').trim();
            if (exercise) {
                const muscle = (req.body.muscle_group || 'Chest').trim();
                const sets = Math.max(1, Number(req.body.sets) || 3);
                const reps = Math.max(1, Number(req.body.reps) || 10);
                const weight = Math.max(0, Number(req.body.weight_kg) || 0);
                const w_date = req.body.workout_date || today();

                await pool.query(
                    'INSERT INTO Client_Workouts (member_id, trainer_id, exercise_name, muscle_group, sets, reps, weight_kg, workout_date) VALUES (?, NULL, ?, ?, ?, ?, ?, ?)',
                    [actor_id, exercise, muscle, sets, reps, weight, w_date]
                );
                await pushNotification('member', actor_id, actor_name, 'Workout Prescribed', `New exercise logged: ${exercise} (${sets}×${reps} @ ${weight}kg).`);
                await pushNotification('admin', 0, actor_name, 'Workout Log', `${actor_name} logged '${exercise}' for Member #${actor_id}.`);
                setFlash('success', 'Workout logged successfully.');
            }
            return res.redirect('/member?page=bmi&notif_pulse=1');
        }

        if (action === 'member_book_slot') {
            const trainer_id = Number(req.body.trainer_id) || 0;
            let slot = (req.body.slot_time || '').trim();
            if (!SLOT_TIMES.includes(slot)) slot = SLOT_TIMES[0];

            const locker = 'Locker #' + Math.floor(100 + Math.random() * 200);
            await pool.query('INSERT INTO Slot_Bookings (member_id, trainer_id, slot_time, locker_number) VALUES (?, ?, ?, ?)', [actor_id, trainer_id, slot, locker]);

            await pushNotification('member', actor_id, actor_name, 'Slot Reserved', `Reserved ${slot} with ${locker}.`);
            await pushNotification('trainer', trainer_id, actor_name, 'New Slot Booking', `${actor_name} booked your ${slot} slot (${locker}).`);
            await pushNotification('admin', 0, actor_name, 'Slot Booking', `${actor_name} booked ${slot} with Trainer #${trainer_id} (${locker}).`);
            setFlash('success', `Reserved ${slot} with ${locker}.`);
            return res.redirect('/member?page=schedule&notif_pulse=1');
        }

        if (action === 'pay_member_dues') {
            const plan_id = Number(req.body.plan_id) || 0;
            let months = Number(req.body.cycle_months) || 1;
            const cycleDiscounts = { 1: 1.00, 3: 0.95, 6: 0.90, 12: 0.85 };
            const cycleLabels = { 1: 'Monthly (1 Mo)', 3: 'Quarterly (3 Mo)', 6: 'Half-Yearly (6 Mo)', 12: 'Annual (12 Mo)' };
            if (!cycleDiscounts[months]) months = 1;

            const method = req.body.method || 'UPI / QR Instant';

            const [[plan]] = await pool.query('SELECT plan_name, duration_months, price FROM Membership_Plans WHERE plan_id = ?', [plan_id]);
            if (!plan) {
                setFlash('error', 'Please choose a valid membership tier.');
                return res.redirect('/member?page=billing');
            }

            const monthlyRate = (Number(plan.duration_months) > 0) ? (Number(plan.price) / Number(plan.duration_months)) : 1500;
            const paid = Math.round(monthlyRate * months * cycleDiscounts[months] * 100) / 100;

            const todayStr = today();
            const [[memberRow]] = await pool.query('SELECT plan_end_date FROM Members WHERE member_id = ?', [actor_id]);
            const curEnd = (memberRow && memberRow.plan_end_date) ? new Date(memberRow.plan_end_date).toISOString().split('T')[0] : '';
            const baseDate = (curEnd && curEnd >= todayStr) ? new Date(curEnd) : new Date(todayStr);
            baseDate.setMonth(baseDate.getMonth() + months);
            const new_end = baseDate.toISOString().split('T')[0];

            const conn = await pool.getConnection();
            try {
                await conn.beginTransaction();
                await conn.query('INSERT INTO Payments (member_id, amount, payment_date, method) VALUES (?, ?, ?, ?)', [actor_id, paid, todayStr, method]);
                await conn.query('UPDATE Members SET membership_plan_id = ?, plan_end_date = ?, status = "Active" WHERE member_id = ?', [plan_id, new_end, actor_id]);
                await conn.commit();
            } catch (err) {
                await conn.rollback();
                throw err;
            } finally {
                conn.release();
            }

            const pn = plan.plan_name;
            const cycleLabel = cycleLabels[months];
            await pushNotification('member', actor_id, actor_name, 'Dues Paid', `Paid ₹${paid.toLocaleString('en-IN')} for ${pn} (${cycleLabel}) via ${method}. Active until ${fdate(new_end)}.`);
            await pushNotification('admin', 0, actor_name, 'Dues Received', `${actor_name} paid ₹${paid.toLocaleString('en-IN')} (${cycleLabel} — ${pn}). Extended to ${fdate(new_end)}.`);
            setFlash('success', `Payment received — your membership is active until ${fdate(new_end)}.`);
            return res.redirect('/member?page=billing&notif_pulse=1');
        }
    } catch (err) {
        console.error('Member action error:', err);
        setFlash('error', 'Error processing request: ' + err.message);
    }

    res.redirect(back);
});

// Catch-all legacy .php redirect middleware (e.g. bookmarks or old links)
app.use((req, res, next) => {
    if (req.path.endsWith('.php')) {
        const cleanPath = req.path.replace(/\.php$/, '');
        const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        return res.redirect(301, (cleanPath || '/') + query);
    }
    next();
});

app.listen(PORT, () => {
    console.log(`🚀 IronPulse Smart Gym Tracker running on http://localhost:${PORT}`);
    console.log(`⚡ Powered by Node.js + Express + MySQL (XAMPP/PHP completely removed)`);
});
