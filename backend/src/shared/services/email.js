import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
// === IMPORT THE NEW TEMPLATES ===
import { getVerificationTemplate, getResetPasswordTemplate } from './email-templates.js';

dotenv.config();

const hasCredentials = process.env.EMAIL_USER && process.env.EMAIL_PASS;
let transporter = null;

if (hasCredentials) {
  transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
} else {
  console.log('⚠️ [Email Service] Dev Mode: Emails will be logged to console.');
}

/**
 * Generic Send Function (Unchanged)
 */
export const sendEmail = async ({ to, subject, html }) => {
  if (!transporter) {
    console.log('\n==================================================');
    console.log('📨 [MOCK EMAIL] (Dev Mode)');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    const linkMatch = html.match(/href="(.*?)"/);
    if (linkMatch) console.log(`🔗 LINK: ${linkMatch[1]}`);
    console.log('==================================================\n');
    return { messageId: 'mock-id' };
  }

  try {
    const info = await transporter.sendMail({
      from: `"MaxiStore Algérie" <${process.env.EMAIL_USER}>`, // Updated Name
      to,
      subject,
      html,
    });
    console.log(`✅ Email sent: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error('❌ Email sending failed:', error.message);
    return null;
  }
};

/**
 * Template: Verification Email (UPDATED)
 */
export const sendVerificationEmail = async (email, token, name) => {
  const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${token}`;
  
  // Use the new HTML generator
  const html = getVerificationTemplate(verifyUrl, name);

  await sendEmail({ 
    to: email, 
    subject: 'Bienvenue sur MaxiStore ! Confirmez votre email', 
    html 
  });
};

/**
 * Template: Password Reset (UPDATED)
 */
export const sendPasswordResetEmail = async (email, token) => {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;

  // Use the new HTML generator
  const html = getResetPasswordTemplate(resetUrl);

  await sendEmail({ 
    to: email, 
    subject: 'Réinitialisation de votre mot de passe', 
    html 
  });
};