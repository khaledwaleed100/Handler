import nodemailer from 'nodemailer';

/**
 * Transactional email through Gmail (app password). Used for password reset codes.
 */
let transporter = null;

const getTransporter = () => {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;
    if (!transporter) {
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
        });
    }
    return transporter;
};

export const emailConfigured = () => !!getTransporter();

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const sendResetCode = async (to, name, code) => {
    const t = getTransporter();
    if (!t) throw new Error('Email is not configured');
    await t.sendMail({
        from: `"The Handler" <${process.env.GMAIL_USER}>`,
        to,
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
    const t = getTransporter();
    if (!t) return;
    const link = appLink(url);
    await t.sendMail({
        from: `"The Handler" <${process.env.GMAIL_USER}>`,
        to,
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
