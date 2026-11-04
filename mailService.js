const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

let transporter = null;
let etherealReady = false;

async function getTransporter() {
    if (transporter) return transporter;

    // 1. If user configured custom SMTP in .env (e.g. Gmail)
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        const isGmail = process.env.SMTP_SERVICE === 'gmail' || (process.env.SMTP_HOST && process.env.SMTP_HOST.includes('gmail')) || process.env.SMTP_USER.endsWith('@gmail.com');
        if (isGmail) {
            transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS.replace(/\s+/g, '')
                }
            });
            console.log('📧 Using Gmail SMTP for IronPulse mailings:', process.env.SMTP_USER);
            return transporter;
        }

        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: Number(process.env.SMTP_PORT) || 465,
            secure: process.env.SMTP_SECURE !== 'false',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS.replace(/\s+/g, '')
            }
        });
        console.log('📧 Using custom SMTP server for IronPulse mailings:', process.env.SMTP_HOST);
        return transporter;
    }

    // 2. Otherwise create a free Ethereal test inbox (instant preview, no config required)
    try {
        const testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
            host: testAccount.smtp.host,
            port: testAccount.smtp.port,
            secure: testAccount.smtp.secure,
            auth: {
                user: testAccount.user,
                pass: testAccount.pass
            }
        });
        etherealReady = true;
        console.log('📧 Using Ethereal Email test inbox for IronPulse mailings (account:', testAccount.user, ')');
        return transporter;
    } catch (err) {
        console.warn('⚠️ Could not connect to Ethereal, falling back to simulated mailer:', err.message);
        return null;
    }
}

/**
 * Generates the clean, modern HTML email template exactly matching ironpulse-email-preview.html.
 */
