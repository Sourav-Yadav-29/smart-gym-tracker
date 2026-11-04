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

function today() {
    return new Date().toISOString().split('T')[0];
}

function daysTo(end) {
    if (!end) return 0;
    const endDt = new Date(end);
    const now = new Date(today());
    const diff = Math.floor((endDt - now) / (1000 * 60 * 60 * 24));
    return diff;
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

function statusBadge(status) {
    const isAct = String(status).toLowerCase() === 'active';
    return `<span class="badge ${isAct ? 'green' : 'amber'}">${status || 'Inactive'}</span>`;
}

const KNOWN_EMAIL_DOMAINS = [
    'gmail.com',
    'outlook.com',
    'hotmail.com',
    'live.com',
    'msn.com',
    'yahoo.com',
    'yahoo.in',
    'yahoo.co.uk',
    'icloud.com',
    'me.com',
    'proton.me',
    'protonmail.com',
    'zoho.com',
    'ironpulse.com'
];

function isValidKnownEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const clean = email.trim().toLowerCase();
    const parts = clean.split('@');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
    return KNOWN_EMAIL_DOMAINS.includes(parts[1]);
}

module.exports = {
    inr,
    fdate,
    fdt,
    today,
    daysTo,
    initials,
    bmiInfo,
    statusBadge,
    KNOWN_EMAIL_DOMAINS,
    isValidKnownEmail
};
