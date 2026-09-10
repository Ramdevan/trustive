const nodemailer = require('nodemailer');

let transporter = null;

if (process.env.MAILGUN_SMTP_USER && process.env.MAILGUN_SMTP_PASS) {
    transporter = nodemailer.createTransport({
        host: 'smtp.mailgun.org',
        port: 587,
        secure: false,
        auth: {
            user: process.env.MAILGUN_SMTP_USER,
            pass: process.env.MAILGUN_SMTP_PASS
        }
    });
} else if (process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN) {
    const mg = require('nodemailer-mailgun-transport');
    const auth = {
        auth: {
            api_key: process.env.MAILGUN_API_KEY,
            domain: process.env.MAILGUN_DOMAIN
        },
        host: process.env.MAILGUN_HOST || 'api.mailgun.net'
    };
    transporter = nodemailer.createTransport(mg(auth));
} else {
    console.warn('⚠️ Mail credentials missing in .env. Verification emails will not be sent.');
}

const sendVerificationEmail = (to, token) => {
    if (!transporter) {
        console.error('Mail not configured. Email to', to, 'could not be sent.');
        return Promise.resolve({ skipped: true }); // Resolution to not crash the signup flow
    }
    const verificationLink = `${process.env.FRONTEND_URL || 'http://ppm.meme'}/api/user/verify-email?token=${token}`;
    const mailOptions = {
        from: `"Trustive Support" <support@${process.env.MAILGUN_DOMAIN || 'mg.ppm.meme'}>`,
        to: to,
        subject: 'Verify Your Email Address',
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0d0d0d; color: #ffffff; border-radius: 12px; border: 1px solid #e5a93e;">
        <h2 style="color: #e5a93e; text-align: center;">Welcome to Trustive Application</h2>
        <p style="font-size: 16px; line-height: 1.5;">Thank you for signing up! To complete your registration and access the dashboard, please verify your email address by clicking the button below:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationLink}" style="background-color: #e5a93e; color: #000000; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">Verify Email</a>
        </div>
        <p style="font-size: 14px; color: #888888;">If you didn't create an account, you can safely ignore this email.</p>
        <p style="font-size: 14px; color: #888888; border-top: 1px solid #333333; padding-top: 10px; margin-top: 20px;">Support Team, Trustive Project</p>
      </div>
    `
    };

    return new Promise((resolve, reject) => {
        transporter.sendMail(mailOptions, (err, info) => {
            if (err) {
                console.error('Mail Error:', err);
                reject(err);
            } else {
                resolve(info);
            }
        });
    });
};

const sendPasswordResetEmail = (to, token) => {
    if (!transporter) {
        console.error('Mail not configured. Password reset email to', to, 'could not be sent.');
        return Promise.resolve({ skipped: true });
    }
    const resetLink = `${process.env.FRONTEND_URL || 'http://ppm.meme'}/reset-password?token=${token}`;
    const mailOptions = {
        from: `"Trustive Support" <support@${process.env.MAILGUN_DOMAIN || 'mg.ppm.meme'}>`,
        to: to,
        subject: 'Reset Your Password - Trustive',
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0d0d0d; color: #ffffff; border-radius: 12px; border: 1px solid #e5a93e;">
        <h2 style="color: #e5a93e; text-align: center;">Reset Your Password</h2>
        <p style="font-size: 16px; line-height: 1.5;">We received a request to reset your password for your Trustive account. Click the button below to choose a new password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #e5a93e; color: #000000; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">Reset Password</a>
        </div>
        <p style="font-size: 14px; color: #aaaaaa;">This password reset link is valid for <strong>1 hour</strong>.</p>
        <p style="font-size: 14px; color: #888888;">If you did not request a password reset, please ignore this email. Your password will remain unchanged.</p>
        <p style="font-size: 14px; color: #888888; border-top: 1px solid #333333; padding-top: 10px; margin-top: 20px;">Support Team, Trustive Project</p>
      </div>
    `
    };

    return new Promise((resolve, reject) => {
        transporter.sendMail(mailOptions, (err, info) => {
            if (err) {
                console.error('Mail Error (Password Reset):', err);
                reject(err);
            } else {
                resolve(info);
            }
        });
    });
};

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
