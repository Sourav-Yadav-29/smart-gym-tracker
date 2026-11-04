/**
 * IronPulse demo data (realistic, reproducible).
 *
 *  - Runs automatically on server start when the Admins table is empty.
 *  - `npm run seed`            -> seeds only if the database is empty.
 *  - `npm run seed -- --reset` -> wipes all gym data and re-seeds from scratch.
 *
 * Every account uses the password:  password123
 *   admin@ironpulse.com  |  trainer1@ironpulse.com  |  member1@ironpulse.com
 *
 * The data is generated from a fixed random seed, so you get the same people every time,
 * but all dates are relative to today so dashboards, dues and charts always look current.
 */
const bcrypt = require('bcryptjs');

const DEMO_PASSWORD = 'password123';
const MEMBER_COUNT = 56;
const SLOTS = ['07:00 AM - 08:00 AM', '09:30 AM - 10:30 AM', '05:00 PM - 06:00 PM', '07:00 PM - 08:00 PM'];
const SLOT_START_HOUR = [7, 9, 17, 19];
const TRAINER_CAPACITY = 8;

// ---------- deterministic randomness ----------
let _s = 20260211;
function rand() {
    _s |= 0; _s = (_s + 0x6D2B79F5) | 0;
    let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
const chance = p => rand() < p;
const pick = arr => arr[Math.floor(rand() * arr.length)];
const gauss = (mean, sd) => mean + sd * Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function weighted(items) { // [[value, weight], ...]
    const total = items.reduce((s, i) => s + i[1], 0); let r = rand() * total;
    for (const [v, w] of items) { if ((r -= w) <= 0) return v; }
    return items[items.length - 1][0];
}

// ---------- date helpers (all local time) ----------
const NOW = new Date();
const TODAY = new Date(NOW); TODAY.setHours(12, 0, 0, 0);
const p2 = n => String(n).padStart(2, '0');
const fmtDate = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const fmtStamp = d => `${fmtDate(d)} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
const daysAgo = n => { const d = new Date(TODAY); d.setDate(d.getDate() - n); return d; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
const diffDays = (a, b) => Math.round((a - b) / 864e5); // a - b in days
const minutesAgo = n => new Date(NOW.getTime() - n * 60000);
const bmiOf = (h, w) => Math.round((w / Math.pow(h / 100, 2)) * 10) / 10;
const r1 = n => Math.round(n * 10) / 10;

// ---------- reference data ----------
// plan_id order matters: 1 = Gold (the member portal falls back to it).
// price / duration_months = monthly rate, which the billing page multiplies out.
const PLANS = [
    { id: 1, name: 'Gold', months: 12, price: 15000, w: 40 },
    { id: 2, name: 'Silver', months: 6, price: 8500, w: 38 },
    { id: 3, name: 'Platinum', months: 12, price: 22000, w: 22 }
];

const ADMINS = [
    ['Arthur Pendleton', 'admin@ironpulse.com'],
    ['Priya Nair', 'priya.nair@ironpulse.com']
];

const TRAINERS = [
    ['Marcus Reed', 'trainer1@ironpulse.com', 'Strength & Hypertrophy'],
    ['Sofia Alvarez', 'trainer2@ironpulse.com', 'Yoga & Mobility'],
    ['Rohan Mehta', 'trainer3@ironpulse.com', 'HIIT & Conditioning'],
    ['Ananya Iyer', 'trainer4@ironpulse.com', 'Weight Loss & Nutrition'],
    ['Karan Bhatt', 'trainer5@ironpulse.com', 'Boxing & Functional Training'],
    ['Zara Khan', 'trainer6@ironpulse.com', 'Pilates & Core Stability']
];

// goal, trainer id (1-based), weight, coaching note
const GOALS = [
    ['Lean Hypertrophy', 1, 9, 'Progressive overload on compounds. Keep protein near 2 g/kg.'],
    ['Strength', 1, 7, 'Work the 5x5 template. Deload every fourth week.'],
    ['Toning & Endurance', 2, 6, 'Add one mobility session a week. Tempo reps on lower body.'],
    ['Flexibility', 2, 4, 'Hip openers before every lower-body day.'],
    ['Athletic Conditioning', 3, 6, 'Interval sprints twice a week. Track resting heart rate.'],
    ['Fat Loss', 4, 8, 'Hold a 400 kcal deficit. Zone 2 cardio twice a week.'],
    ['Weight Loss', 4, 7, 'Walk 8k steps daily. Review the food log on Fridays.'],
    ['Boxing Fitness', 5, 4, 'Footwork and bag rounds. Build to 6 x 3 minutes.'],
    ['General Fitness', 5, 5, 'Full-body circuits. Focus on showing up three times a week.'],
    ['Core & Posture', 6, 4, 'Anti-rotation work and thoracic mobility before pressing.'],
    ['Post-Rehab Mobility', 6, 2, 'Pain-free range only. No deep lunges or heavy axial load.']
];

const MALE = ['Aarav', 'Vihaan', 'Arjun', 'Kabir', 'Rohan', 'Vikram', 'Rahul', 'Aditya', 'Siddharth', 'Karthik', 'Nikhil', 'Tarun', 'Manish', 'Harsh', 'Yash', 'Ishaan', 'Dev', 'Pranav', 'Sameer', 'Imran', 'Gurpreet', 'Anil', 'Rajesh', 'Varun', 'Abhishek', 'Deepak', 'Mohit', 'Faisal'];
const FEMALE = ['Ananya', 'Diya', 'Neha', 'Isha', 'Meera', 'Pooja', 'Sana', 'Riya', 'Kavya', 'Aditi', 'Priyanka', 'Shreya', 'Tanvi', 'Nisha', 'Simran', 'Divya', 'Anjali', 'Pallavi', 'Mehak', 'Zoya', 'Lakshmi', 'Ritu', 'Sneha', 'Aisha', 'Kiran', 'Bhavna'];
const SURNAMES = ['Sharma', 'Verma', 'Singh', 'Kapoor', 'Malhotra', 'Joshi', 'Rao', 'Desai', 'Qureshi', 'Bhatia', 'Menon', 'Iyer', 'Nair', 'Reddy', 'Gupta', 'Mehta', 'Chopra', 'Khanna', 'Banerjee', 'Das', 'Patel', 'Shah', 'Kulkarni', 'Pillai', 'Sethi', 'Arora', 'Ahuja', 'Bose', 'Chatterjee', 'Agarwal', 'Saxena', 'Mishra', 'Yadav', 'Thakur', 'Sinha', 'Ghosh'];
const DOMAINS = [['gmail.com', 60], ['outlook.com', 12], ['yahoo.in', 12], ['hotmail.com', 6], ['proton.me', 4], ['icloud.com', 6]];

const PAY_METHODS = [['UPI / QR Instant', 46], ['Credit Card', 20], ['Debit Card', 14], ['NetBanking', 11], ['Cash', 9]];

// exercise, sets, reps, base kg for a ~75 kg lifter (0 = bodyweight/timed)
const LIFTS = {
    Chest: [['Barbell Bench Press', 4, 8, 70], ['Incline Dumbbell Press', 3, 10, 26], ['Cable Fly', 3, 12, 15], ['Push-Up', 3, 15, 0]],
    Back: [['Deadlift', 4, 5, 110], ['Lat Pulldown', 3, 10, 55], ['Seated Cable Row', 3, 12, 50], ['Pull-Up', 3, 8, 0]],
    Legs: [['Back Squat', 4, 8, 90], ['Romanian Deadlift', 3, 10, 70], ['Leg Press', 3, 12, 160], ['Walking Lunge', 3, 12, 20]],
    Shoulders: [['Overhead Press', 4, 8, 42], ['Lateral Raise', 3, 15, 10], ['Face Pull', 3, 15, 25]],
    Arms: [['EZ-Bar Curl', 3, 10, 30], ['Triceps Pushdown', 3, 12, 28], ['Hammer Curl', 3, 12, 14]],
    Core: [['Hanging Leg Raise', 3, 12, 0], ['Cable Crunch', 3, 15, 35], ['Plank', 3, 1, 0]],
    Conditioning: [['Kettlebell Swing', 5, 15, 20], ['Rowing Intervals', 6, 1, 0], ['Battle Ropes', 5, 1, 0]],
    'Full Body': [['Clean and Press', 4, 6, 40], ['Burpee Ladder', 4, 10, 0], ['Goblet Squat', 3, 12, 20]]
};
const SPLIT = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'];

// ---------- build the dataset ----------
function build() {
    const usedNames = new Set(['Alex Johnson']);
    const usedEmails = new Set(['member1@ironpulse.com']);

    const members = [];
    for (let i = 0; i < MEMBER_COUNT; i++) {
        const m = { idx: i, id: i + 1 };
        if (i === 0) {
            Object.assign(m, { name: 'Alex Johnson', email: 'member1@ironpulse.com', phone: '+91 98100 11001', gender: 'M', planId: 1, joinAgo: 151, noChurn: true, goal: GOALS[0], forceTrainer: 1, forceSlot: 2, freq: 4 });
        } else {
            m.gender = chance(0.56) ? 'M' : 'F';
            let name, tries = 0;
            do { name = `${pick(m.gender === 'M' ? MALE : FEMALE)} ${pick(SURNAMES)}`; } while (usedNames.has(name) && ++tries < 50);
            usedNames.add(name);
            m.name = name;
            const [f, l] = name.toLowerCase().split(' ');
            let email;
            do { email = `${f}.${l}${chance(0.35) ? int(1, 99) : ''}@${weighted(DOMAINS)}`; } while (usedEmails.has(email));
            usedEmails.add(email); m.email = email;
            m.phone = `+91 ${weighted([['9', 5], ['8', 3], ['7', 2], ['6', 1]])}${int(1000, 9999)} ${int(10000, 99999)}`;
            m.planId = weighted(PLANS.map(p => [p.id, p.w]));
            m.joinAgo = Math.floor(420 * Math.pow(rand(), 1.7)); // more recent joiners than old ones
            m.goal = weighted(GOALS.map(g => [g, g[2]]));
            m.freq = weighted([[1, 1], [2, 3], [3, 5], [4, 4], [5, 2]]);
        }
        const plan = PLANS.find(p => p.id === m.planId);

        // Biometrics
        const h = Math.round(clamp(gauss(m.gender === 'M' ? 175 : 162, m.gender === 'M' ? 6.5 : 5.5), 150, 192));
        const bmi = clamp(gauss(m.gender === 'M' ? 24.6 : 23.9, 3.3), 18, 35);
        let w = Math.round(bmi * Math.pow(h / 100, 2) * 2) / 2;
        let fat = clamp((m.gender === 'M' ? 11 : 20) + (bmi - 21) * 1.5 + gauss(0, 2), 8, 38);
        if (i === 0) { m.height = 178; m.weight = 76.5; m.fat = 14.2; } else { m.height = h; m.weight = w; m.fat = r1(fat); }
        m.bmi = bmiOf(m.height, m.weight);
        m.note = m.goal[3];

        // Payment history: pay on joining, renew each cycle, sometimes lapse
        const join = daysAgo(m.joinAgo);
        const churnAfter = m.noChurn ? Infinity : (chance(0.14) ? int(1, 3) : Infinity);
        let cursor = join, cycles = 0; m.payments = [];
        for (;;) {
            let payDate = cycles === 0 ? new Date(join) : addDays(cursor, int(-3, 3));
            if (payDate > TODAY) payDate = new Date(TODAY);
            m.payments.push({ date: payDate, amount: plan.price, method: weighted(PAY_METHODS) });
            cursor = addMonths(cursor, plan.months); cycles++;
            if (cursor > TODAY) break;
            if (cycles >= churnAfter || chance(0.07)) break; // lapsed, did not renew
        }
        m.joinDate = join; m.endDate = cursor;
        const left = diffDays(cursor, TODAY);
        m.daysLeft = left;
        // A few recently lapsed members still show Active so the "expired but active" flag has something to show.
        m.status = left >= 0 ? 'Active' : (left >= -10 && chance(0.6) ? 'Active' : 'Inactive');
        members.push(m);
    }

    // Make sure the dues views always have a few urgent cases (adjust the last payment cycle, not the history shape).
    const urgent = members.filter(m => m.daysLeft >= 0 && m.daysLeft <= 7 && m.idx !== 0).length;
    if (urgent < 3) {
        const pool = members.filter(m => m.idx !== 0 && m.planId >= 2 && m.status === 'Active' && m.daysLeft > 7);
        for (const m of shuffle(pool).slice(0, 3 - urgent)) {
            const shift = m.daysLeft - int(2, 6);
            m.endDate = addDays(m.endDate, -shift); m.daysLeft -= shift;
            m.payments.forEach(p => { p.date = addDays(p.date, -shift); });
            m.joinDate = addDays(m.joinDate, -shift); m.joinAgo += shift;
        }
    }

    // Bookings: match goal to trainer, respect capacity of 8 clients
    const load = TRAINERS.map(() => 0);
    const bookings = []; const usedLockers = new Set();
    const locker = () => { let n; do { n = int(101, 340); } while (usedLockers.has(n)); usedLockers.add(n); return `Locker #${n}`; };
    const book = (m, tId, slot) => { load[tId - 1]++; bookings.push({ m, tId, slot, locker: locker() }); (m.trainers = m.trainers || new Set()).add(tId); };
    const active = members.filter(m => m.status === 'Active');
    book(members[0], 1, 2);
    for (const m of shuffle(active.filter(x => x.idx !== 0))) {
        if (!chance(0.74)) continue;
        let tId = m.goal[1];
        if (load[tId - 1] >= TRAINER_CAPACITY) tId = [1, 2, 3, 4, 5, 6].filter(t => load[t - 1] < TRAINER_CAPACITY).sort((a, b) => load[a - 1] - load[b - 1])[0];
        if (!tId) continue;
        book(m, tId, weighted([[0, 3], [1, 2], [2, 4], [3, 4]]));
    }
    // a few members train twice a week with different slots
    for (const b of shuffle(bookings.filter(x => x.m.idx !== 0)).slice(0, 4)) {
        if (load[b.tId - 1] >= TRAINER_CAPACITY) continue;
        const slot = (b.slot + 2) % 4;
        book(b.m, b.tId, slot);
    }

    return { members, bookings };
}

