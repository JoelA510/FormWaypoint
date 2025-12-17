const nodemailer = require('nodemailer');

const config = require('../config');

// Email configuration
const transporter = nodemailer.createTransporter({
    host: config.email.host,
    port: config.email.port,
    secure: false, // Use TLS
    auth: {
        user: config.email.user,
        pass: config.email.pass
    }
});

// Email templates
const templates = {
    comment: (data) => ({
        subject: `New comment on document: ${data.documentName}`,
        text: `${data.userName} commented: ${data.commentText}\n\nView document: ${data.documentUrl}`,
        html: `
            <h2>New Comment</h2>
            <p><strong>${data.userName}</strong> commented on <strong>${data.documentName}</strong>:</p>
            <p>${data.commentText}</p>
            <p><a href="${data.documentUrl}">View Document</a></p>
        `
    }),

    mention: (data) => ({
        subject: `You were mentioned in a comment`,
        text: `${data.userName} mentioned you: ${data.commentText}\n\nView document: ${data.documentUrl}`,
        html: `
            <h2>You Were Mentioned</h2>
            <p><strong>${data.userName}</strong> mentioned you in a comment:</p>
            <p>${data.commentText}</p>
            <p><a href="${data.documentUrl}">View Document</a></p>
        `
    }),

    assignment: (data) => ({
        subject: `Document assigned to you: ${data.documentName}`,
        text: `You have been assigned to work on ${data.documentName}.\n\nView document: ${data.documentUrl}`,
        html: `
            <h2>New Assignment</h2>
            <p>You have been assigned to work on <strong>${data.documentName}</strong>.</p>
            <p><a href="${data.documentUrl}">View Document</a></p>
        `
    }),

    completion: (data) => ({
        subject: `Document processing complete: ${data.documentName}`,
        text: `${data.documentName} has finished processing.\n\nView document: ${data.documentUrl}`,
        html: `
            <h2>Processing Complete</h2>
            <p><strong>${data.documentName}</strong> has finished processing.</p>
            <p><a href="${data.documentUrl}">View Document</a></p>
        `
    })
};

/**
 * Send an email notification
 * @param {string} to - Recipient email
 * @param {string} type - Template type (comment, mention, assignment, completion)
 * @param {object} data - Template data
 */
async function sendEmail(to, type, data) {
    if (!to || !process.env.SMTP_USER) {
        console.log('[Email] Skipping email send (no recipient or SMTP not configured)');
        return false;
    }

    try {
        const template = templates[type];
        if (!template) {
            throw new Error(`Unknown email template: ${type}`);
        }

        const emailContent = template(data);

        await transporter.sendMail({
            from: `"Shipping Doc Gen" <${process.env.SMTP_USER}>`,
            to,
            ...emailContent
        });

        console.log(`[Email] Sent ${type} email to ${to}`);
        return true;
    } catch (error) {
        console.error('[Email] Send error:', error);
        return false;
    }
}

module.exports = {
    sendEmail
};
