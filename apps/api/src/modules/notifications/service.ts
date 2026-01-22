
import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.example.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
});

export interface EmailData {
    to: string;
    subject: string;
    text: string;
    html?: string;
}

export class NotificationService {
    async sendEmail(data: EmailData) {
        if (!SMTP_USER) {
            console.log(`[Email Mock] To: ${data.to}, Subject: ${data.subject}`);
            return { success: true, mocked: true };
        }

        try {
            await transporter.sendMail({
                from: `"FormWaypoint" <${SMTP_USER}>`,
                to: data.to,
                subject: data.subject,
                text: data.text,
                html: data.html,
            });
            return { success: true };
        } catch (e) {
            console.error('Email send failed:', e);
            throw e;
        }
    }
}

export const notificationService = new NotificationService();