function buildWorkouts(members, bookings) {
    const rows = [];
    const trainerOf = new Map(); bookings.forEach(b => { if (!trainerOf.has(b.m.idx)) trainerOf.set(b.m.idx, b.tId); });
    for (const m of members) {
        if (m.status !== 'Active' && m.daysLeft < -10) continue;
        const tId = trainerOf.get(m.idx) || null;
        const sessions = m.idx === 0 ? 16 : (tId ? int(4, 12) : (chance(0.4) ? int(2, 5) : 0));
        if (!sessions) continue;
        const span = Math.min(35, Math.max(8, m.joinAgo));
        const days = shuffle(Array.from({ length: span }, (_, i) => i + (m.idx === 0 ? 0 : 1))).slice(0, sessions).sort((a, b) => b - a); // oldest first
        const level = m.gender === 'M' ? clamp(gauss(0.85, 0.2), 0.45, 1.3) : clamp(gauss(0.5, 0.12), 0.3, 0.8);
        const bodyScale = m.weight / 75;
        const lowImpact = /Post-Rehab|Flexibility|Core/.test(m.goal[0]);
        let cursorGroup = int(0, SPLIT.length - 1);
        days.forEach((ago, k) => {
            let group;
            if (/Conditioning|Boxing/.test(m.goal[0]) && chance(0.5)) group = chance(0.5) ? 'Conditioning' : 'Full Body';
            else if (lowImpact) group = pick(['Core', 'Full Body', 'Legs']);
            else if (/Fat Loss|Weight Loss|General/.test(m.goal[0]) && chance(0.35)) group = pick(['Full Body', 'Conditioning']);
            else { group = SPLIT[cursorGroup % SPLIT.length]; cursorGroup++; }
            const exercises = shuffle(LIFTS[group]).slice(0, int(2, 3));
            const progress = 1 + (k / Math.max(1, days.length - 1)) * 0.07; // small strength gain over the period
            const logger = tId && chance(0.82) ? tId : null;                 // otherwise the member logged it themselves
            for (const [name, sets, reps, kg] of exercises) {
                const w = kg ? Math.max(2.5, Math.round((kg * level * bodyScale * progress * (lowImpact ? 0.6 : 1)) / 2.5) * 2.5) : 0;
                rows.push([m.id, logger, name, group, sets, reps, w, fmtDate(daysAgo(ago))]);
            }
        });
    }
    return rows;
}