function generateEmailHtml({ to, name, role = 'member', newPassword, loginUrl = 'http://localhost:3000/index.html', forEmail = true }) {
    const firstName = (name || 'Member').trim().split(' ')[0];
    const roleLower = String(role).toLowerCase();
    const portalName = roleLower === 'admin' ? 'Admin Portal' : (roleLower === 'trainer' ? 'Trainer Portal' : 'Member Portal');

    let logoSrc = 'cid:ironpulse-logo';
    if (!forEmail) {
        try {
            const badgePath = path.join(__dirname, 'public', 'assets', 'ironpulse-ip-badge.png');
            if (fs.existsSync(badgePath)) {
                logoSrc = `data:image/png;base64,${fs.readFileSync(badgePath).toString('base64')}`;
            }
        } catch (e) {}
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>Your IronPulse login details</title>
</head>
<body style="margin:0;padding:0;background-color:#eceae6;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your IronPulse ${portalName} login details are inside.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eceae6;">
<tr><td align="center" style="padding:32px 12px;">

  <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">

    <!-- Header -->
    <tr><td style="background-color:#0a0a0a;padding:28px 36px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="vertical-align:middle;padding-right:14px;"><img src="${logoSrc}" width="48" height="48" alt="IronPulse" style="display:block;border:0;border-radius:10px;width:48px;height:48px;outline:none;text-decoration:none;"></td>
        <td style="vertical-align:middle;">
          <div style="font-size:20px;line-height:24px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">IronPulse Gym</div>
          <div style="font-size:13px;line-height:18px;color:#9a9a9a;">${portalName}</div>
        </td>
      </tr></table>
    </td></tr>

    <!-- Body -->
    <tr><td style="padding:40px 36px 8px 36px;">
      <h1 style="margin:0 0 12px 0;font-size:26px;line-height:32px;font-weight:700;color:#0a0a0a;">Hi ${firstName}, you’re all set.</h1>
      <p style="margin:0;font-size:16px;line-height:25px;color:#4a4a4a;">Here are your login details for the IronPulse ${portalName}. Use them to sign in and get back to your training.</p>
    </td></tr>

    <!-- Credentials -->
    <tr><td style="padding:28px 36px 8px 36px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f6f5f2;border:1px solid #e4e2dc;border-radius:12px;">
        <tr><td style="padding:22px 24px 6px 24px;">
          <div style="font-size:13px;line-height:18px;color:#7a7870;margin-bottom:4px;">Email (your ID)</div>
          <div style="font-size:16px;line-height:24px;font-weight:600;color:#0a0a0a;word-break:break-all;">${to}</div>
        </td></tr>
        <tr><td style="padding:0 24px;"><div style="height:1px;line-height:1px;background-color:#e4e2dc;margin:14px 0;">&nbsp;</div></td></tr>
        <tr><td style="padding:0 24px 22px 24px;">
          <div style="font-size:13px;line-height:18px;color:#7a7870;margin-bottom:8px;">New password</div>
          <span style="display:inline-block;background-color:#0a0a0a;color:#ffffff;font-family:'SFMono-Regular',Menlo,Consolas,'Courier New',monospace;font-size:18px;line-height:24px;font-weight:700;letter-spacing:1px;padding:10px 16px;border-radius:8px;">${newPassword}</span>
        </td></tr>
      </table>
    </td></tr>

    <!-- Security note -->
    <tr><td style="padding:28px 36px 40px 36px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-left:3px solid #2f5bff;">
        <tr><td style="padding:2px 0 2px 16px;">
          <p style="margin:0 0 4px 0;font-size:14px;line-height:21px;font-weight:700;color:#0a0a0a;">Keep your account safe</p>
          <p style="margin:0;font-size:14px;line-height:21px;color:#4a4a4a;">Didn’t ask for new login details? Tell the front desk right away.</p>
        </td></tr>
      </table>
    </td></tr>

    <!-- Footer -->
    <tr><td style="background-color:#f6f5f2;border-top:1px solid #e4e2dc;padding:22px 36px;">
      <p style="margin:0;font-size:12px;line-height:19px;color:#8a8880;text-align:left;">This is an automated message, so please don’t reply to it.</p>
    </td></tr>

  </table>

</td></tr>
</table>
</body>
</html>`;
}

/**
 * Dispatches a password recovery / credential email to a member, trainer, or admin.
 */
async function sendCredentialsEmail({ to, name, role = 'member', newPassword, loginUrl = 'http://localhost:3000/index.html' }) {
    const roleCapitalized = role.charAt(0).toUpperCase() + role.slice(1);
    const subject = `Your IronPulse login details`;

    const firstName = (name || 'Member').trim().split(' ')[0];
    const text = `Hi ${firstName}, you’re all set.

Here are your login details for the IronPulse ${roleCapitalized} Portal:

* Email (your ID): ${to}
* New password:     ${newPassword}

Portal URL: ${loginUrl}

Didn't ask for new login details? Tell the front desk right away.

This is an automated message, so please don't reply to it.
IronPulse Gym`;

    const emailHtml = generateEmailHtml({ to, name, role, newPassword, loginUrl, forEmail: true });
    const previewHtml = generateEmailHtml({ to, name, role, newPassword, loginUrl, forEmail: false });

    // Save a copy of the rendered HTML to Downloads and public directory for instant local preview
    try {
        const dlPath = path.join('C:', 'Users', 'soura', 'Downloads', 'ironpulse-email-preview.html');
        fs.writeFileSync(dlPath, previewHtml, 'utf-8');
        const pubPath = path.join(__dirname, 'public', 'ironpulse-email-preview.html');
        fs.writeFileSync(pubPath, previewHtml, 'utf-8');
    } catch (e) {
        console.warn('Could not write email preview copy:', e.message);
    }

    const badgePath = path.join(__dirname, 'public', 'assets', 'ironpulse-ip-badge.png');
    const attachments = [];
    if (fs.existsSync(badgePath)) {
        attachments.push({
            filename: 'ironpulse-ip-badge.png',
            path: badgePath,
            cid: 'ironpulse-logo',
            contentType: 'image/png'
        });
    }

    const mailOptions = {
        from: process.env.MAIL_FROM || `"IronPulse Gym" <${process.env.SMTP_USER || 'noreply@ironpulse.com'}>`,
        to,
        subject,
        text,
        html: emailHtml,
        attachments
    };

    try {
        const client = await getTransporter();
        if (client) {
            const info = await client.sendMail(mailOptions);
            const previewUrl = nodemailer.getTestMessageUrl(info) || null;
            console.log(`📬 [EMAIL SENT] Successfully dispatched credentials to ${to}`);
            return { success: true, previewUrl, messageId: info.messageId, to };
        }
    } catch (err) {
        console.warn('⚠️ Mail transport error:', err.message);
    }

    // Fallback if offline or transport fails
    console.log(`📬 [OFFLINE SIMULATED EMAIL] to ${to}`);
    return { success: true, previewUrl: null, simulated: true, to };
}

module.exports = {
    sendCredentialsEmail,
    generateEmailHtml
};
