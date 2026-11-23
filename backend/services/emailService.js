import nodemailer from 'nodemailer';

/**
 * Transactional email: password reset codes and notifications.
 *
 * Two ways to send, picked automatically:
 *   1. Brevo (BREVO_API_KEY + EMAIL_FROM): over HTTPS. Use this on Render's free plan,
 *      which blocks outgoing mail-server (SMTP) connections since September 2025.
 *   2. Gmail with an app password (GMAIL_USER + GMAIL_APP_PASSWORD): over SMTP.
 *      Fine on your own computer or a paid server.
 */
let transporter = null;

const brevoKey = () => process.env.BREVO_API_KEY;
const fromAddress = () => process.env.EMAIL_FROM || process.env.GMAIL_USER;

const getTransporter = () => {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;
    if (!transporter) {
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
            // Give up quickly instead of hanging for minutes when the port is blocked.
            connectionTimeout: 10_000,
            greetingTimeout: 10_000,
            socketTimeout: 20_000
        });
    }
    return transporter;
};

/** Which way emails go out ('brevo' or 'gmail'), or null when email isn't set up. */
export const emailMethod = () => (brevoKey() && fromAddress() ? 'brevo' : getTransporter() ? 'gmail' : null);
export const emailConfigured = () => emailMethod() !== null;

const send = async ({ to, name, subject, text, html }) => {
    const method = emailMethod();
    if (method === 'brevo') {
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'api-key': brevoKey(), 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({
                sender: { name: 'The Handler', email: fromAddress() },
                to: [{ email: to, ...(name ? { name } : {}) }],
                subject,
                textContent: text,
                htmlContent: html
            }),
            signal: AbortSignal.timeout(15_000)
        });
        if (!res.ok) throw new Error(`Brevo refused the email (${res.status}): ${(await res.text()).slice(0, 200)}`);
        return;
    }
    if (method === 'gmail') {
        await getTransporter().sendMail({ from: `"The Handler" <${process.env.GMAIL_USER}>`, to, subject, text, html });
        return;
    }
    throw new Error('Email is not configured');
};

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const sendResetCode = async (to, name, code) => {
    await send({
        to, name,
        subject: `Your password reset code: ${code}`,
        text: `Hi ${name},\n\nYour code is ${code}. It expires in 15 minutes.\n\nIf you didn't ask for this, ignore this email.`,
        html: `
            <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: auto; padding: 24px;">
                <p>Hi ${escapeHtml(name)},</p>
                <p>Your password reset code is:</p>
                <p style="font-size: 32px; font-weight: 800; letter-spacing: 8px; margin: 16px 0;">${code}</p>
                <p style="color: #666;">It expires in 15 minutes. If you didn't ask for this, ignore this email.</p>
            </div>`
    });
};

/** Absolute link into the app for emails. */
const appLink = (path = '/') => `${(process.env.APP_URL || '').replace(/\/$/, '')}${path}`;

/** A short notification email: title, one line, and an "Open the app" button. */
export const sendNotificationEmail = async (to, name, { title, body, url = '/' }) => {
    if (!emailConfigured()) return;
    const link = appLink(url);
    await send({
        to, name,
        subject: title,
        text: `Hi ${name},

${body}

${link}

(You can turn these emails off in the app: Me → App → Emails.)`,
        html: `
            <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: auto; padding: 24px;">
                <p>Hi ${escapeHtml(name)},</p>
                <p style="font-size: 18px; font-weight: 700; margin: 16px 0 4px;">${escapeHtml(title)}</p>
                <p style="margin: 0 0 20px; white-space: pre-line;">${escapeHtml(body)}</p>
                <a href="${escapeHtml(link)}" style="display: inline-block; background: #16a34a; color: #fff; padding: 12px 20px; border-radius: 12px; text-decoration: none; font-weight: 700;">Open the app</a>
                <p style="color: #888; font-size: 12px; margin-top: 24px;">You can turn these emails off in the app: Me → App → Emails.</p>
            </div>`
    });
};

/** For the organizer's "Send me a test email" button: throws the real reason if it fails. */
export const sendTestEmail = async (to, name) => {
    await send({
        to, name,
        subject: 'Test email from The Handler ✅',
        text: `Hi ${name},\n\nIf you can read this, emails from the app are working.`,
        html: `<div style="font-family: system-ui, sans-serif; max-width: 480px; margin: auto; padding: 24px;"><p>Hi ${escapeHtml(name)},</p><p>If you can read this, emails from the app are working. ✅</p></div>`
    });
};