function buildAccessLogs(members) {
    const logs = [];
    const ip = m => `192.168.1.${20 + (m.idx % 200)}`;
    for (const m of members) {
        if (m.idx !== 0 && m.status !== 'Active' && m.daysLeft < -10) continue;
        const slot = (m.slotPref !== undefined) ? m.slotPref : (m.slotPref = weighted([[0, 3], [1, 2], [2, 4], [3, 4]]));
        for (let d = 1; d <= 30; d++) {
            const day = daysAgo(d);
            if (day < m.joinDate || day > m.endDate) continue;
            const dow = day.getDay();
            const p = (m.freq / 7) * (dow === 0 ? 0.6 : dow === 6 ? 1.1 : 1.05);
            if (!chance(p)) continue;
            const login = new Date(day); login.setHours(SLOT_START_HOUR[slot] + (chance(0.25) ? int(-1, 1) : 0), int(0, 40), int(0, 59), 0);
            const mins = Math.round(clamp(gauss(68, 16), 30, 110));
            const out = new Date(login.getTime() + mins * 60000);
            logs.push([m.id, fmtStamp(login), fmtStamp(out), mins, ip(m), 'Logged Out']);
        }
    }
    // Today: a few people are on the floor right now, a few have already left.
    const present = shuffle(members.filter(m => m.status === 'Active' && m.idx !== 0));
    present.slice(0, 4).forEach((m, i) => logs.push([m.id, fmtStamp(minutesAgo(int(12, 70) + i * 3)), null, null, ip(m), 'Online']));
    present.slice(4, 9).forEach(m => {
        const mins = int(40, 85), loginAgo = int(150, 420);
        logs.push([m.id, fmtStamp(minutesAgo(loginAgo)), fmtStamp(minutesAgo(loginAgo - mins)), mins, ip(m), 'Logged Out']);
    });
    return logs;
}

