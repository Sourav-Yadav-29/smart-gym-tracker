const pool = require('./db');

async function buildReports() {
    // Generate last 6 months list
    const months = {};
    const d = new Date();
    for (let i = 5; i >= 0; i--) {
        const temp = new Date(d.getFullYear(), d.getMonth() - i, 1);
        const y = temp.getFullYear();
        const m = String(temp.getMonth() + 1).padStart(2, '0');
        const k = `${y}-${m}`;
        const label = temp.toLocaleDateString('en-US', { month: 'short' }) + ' ' + String(y).slice(-2);
        months[k] = label;
    }
    const monthKeys = Object.keys(months);
    const start = monthKeys[0] + '-01';

    // Revenue
    const rev = {};
    for (const [k, label] of Object.entries(months)) {
        rev[k] = { label, total: 0.0, count: 0 };
    }
    const [revRows] = await pool.query(`
        SELECT DATE_FORMAT(payment_date, '%Y-%m') AS k, SUM(amount) AS t, COUNT(*) AS c
        FROM Payments
        WHERE payment_date >= ?
        GROUP BY k
    `, [start]);
    for (const r of revRows) {
        if (rev[r.k]) {
            rev[r.k].total = Number(r.t) || 0;
            rev[r.k].count = Number(r.c) || 0;
        }
    }

    // Growth (New members per month)
    const growth = {};
    for (const [k, label] of Object.entries(months)) {
        growth[k] = { label, count: 0 };
    }
    try {
        const [growthRows] = await pool.query(`
            SELECT DATE_FORMAT(f, '%Y-%m') AS k, COUNT(*) AS c
            FROM (SELECT MIN(payment_date) AS f FROM Payments GROUP BY member_id) x
            WHERE f >= ?
            GROUP BY k
        `, [start]);
        for (const r of growthRows) {
            if (growth[r.k]) growth[r.k].count = Number(r.c) || 0;
        }
    } catch (_) {}

    // Plan distribution
    const [plans] = await pool.query(`
        SELECT p.plan_id, p.plan_name AS name, p.price, p.duration_months,
            (SELECT COUNT(*) FROM Members m WHERE m.membership_plan_id = p.plan_id) AS members,
            (SELECT COALESCE(SUM(pay.amount), 0) FROM Payments pay JOIN Members m2 ON pay.member_id=m2.member_id WHERE m2.membership_plan_id=p.plan_id) AS revenue
        FROM Membership_Plans p
        ORDER BY p.price DESC
    `);

    // Trainers
    const [trainers] = await pool.query(`
        SELECT t.trainer_id, t.name, t.specialization, COUNT(s.booking_id) AS slots, COUNT(DISTINCT s.member_id) AS clients
        FROM Trainers t
        LEFT JOIN Slot_Bookings s ON t.trainer_id=s.trainer_id
        GROUP BY t.trainer_id
        ORDER BY slots DESC
    `);

    // Methods
    const [methods] = await pool.query(`
        SELECT method, COUNT(*) AS cnt, SUM(amount) AS total
        FROM Payments
        GROUP BY method
        ORDER BY total DESC
    `);

    // Expiry breakdown
    const t = new Date().toISOString().split('T')[0];
    const [[{ c: cOverdue }]] = await pool.query(`SELECT COUNT(*) AS c FROM Members WHERE plan_end_date < ?`, [t]);
    const [[{ c: c7d }]] = await pool.query(`SELECT COUNT(*) AS c FROM Members WHERE plan_end_date BETWEEN ? AND DATE_ADD(?, INTERVAL 7 DAY)`, [t, t]);
    const [[{ c: c30d }]] = await pool.query(`SELECT COUNT(*) AS c FROM Members WHERE plan_end_date > DATE_ADD(?, INTERVAL 7 DAY) AND plan_end_date <= DATE_ADD(?, INTERVAL 30 DAY)`, [t, t]);
    const [[{ c: cBeyond }]] = await pool.query(`SELECT COUNT(*) AS c FROM Members WHERE plan_end_date > DATE_ADD(?, INTERVAL 30 DAY)`, [t]);

    const expiry = [
        { label: 'Overdue renewals', kind: 'red', count: cOverdue },
        { label: 'Due within 7 days', kind: 'amber', count: c7d },
        { label: 'Due within 30 days', kind: 'cyan', count: c30d },
        { label: 'Beyond 30 days', kind: 'green', count: cBeyond }
    ];

    return {
        revenue: Object.values(rev),
        growth: Object.values(growth),
        plans,
        trainers,
        methods,
        expiry
    };
}

module.exports = { buildReports };
