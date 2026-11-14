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
        from: `"5-a-side" <${process.env.GMAIL_USER}>`,
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