function buildNotifications(members, bookings) {
    const out = []; // [role, recipient_id, actor, category, message, is_read, created_at]
    const at = hoursAgo => fmtStamp(new Date(NOW.getTime() - hoursAgo * 3600000));
    const inr = n => '₹' + Number(n).toLocaleString('en-IN');
    const planOf = m => PLANS.find(p => p.id === m.planId).name;
    const dueSoon = members.filter(m => m.status === 'Active' && m.daysLeft >= 0 && m.daysLeft <= 7);
    const overdue = members.filter(m => m.status === 'Active' && m.daysLeft < 0);
    const newJoins = members.filter(m => m.joinAgo <= 14 && m.idx !== 0);
    const lastPays = members.flatMap(m => m.payments.map(p => ({ m, p }))).sort((a, b) => b.p.date - a.p.date).slice(0, 5);

    overdue.slice(0, 3).forEach((m, i) => out.push(['admin', 0, 'System', 'Expired Plan', `${m.name}: ${planOf(m)} expired ${Math.abs(m.daysLeft)} day(s) ago but the status is still Active.`, 0, at(2 + i * 5)]));
    dueSoon.slice(0, 4).forEach((m, i) => out.push(['admin', 0, 'System', 'Dues Alert', `${m.name}: ${planOf(m)} ends in ${m.daysLeft} day(s). Send a renewal reminder.`, i > 1 ? 1 : 0, at(6 + i * 7)]));
    newJoins.slice(0, 3).forEach((m, i) => out.push(['admin', 0, 'Front Desk', 'New Member', `${m.name} joined on ${planOf(m)} (${inr(PLANS.find(p => p.id === m.planId).price)}).`, 1, at(24 + i * 20)]));
    lastPays.forEach(({ m, p }, i) => out.push(['admin', 0, m.name, 'Dues Received', `${m.name} paid ${inr(p.amount)} for ${planOf(m)} via ${p.method}.`, 1, at(30 + i * 14)]));
    out.push(['admin', 0, 'Marcus Reed', 'Trainer Update', 'Marcus Reed logged strength sessions for his 8 clients this week.', 1, at(52)]);

    // Trainer inboxes
    for (const t of TRAINERS.map((_, i) => i + 1)) {
        bookings.filter(b => b.tId === t).slice(-2).forEach((b, i) =>
            out.push(['trainer', t, b.m.name, 'New Client Slot', `${b.m.name} booked your ${SLOTS[b.slot]} slot (${b.locker}).`, i === 0 ? 1 : 0, at(10 + t * 3 + i * 9)]));
    }

    // Alex (member 1) and members whose dues are close
    const alex = members[0];
    out.push(['member', 1, 'Marcus Reed', 'Trainer Note', 'Strong bench session. Add 2.5 kg next week and keep the same rep range.', 0, at(5)]);
    out.push(['member', 1, 'System', 'Upcoming Due', `Your ${planOf(alex)} plan renews in ${alex.daysLeft} day(s). Nothing to pay right now.`, 1, at(30)]);
    dueSoon.forEach((m, i) => out.push(['member', m.id, 'System', 'Upcoming Due', `Your ${planOf(m)} plan renews in ${m.daysLeft} day(s). Pay early to keep your locker.`, 0, at(8 + i * 4)]));

    out.push(['all', 0, 'IronPulse', 'Announcement', 'The gym closes at 6:00 PM this Sunday for equipment servicing.', 1, at(70)]);
    return out.map(n => [n[0], n[1], n[2], n[3], n[4].slice(0, 255), n[5], n[6]]);
}

async function seedDemoData(pool, { force = false } = {}) {
    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM Admins');
    if (n > 0 && !force) return false;

    _s = 20260211; // identical people on every run
    const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);
    const { members, bookings } = build();
    const workouts = buildWorkouts(members, bookings);
    const logs = buildAccessLogs(members);
    const notes = buildNotifications(members, bookings);
    const payments = members.flatMap(m => m.payments.map(p => [m.id, p.amount, fmtDate(p.date), p.method]))
        .sort((a, b) => (a[2] < b[2] ? -1 : 1));

    const conn = await pool.getConnection();
    try {
        await conn.query('SET FOREIGN_KEY_CHECKS = 0');
        for (const t of ['System_Notifications', 'Client_Workouts', 'Member_Access_Logs', 'Member_Biometrics',
            'Payments', 'Slot_Bookings', 'Members', 'Trainers', 'Admins', 'Membership_Plans']) {
            await conn.query(`TRUNCATE TABLE ${t}`);
        }
        await conn.query('SET FOREIGN_KEY_CHECKS = 1');
        await conn.beginTransaction();

        await conn.query('INSERT INTO Membership_Plans (plan_name, duration_months, price) VALUES ?', [PLANS.map(p => [p.name, p.months, p.price])]);
        await conn.query('INSERT INTO Admins (name, email, password) VALUES ?', [ADMINS.map(a => [...a, hash])]);
        await conn.query('INSERT INTO Trainers (name, email, password, specialization, contact_email) VALUES ?',
            [TRAINERS.map(t => [t[0], t[1], hash, t[2], t[1]])]);
        await conn.query('INSERT INTO Members (name, email, password, phone, membership_plan_id, plan_end_date, status) VALUES ?',
            [members.map(m => [m.name, m.email, hash, m.phone, m.planId, fmtDate(m.endDate), m.status])]);
        await conn.query('INSERT INTO Member_Biometrics (member_id, height_cm, weight_kg, bmi, body_fat_pct, fitness_goal, trainer_notes) VALUES ?',
            [members.map(m => [m.id, m.height, m.weight, m.bmi, m.fat, m.goal[0], m.note])]);
        await conn.query('INSERT INTO Slot_Bookings (member_id, trainer_id, slot_time, locker_number) VALUES ?',
            [bookings.map(b => [b.m.id, b.tId, SLOTS[b.slot], b.locker])]);
        await conn.query('INSERT INTO Payments (member_id, amount, payment_date, method) VALUES ?', [payments]);
        if (workouts.length) await conn.query('INSERT INTO Client_Workouts (member_id, trainer_id, exercise_name, muscle_group, sets, reps, weight_kg, workout_date) VALUES ?', [workouts]);
        if (logs.length) await conn.query('INSERT INTO Member_Access_Logs (member_id, login_time, logout_time, duration_minutes, ip_address, session_status) VALUES ?', [logs]);
        await conn.query('INSERT INTO System_Notifications (recipient_role, recipient_id, actor_name, category, message, is_read, created_at) VALUES ?', [notes]);

        await conn.commit();
        return { members: members.length, trainers: TRAINERS.length, bookings: bookings.length, payments: payments.length, workouts: workouts.length, logs: logs.length, notifications: notes.length };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

module.exports = { seedDemoData, DEMO_PASSWORD };

// CLI: node seed.js [--reset]
if (require.main === module) {
    const pool = require('./db');
    const force = process.argv.includes('--reset');
    (async () => {
        await pool.ready;
        try {
            const done = await seedDemoData(pool, { force });
            console.log(done
                ? `✅ Demo data inserted: ${JSON.stringify(done)}\n   Every account uses the password "${DEMO_PASSWORD}".`
                : 'ℹ️  Database already has data. Run `npm run seed -- --reset` to wipe and re-seed.');
        } catch (e) {
            console.error('❌ Seeding failed:', e.message);
            process.exitCode = 1;
        }
        await pool.end();
    })();
}
