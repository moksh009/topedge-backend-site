import express from 'express';
import nodemailer from 'nodemailer';
import cors from 'cors';
import dotenv from 'dotenv';
import serverless from 'serverless-http';
import crypto from 'crypto';
import admin from 'firebase-admin';
import { commonEmailStyles } from '../../lib/emailStyles.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;
const OTP_SECRET = process.env.OTP_SECRET || 'topedge-secret-key-change-in-prod';

let firebaseInitialized = false;

try {
  if (!admin.apps.length) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      firebaseInitialized = true;
      console.log('[FIREBASE] Admin initialized with service account');
    } else {
      console.warn('[FIREBASE] FIREBASE_SERVICE_ACCOUNT_KEY not set. Protected resource APIs will be disabled.');
    }
  } else {
    firebaseInitialized = true;
  }
} catch (error) {
  firebaseInitialized = false;
  console.error('[FIREBASE] Failed to initialize admin SDK:', error);
}

const firestore = () => {
  if (!firebaseInitialized) {
    throw new Error('Firebase admin not initialized');
  }
  return admin.firestore();
};

const authAdmin = () => {
  if (!firebaseInitialized) {
    throw new Error('Firebase admin not initialized');
  }
  return admin.auth();
};

// Middleware
const allowedOrigins = [
  'https://topedgeai.com',
  'https://www.topedgeai.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'https://topedgeai.netlify.app',
  'https://main.dvuabchwge8pz.amplifyapp.com',
  'https://topedge-frontend-site.onrender.com'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    try {
      const url = new URL(origin);
      const hostname = url.hostname;

      const hostAllowed =
        allowedOrigins.some(o => {
          try {
            const allowedUrl = new URL(o);
            return allowedUrl.hostname === hostname && allowedUrl.protocol === url.protocol;
          } catch { return false; }
        }) ||
        hostname === 'localhost' ||
        hostname.endsWith('.netlify.app') ||
        hostname.endsWith('.amplifyapp.com') ||
        hostname.endsWith('.onrender.com') ||
        hostname === 'topedgeai.com' ||
        hostname === 'www.topedgeai.com';

      if (hostAllowed) {
        return callback(null, true);
      }

      console.warn('[CORS] Blocked origin:', origin, 'hostname:', hostname);
      return callback(new Error('Not allowed by CORS'));
    } catch (error) {
      console.error('[CORS] Error parsing origin:', origin, error);
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 600
}));

// Add preflight handling
app.options('*', cors());

app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const origin = req.headers.origin || 'n/a';
  console.log(`[REQ] ${new Date().toISOString()} ${req.method} ${req.originalUrl} origin=${origin}`);
  if (req.method === 'POST') {
    try {
      const keys = Object.keys(req.body || {});
      console.log('[REQ] body keys:', keys);
    } catch {}
  }
  next();
});

// Environment validation
const hasEmailUser = !!process.env.EMAIL_USER && process.env.EMAIL_USER.trim().length > 0;
const hasEmailPass = !!process.env.EMAIL_PASS && process.env.EMAIL_PASS.trim().length > 0;
console.log('[ENV] EMAIL_USER present:', hasEmailUser, 'EMAIL_PASS present:', hasEmailPass);

app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'topedge-backend' });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Create transporter with explicit SMTP configuration
const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
const smtpPort = Number(process.env.SMTP_PORT || 465);
const smtpSecure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : true;

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false
  },
  pool: true,
  maxConnections: 5,
  maxMessages: 100
});

// Verify email configuration
transporter.verify((error, success) => {
  if (error) {
    console.error('[MAIL] verify error:', error?.message || error, error?.code, error?.response);
  } else {
    console.log('[MAIL] transport verified, ready to send emails');
  }
});

// Unified email sending function with retry logic
const sendEmail = async (mailOptions, retries = 3) => {
  if (!hasEmailUser || !hasEmailPass) {
    throw new Error('Email credentials missing. Configure EMAIL_USER and EMAIL_PASS.');
  }
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`[MAIL] Attempt ${i + 1} send with options:`, {
        ...mailOptions,
        auth: { user: process.env.EMAIL_USER }
      });
      
      const info = await transporter.sendMail(mailOptions);
      console.log('[MAIL] sent:', info.response);
      return { success: true, message: 'Email sent successfully' };
    } catch (error) {
      const msg = error?.message || String(error);
      const code = error?.code || '';
      const resp = error?.response || '';
      console.error(`[MAIL] send error attempt ${i + 1}:`, msg, code, resp);
      if (/Username and Password not accepted/i.test(msg) || /EAUTH/i.test(code)) {
        throw new Error('Invalid Gmail credentials. Use a Google App Password (requires 2-Step Verification).');
      }
      if (i === retries - 1) {
        throw new Error(`Failed to send email after ${retries} attempts: ${msg}`);
      }
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
};

// Booking Form - User Email
app.post('/api/send-user-email', async (req, res) => {
  try {
    const { name, email, phone, companyName, date, time, additionalInfo } = req.body;

    await sendEmail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Booking Confirmation - TopEdge AI Consultation',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Booking Confirmation - TopEdge AI</title>
            <style>${commonEmailStyles}</style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0; font-size: 32px; font-weight: 700;">TopEdge AI</h1>
                <p style="margin-top: 12px; font-size: 20px; opacity: 0.9;">Booking Confirmed</p>
              </div>
              
              <div class="content">
                <div class="section">
                  <h2 style="color: #1F2937; font-size: 24px; margin-bottom: 16px;">Hello ${name},</h2>
                  <p style="color: #4B5563; font-size: 16px; line-height: 1.8;">
                    Thank you for booking a consultation with TopEdge AI. We're looking forward to discussing how we can help transform your business.
                  </p>
                  
                  <div class="premium-box">
                    <h3 style="color: #0A84FF; font-size: 20px; margin-bottom: 16px;">Your Meeting Details</h3>
                    <div class="info-grid">
                      <div class="info-item">
                        <p class="info-label">Date & Time</p>
                        <p class="info-value">${date} at ${time}</p>
                      </div>
                      <div class="info-item">
                        <p class="info-label">Company</p>
                        <p class="info-value">${companyName}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="section">
                  <h3 class="section-title">What to Expect</h3>
                  <div style="background: #F9FAFB; padding: 24px; border-radius: 12px;">
                    <ol style="margin: 0; padding-left: 24px; color: #4B5563;">
                      <li style="margin-bottom: 16px; padding-left: 8px;">
                        <strong style="color: #1F2937;">Meeting Link</strong>
                        <p style="margin-top: 4px; color: #6B7280;">We'll send you a Google Meet link shortly</p>
                      </li>
                      <li style="margin-bottom: 16px; padding-left: 8px;">
                        <strong style="color: #1F2937;">Duration</strong>
                        <p style="margin-top: 4px; color: #6B7280;">The consultation typically lasts 30-45 minutes</p>
                      </li>
                      <li style="padding-left: 8px;">
                        <strong style="color: #1F2937;">Preparation</strong>
                        <p style="margin-top: 4px; color: #6B7280;">Please bring any specific questions or requirements</p>
                      </li>
                    </ol>
                  </div>
                </div>

                <div class="section" style="text-align: center;">
                  <h3 style="color: #1F2937; font-size: 20px; margin-bottom: 16px;">
                    Need to Reschedule?
                  </h3>
                  <p style="color: #4B5563; margin-bottom: 24px;">
                    If you need to change your appointment time, please reply to this email.
                  </p>
                </div>

                <div class="footer">
                  <p style="margin-bottom: 12px;">Best regards,</p>
                  <p style="font-weight: 600; color: #1F2937;">Team TopEdge AI</p>
                  <div style="margin-top: 24px;">
                    <p style="color: #9CA3AF; font-size: 12px;">© 2024 TopEdge AI. All rights reserved.</p>
                  </div>
                </div>
              </div>
            </div>
          </body>
        </html>
      `
    });

    res.status(200).json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ message: 'Failed to send email', error: error.message });
  }
});

// Booking - Admin Email
app.post('/api/send-admin-email', async (req, res) => {
  try {
    const { name, email, phone, companyName, date, time, additionalInfo } = req.body;

    await sendEmail({
      from: process.env.EMAIL_USER,
      to: 'acctopedge@gmail.com',
      subject: `New Booking Request: ${companyName || ''} - ${name}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>New Booking Request - TopEdge</title>
            <style>${commonEmailStyles}</style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <span class="logo-text">TopEdge AI</span>
                <p class="header-subtitle">New Consultation Booking</p>
              </div>
              
              <div class="content">
                <div class="section" style="text-align: center; background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 12px; margin: 24px 32px;">
                  <h3 class="section-title" style="color: #818CF8; margin-bottom: 8px;">New Booking Alert</h3>
                  <p class="text-muted" style="font-size: 18px; color: #F8FAFC;">${date} at ${time}</p>
                </div>

                <div class="section">
                  <h3 class="section-title">Client Information</h3>
                  <div class="info-grid">
                    <div class="info-item">
                      <p class="info-label">Name</p>
                      <p class="info-value">${name}</p>
                    </div>
                    <div class="info-item">
                      <p class="info-label">Email</p>
                      <p class="info-value">
                        <a href="mailto:${email}" style="color: #818CF8; text-decoration: none;">${email}</a>
                      </p>
                    </div>
                    ${phone ? `
                    <div class="info-item">
                      <p class="info-label">Phone</p>
                      <p class="info-value">
                        <a href="tel:${phone}" style="color: #818CF8; text-decoration: none;">${phone}</a>
                      </p>
                    </div>
                    ` : ''}
                    ${companyName ? `
                    <div class="info-item">
                      <p class="info-label">Company</p>
                      <p class="info-value">${companyName}</p>
                    </div>
                    ` : ''}
                    ${additionalInfo ? `
                    <div class="info-item" style="grid-column: 1 / -1;">
                      <p class="info-label">Additional Notes</p>
                      <p class="info-value">${additionalInfo}</p>
                    </div>
                    ` : ''}
                  </div>
                </div>

                <div class="section" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 12px; margin: 0 32px 24px;">
                  <h3 class="section-title" style="color: #F87171;">Required Actions</h3>
                  <div style="color: #CBD5E1;">
                    <p>Please complete the following tasks:</p>
                    <ol style="margin: 15px 0 0 20px;">
                      <li style="margin-bottom: 10px;">Add the meeting to your calendar</li>
                      <li style="margin-bottom: 10px;">Send a calendar invite with meeting link to the client</li>
                      <li style="margin-bottom: 10px;">Review any additional notes or requirements</li>
                      <li style="margin-bottom: 10px;">Prepare consultation materials</li>
                      <li>Update CRM with booking details</li>
                    </ol>
                  </div>
                </div>

                <div class="footer">
                  <p>© 2024 TopEdge AI. All rights reserved.</p>
                </div>
              </div>
            </div>
          </body>
        </html>
      `
    });

    res.status(200).json({ message: 'Admin notification sent successfully' });
  } catch (error) {
    console.error('Error sending admin notification:', error, error?.message, error?.response, error?.stack);
    res.status(500).json({
      message: 'Failed to send admin notification',
      error: error.message,
      details: error.response || null,
      stack: error.stack || null
    });
  }
});

// Maintenance Form - User Email template update
app.post('/api/send-maintenance-user-email', async (req, res) => {
  try {
    const { name, email, plan, emailTemplate } = req.body;

    const isChatbot = plan.toLowerCase().includes('chatbot');
    const planType = isChatbot ? 'Chatbot' : 'AI Voice Agent';
    const planColor = isChatbot ? '#4D07E3' : '#0A84FF';
    const planGradient = isChatbot 
      ? 'linear-gradient(135deg, #4D07E3 0%, #7A0BC0 100%)'
      : 'linear-gradient(135deg, #0A84FF 0%, #3B82F6 100%)';

    await sendEmail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Welcome to TopEdge AI - Your ${planType} Journey Begins`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${planType} Solution - TopEdge AI</title>
            <style>${commonEmailStyles}</style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0; font-size: 32px; font-weight: 700;">TopEdge AI</h1>
                <p style="margin-top: 12px; font-size: 20px; opacity: 0.9;">Transform Your Business with AI</p>
              </div>
              
              <div class="content">
                <div class="section">
                  <h2 style="color: #1F2937; font-size: 24px; margin-bottom: 16px;">Hello ${name},</h2>
                  <p style="color: #4B5563; font-size: 16px; line-height: 1.8;">
                    Thank you for choosing TopEdge AI's ${planType} solution. We're excited to help you revolutionize your business operations!
                  </p>
                  
                  <div class="premium-box">
                    <h3 style="color: ${planColor}; font-size: 20px; margin-bottom: 16px;">Your Selected Plan</h3>
                    <p style="color: #1F2937; font-size: 18px; font-weight: 600;">${plan}</p>
                  </div>
                </div>

                <div class="section" style="background: linear-gradient(135deg, rgba(10, 132, 255, 0.04) 0%, rgba(59, 130, 246, 0.04) 100%);">
                  <h3 class="section-title">Discover Your ROI Potential</h3>
                  <div class="stats-grid">
                    <div class="stat-item">
                      <div class="stat-number">28%↑</div>
                      <div class="stat-label">Increase in Lead Capture</div>
                    </div>
                    <div class="stat-item">
                      <div class="stat-number">$10K+</div>
                      <div class="stat-label">Additional Revenue in 45 Days</div>
                    </div>
                    <div class="stat-item">
                      <div class="stat-number">90%↓</div>
                      <div class="stat-label">Reduction in Response Time</div>
                    </div>
                  </div>
                  
                  <div style="text-align: center; margin-top: 24px;">
                    <p style="color: #1F2937; font-size: 16px; margin-bottom: 20px;">
                      <strong>Calculate your specific ROI based on your business metrics</strong>
                    </p>
                    <a href="https://topedgeai.com/roi" class="button">Calculate Your ROI Now →</a>
                  </div>
                </div>

                <div class="section">
                  <h3 class="section-title">Key Benefits</h3>
                  <div class="info-grid">
                    <div class="info-item">
                      <div style="font-size: 24px; margin-bottom: 8px;">💰</div>
                      <h4 style="color: #1F2937; margin-bottom: 8px;">Revenue Growth</h4>
                      <p style="color: #6B7280; font-size: 14px;">Recover $10,000+ in missed opportunities within 45 days</p>
                    </div>
                    <div class="info-item">
                      <div style="font-size: 24px; margin-bottom: 8px;">📈</div>
                      <h4 style="color: #1F2937; margin-bottom: 8px;">Booking Rate</h4>
                      <p style="color: #6B7280; font-size: 14px;">Increase appointment bookings by up to 2.5x</p>
                    </div>
                    <div class="info-item">
                      <div style="font-size: 24px; margin-bottom: 8px;">⚡</div>
                      <h4 style="color: #1F2937; margin-bottom: 8px;">Efficiency</h4>
                      <p style="color: #6B7280; font-size: 14px;">Save 30+ hours per week in manual work</p>
                    </div>
                  </div>
                </div>

                <div class="section">
                  <h3 class="section-title">Next Steps</h3>
                  <div style="background: #F9FAFB; padding: 24px; border-radius: 12px;">
                    <ol style="margin: 0; padding-left: 24px; color: #4B5563;">
                      <li style="margin-bottom: 16px; padding-left: 8px;">
                        <strong style="color: #1F2937;">Initial Contact</strong>
                        <p style="margin-top: 4px; color: #6B7280;">Our team will reach out within 24 hours</p>
                      </li>
                      <li style="margin-bottom: 16px; padding-left: 8px;">
                        <strong style="color: #1F2937;">Requirements Analysis</strong>
                        <p style="margin-top: 4px; color: #6B7280;">We'll understand your specific needs</p>
                      </li>
                      <li style="margin-bottom: 16px; padding-left: 8px;">
                        <strong style="color: #1F2937;">Solution Design</strong>
                        <p style="margin-top: 4px; color: #6B7280;">Get your customized implementation plan</p>
                      </li>
                      <li style="padding-left: 8px;">
                        <strong style="color: #1F2937;">Demo Session</strong>
                        <p style="margin-top: 4px; color: #6B7280;">See your tailored solution in action</p>
                      </li>
                    </ol>
                  </div>
                </div>

                <div class="section" style="text-align: center;">
                  <h3 style="color: #1F2937; font-size: 20px; margin-bottom: 16px;">
                    Ready to Transform Your Business?
                  </h3>
                  <p style="color: #4B5563; margin-bottom: 24px;">
                    Reply with "Tell me more" to unlock exclusive insights and success stories!
                  </p>
                  <div class="divider"></div>
                  <p style="color: ${planColor}; font-weight: 600; margin-top: 24px;">
                    P.S. Most of our clients achieve positive ROI within the first month!
                  </p>
                </div>

                <div class="footer">
                  <p style="margin-bottom: 12px;">Best regards,</p>
                  <p style="font-weight: 600; color: #1F2937;">Team TopEdge AI</p>
                  <div style="margin-top: 24px;">
                    <p style="color: #9CA3AF; font-size: 12px;">© 2024 TopEdge AI. All rights reserved.</p>
                  </div>
                </div>
              </div>
            </div>
          </body>
        </html>
      `
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error sending email:', error, error?.message, error?.response, error?.stack);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send email',
      details: error.response || null,
      stack: error.stack || null
    });
  }
});

// Maintenance Form - Admin Email
app.post('/api/send-maintenance-admin-email', async (req, res) => {
  try {
    const { name, email, phone, plan } = req.body;

    const isChatbot = plan.toLowerCase().includes('chatbot');
    const planType = isChatbot ? 'Chatbot' : 'AI Voice Agent';
    const planColor = isChatbot ? '#4D07E3' : '#0A84FF';
    const planGradient = isChatbot 
      ? 'linear-gradient(135deg, #4D07E3 0%, #7A0BC0 100%)'
      : 'linear-gradient(135deg, #0A84FF 0%, #3B82F6 100%)';

    await sendEmail({
      from: process.env.EMAIL_USER,
      to: 'acctopedge@gmail.com',
      subject: `New ${planType} Inquiry: ${plan} Plan`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>New ${planType} Inquiry - TopEdge</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>${commonEmailStyles}</style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <span class="logo-text">TopEdge AI</span>
                <p class="header-subtitle">New ${planType} Inquiry</p>
              </div>
              
              <div class="content">
                <div class="section" style="text-align: center; background: ${planGradient}; border-radius: 12px; margin: 24px 32px; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                  <h3 style="color: white; margin-bottom: 8px; font-size: 24px; font-weight: 700;">${plan}</h3>
                  <p style="color: rgba(255,255,255,0.9); font-size: 16px;">${planType} Inquiry</p>
                </div>
                
                <div class="section">
                  <h3 class="section-title">Client Information</h3>
                  <div class="info-grid">
                    <div class="info-item">
                      <p class="info-label">Name</p>
                      <p class="info-value">${name}</p>
                    </div>
                    <div class="info-item">
                      <p class="info-label">Email</p>
                      <p class="info-value">
                        <a href="mailto:${email}" style="color: #818CF8; text-decoration: none;">${email}</a>
                      </p>
                    </div>
                    <div class="info-item">
                      <p class="info-label">Phone</p>
                      <p class="info-value">
                        <a href="tel:${phone}" style="color: #818CF8; text-decoration: none;">${phone}</a>
                      </p>
                    </div>
                    <div class="info-item">
                      <p class="info-label">Selected Plan</p>
                      <p class="info-value" style="color: #818CF8;">${plan}</p>
                    </div>
                  </div>
                </div>

                <div class="section" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 12px; margin: 0 32px 24px;">
                  <h3 class="section-title" style="color: #F87171;">Action Required</h3>
                  <div style="color: #CBD5E1;">
                    <p>Please take the following actions:</p>
                    <ol style="margin: 15px 0 0 20px;">
                      <li style="margin-bottom: 10px;">Review the client's requirements</li>
                      <li style="margin-bottom: 10px;">Prepare a customized solution proposal</li>
                      <li style="margin-bottom: 10px;">Schedule a demo call</li>
                      <li>Respond within 24 hours</li>
                    </ol>
                  </div>
                </div>
                
                <div class="footer">
                  <p>© 2024 TopEdge AI. All rights reserved.</p>
                </div>
              </div>
            </div>
          </body>
        </html>
      `
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error sending email:', error, error?.message, error?.response, error?.stack);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send email',
      details: error.response || null,
      stack: error.stack || null
    });
  }
});

// Contact Form - User Email template update
app.post('/api/send-contact-user-email', async (req, res) => {
  try {
    const { name, email, phone, companyName, subject, message } = req.body;

    await sendEmail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Welcome to TopEdge AI - We\'ve Received Your Message',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Welcome to TopEdge AI</title>
            <style>${commonEmailStyles}</style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0; font-size: 32px; font-weight: 700;">TopEdge AI</h1>
                <p style="margin-top: 12px; font-size: 20px; opacity: 0.9;">Thank You for Reaching Out!</p>
              </div>
              
              <div class="content">
                <div class="section">
                  <h2 style="color: #1F2937; font-size: 24px; margin-bottom: 16px;">Hello ${name},</h2>
                  <p style="color: #4B5563; font-size: 16px; line-height: 1.8;">
                    Thank you for contacting TopEdge AI. We're excited to help you explore how AI can transform your business operations.
                  </p>
                  
                  <div class="premium-box">
                    <h3 style="color: #0A84FF; font-size: 20px; margin-bottom: 16px;">Your Message Details</h3>
                    <div style="margin-bottom: 16px;">
                      <p style="color: #6B7280; font-size: 14px; margin-bottom: 4px;">Subject</p>
                      <p style="color: #1F2937; font-size: 16px; font-weight: 500;">${subject}</p>
                    </div>
                    <div>
                      <p style="color: #6B7280; font-size: 14px; margin-bottom: 4px;">Message</p>
                      <p style="color: #1F2937; font-size: 16px;">${message}</p>
                    </div>
                  </div>
                </div>

                <div class="section" style="background: linear-gradient(135deg, rgba(10, 132, 255, 0.04) 0%, rgba(59, 130, 246, 0.04) 100%);">
                  <h3 class="section-title">Why Businesses Choose TopEdge AI</h3>
                  <div class="stats-grid">
                    <div class="stat-item">
                      <div class="stat-number">2.5x</div>
                      <div class="stat-label">Increase in Booking Rate</div>
                    </div>
                    <div class="stat-item">
                      <div class="stat-number">30+</div>
                      <div class="stat-label">Hours Saved Weekly</div>
                    </div>
                    <div class="stat-item">
                      <div class="stat-number">24/7</div>
                      <div class="stat-label">Customer Engagement</div>
                    </div>
                  </div>
                  
                  <div style="text-align: center; margin-top: 24px;">
                    <p style="color: #1F2937; font-size: 16px; margin-bottom: 20px;">
                      <strong>See what these numbers mean for your business</strong>
                    </p>
                    <a href="https://topedgeai.com/roi" class="button">Calculate Your ROI →</a>
                  </div>
                </div>

                <div class="section">
                  <h3 class="section-title">What Happens Next?</h3>
                  <div style="background: #F9FAFB; padding: 24px; border-radius: 12px;">
                    <ol style="margin: 0; padding-left: 24px; color: #4B5563;">
                      <li style="margin-bottom: 16px; padding-left: 8px;">
                        <strong style="color: #1F2937;">Message Review</strong>
                        <p style="margin-top: 4px; color: #6B7280;">Our team is analyzing your requirements</p>
                      </li>
                      <li style="margin-bottom: 16px; padding-left: 8px;">
                        <strong style="color: #1F2937;">Solution Preparation</strong>
                        <p style="margin-top: 4px; color: #6B7280;">We're crafting the perfect solution for you</p>
                      </li>
                      <li style="margin-bottom: 16px; padding-left: 8px;">
                        <strong style="color: #1F2937;">Quick Response</strong>
                        <p style="margin-top: 4px; color: #6B7280;">Expect to hear from us within 24 hours</p>
                      </li>
                      <li style="padding-left: 8px;">
                        <strong style="color: #1F2937;">Strategy Discussion</strong>
                        <p style="margin-top: 4px; color: #6B7280;">We'll schedule a call to discuss next steps</p>
                      </li>
                    </ol>
                  </div>
                </div>

                <div class="section" style="text-align: center;">
                  <h3 style="color: #1F2937; font-size: 20px; margin-bottom: 16px;">
                    While You Wait...
                  </h3>
                  <p style="color: #4B5563; margin-bottom: 24px;">
                    Explore our success stories and see how other businesses have transformed with TopEdge AI
                  </p>
                  <a href="https://topedgeai.com/case-studies" class="button">View Success Stories →</a>
                </div>

                <div class="footer">
                  <p style="margin-bottom: 12px;">Best regards,</p>
                  <p style="font-weight: 600; color: #1F2937;">Team TopEdge AI</p>
                  <div style="margin-top: 24px;">
                    <p style="color: #9CA3AF; font-size: 12px;">© 2024 TopEdge AI. All rights reserved.</p>
                  </div>
                </div>
              </div>
            </div>
          </body>
        </html>
      `
    });

    res.status(200).json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ message: 'Failed to send email', error: error.message });
  }
});

// Contact Form - Admin Email
app.post('/api/send-contact-admin-email', async (req, res) => {
  try {
    const { name, email, phone, companyName, subject, message, queries } = req.body;

    await sendEmail({
      from: process.env.EMAIL_USER,
      to: 'acctopedge@gmail.com',
      subject: `New Contact Form Submission: ${subject}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>New Contact Form Submission - TopEdge</title>
            <style>${commonEmailStyles}</style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <span class="logo-text">TopEdge AI</span>
                <p class="header-subtitle">New Contact Form Submission</p>
              </div>
              
              <div class="content">
                <div class="section" style="text-align: center; background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 12px; margin: 24px 32px;">
                  <h3 class="section-title" style="color: #818CF8; margin-bottom: 8px;">New Message</h3>
                  <p class="text-muted" style="font-size: 16px; color: #F8FAFC;">${subject}</p>
                </div>

                <div class="section">
                  <h3 class="section-title">Contact Details</h3>
                  <div class="info-grid">
                    <div class="info-item">
                      <p class="info-label">Name</p>
                      <p class="info-value">${name}</p>
                    </div>
                    <div class="info-item">
                      <p class="info-label">Email</p>
                      <p class="info-value">
                        <a href="mailto:${email}" style="color: #818CF8; text-decoration: none;">${email}</a>
                      </p>
                    </div>
                    ${phone ? `
                    <div class="info-item">
                      <p class="info-label">Phone</p>
                      <p class="info-value">
                        <a href="tel:${phone}" style="color: #818CF8; text-decoration: none;">${phone}</a>
                      </p>
                    </div>
                    ` : ''}
                    ${companyName ? `
                    <div class="info-item">
                      <p class="info-label">Company</p>
                      <p class="info-value">${companyName}</p>
                    </div>
                    ` : ''}
                    ${queries ? `
                    <div class="info-item">
                      <p class="info-label">Monthly Queries</p>
                      <p class="info-value">${queries}</p>
                    </div>
                    ` : ''}
                  </div>
                </div>

                <div class="section">
                  <h3 class="section-title">Message Content</h3>
                  <div style="background: #0F172A; border-radius: 8px; padding: 20px; border: 1px solid #334155;">
                    <p style="color: #E2E8F0; white-space: pre-wrap; margin: 0;">${message}</p>
                  </div>
                </div>

                <div class="section" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 12px; margin: 0 32px 24px;">
                  <h3 class="section-title" style="color: #F87171;">Action Required</h3>
                  <div style="color: #CBD5E1;">
                    <p>Please take the following actions:</p>
                    <ol style="margin: 15px 0 0 20px;">
                      <li style="margin-bottom: 10px;">Review the inquiry details</li>
                      <li style="margin-bottom: 10px;">Prepare a response</li>
                      <li style="margin-bottom: 10px;">Respond within 24-48 hours</li>
                      <li>Update the CRM if necessary</li>
                    </ol>
                  </div>
                </div>

                <div class="footer">
                  <p>© 2024 TopEdge AI. All rights reserved.</p>
                </div>
              </div>
            </div>
          </body>
        </html>
      `
    });

    res.status(200).json({ message: 'Admin notification sent successfully' });
  } catch (error) {
    console.error('Error sending admin notification:', error, error?.message, error?.response, error?.stack);
    res.status(500).json({
      message: 'Failed to send admin notification',
      error: error.message,
      details: error.response || null,
      stack: error.stack || null
    });
  }
});

app.post('/api/access-request-user-email', async (req, res) => {
  try {
    const { buyerName, buyerEmail, resourceTitle } = req.body;

    await sendEmail({
      from: process.env.EMAIL_USER,
      to: buyerEmail,
      subject: 'We received your access request',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Access request received</title>
            <style>${commonEmailStyles}</style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin:0;font-size:28px;font-weight:700;">TopEdge AI</h1>
                <p style="margin-top:8px;font-size:18px;opacity:0.9;">Access request received</p>
              </div>
              <div class="content">
                <div class="section">
                  <h2 style="color:#1F2937;font-size:20px;margin-bottom:12px;">Hello ${buyerName || 'there'},</h2>
                  <p style="color:#4B5563;font-size:15px;line-height:1.7;">
                    Your request for access to <strong>${resourceTitle || 'a paid resource'}</strong> has been sent to the creator.
                    Complete payment with the creator. You will receive access only after the creator approves your request.
                  </p>
                </div>
              </div>
            </div>
          </body>
        </html>
      `
    });

    res.status(200).json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error sending access request user email:', error);
    res.status(500).json({ message: 'Failed to send email', error: error.message });
  }
});

app.post('/api/access-request-creator-email', async (req, res) => {
  try {
    const { creatorName, creatorEmail, buyerName, buyerEmail, resourceTitle, priceText, approvalUrl } = req.body;

    await sendEmail({
      from: process.env.EMAIL_USER,
      to: creatorEmail,
      subject: 'New paid resource access request',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Access request pending</title>
            <style>${commonEmailStyles}</style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin:0;font-size:28px;font-weight:700;">TopEdge AI</h1>
                <p style="margin-top:8px;font-size:18px;opacity:0.9;">New access request</p>
              </div>
              <div class="content">
                <div class="section">
                  <h2 style="color:#1F2937;font-size:20px;margin-bottom:12px;">Hello ${creatorName || 'Creator'},</h2>
                  <p style="color:#4B5563;font-size:15px;line-height:1.7;">
                    ${buyerName || 'A user'} (${buyerEmail || 'no email provided'}) requested access to
                    <strong>${resourceTitle || 'your paid resource'}</strong>.
                  </p>
                  ${priceText ? `<p style="color:#4B5563;font-size:15px;">Price: <strong>${priceText}</strong></p>` : ''}
                  <p style="color:#4B5563;font-size:15px;margin-top:16px;">
                    To review and approve or reject this request, open the approval page:
                  </p>
                  <p style="margin-top:8px;">
                    <a href="${approvalUrl}" class="button" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#111827;color:#FFFFFF;text-decoration:none;font-weight:600;">
                      Review access request
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </body>
        </html>
      `
    });

    res.status(200).json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error sending access request creator email:', error);
    res.status(500).json({ message: 'Failed to send email', error: error.message });
  }
});

app.post('/api/access-approved-user-email', async (req, res) => {
  try {
    const { buyerName, buyerEmail, resourceTitle, priceText } = req.body;

    await sendEmail({
      from: process.env.EMAIL_USER,
      to: buyerEmail,
      subject: 'Your paid resource access has been approved',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Access approved</title>
            <style>${commonEmailStyles}</style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin:0;font-size:28px;font-weight:700;">TopEdge AI</h1>
                <p style="margin-top:8px;font-size:18px;opacity:0.9;">Access approved</p>
              </div>
              <div class="content">
                <div class="section">
                  <h2 style="color:#1F2937;font-size:20px;margin-bottom:12px;">Good news, ${buyerName || 'there'}!</h2>
                  <p style="color:#4B5563;font-size:15px;line-height:1.7;">
                    Your access request for <strong>${resourceTitle || 'a paid resource'}</strong> has been approved.
                  </p>
                  ${priceText ? `<p style="color:#4B5563;font-size:15px;">Price: <strong>${priceText}</strong></p>` : ''}
                  <p style="color:#4B5563;font-size:15px;margin-top:16px;">
                    You can now access this resource directly from your TopEdge AI community account.
                    Sign in and open the resource page; it will be unlocked for your account.
                  </p>
                </div>
              </div>
            </div>
          </body>
        </html>
      `
    });

    res.status(200).json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error sending access approved user email:', error);
    res.status(500).json({ message: 'Failed to send email', error: error.message });
  }
});

app.post('/api/access-approved-creator-email', async (req, res) => {
  try {
    const { creatorName, creatorEmail, buyerEmail, resourceTitle } = req.body;

    await sendEmail({
      from: process.env.EMAIL_USER,
      to: creatorEmail,
      subject: 'You approved a paid resource access request',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Access approved confirmation</title>
            <style>${commonEmailStyles}</style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin:0;font-size:28px;font-weight:700;">TopEdge AI</h1>
                <p style="margin-top:8px;font-size:18px;opacity:0.9;">Approval confirmed</p>
              </div>
              <div class="content">
                <div class="section">
                  <h2 style="color:#1F2937;font-size:20px;margin-bottom:12px;">Hello ${creatorName || 'Creator'},</h2>
                  <p style="color:#4B5563;font-size:15px;line-height:1.7;">
                    You approved access for <strong>${buyerEmail || 'a buyer'}</strong> to
                    <strong>${resourceTitle || 'your paid resource'}</strong>.
                  </p>
                </div>
              </div>
            </div>
          </body>
        </html>
      `
    });

    res.status(200).json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error sending access approved creator email:', error);
    res.status(500).json({ message: 'Failed to send email', error: error.message });
  }
});





// OTP Generation Endpoint
app.post('/api/generate-otp', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Generate 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    
    // Create hash for verification
    const ttl = 10 * 60 * 1000; // 10 minutes
    const expires = Date.now() + ttl;
    const data = `${email}.${otp}.${expires}`;
    const hash = crypto.createHmac('sha256', OTP_SECRET).update(data).digest('hex');
    const fullHash = `${hash}.${expires}`;

    await sendEmail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your Verification Code - TopEdge AI Community',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Verification Code - TopEdge AI</title>
            <style>${commonEmailStyles}</style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0; font-size: 32px; font-weight: 700;">TopEdge AI</h1>
                <p style="margin-top: 12px; font-size: 20px; opacity: 0.9;">Verify Your Identity</p>
              </div>
              
              <div class="content">
                <div class="section">
                  <h2 style="color: #1F2937; font-size: 24px; margin-bottom: 16px;">Hello,</h2>
                  <p style="color: #4B5563; font-size: 16px; line-height: 1.8;">
                    Please use the following verification code to complete your sign-in request. This code will expire in 10 minutes.
                  </p>
                  
                  <div style="background: #F3F4F6; padding: 24px; border-radius: 12px; text-align: center; margin: 24px 0;">
                    <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #1F2937;">${otp}</span>
                  </div>

                  <p style="color: #6B7280; font-size: 14px; text-align: center;">
                    If you didn't request this code, you can safely ignore this email.
                  </p>
                </div>

                <div class="footer">
                  <p style="margin-bottom: 12px;">Best regards,</p>
                  <p style="font-weight: 600; color: #1F2937;">Team TopEdge AI</p>
                  <div style="margin-top: 24px;">
                    <p style="color: #9CA3AF; font-size: 12px;">© 2024 TopEdge AI. All rights reserved.</p>
                  </div>
                </div>
              </div>
            </div>
          </body>
        </html>
      `
    });

    res.status(200).json({ message: 'OTP sent successfully', hash: fullHash, email });
  } catch (error) {
    console.error('Error sending OTP:', error);
    res.status(500).json({ message: 'Failed to send OTP', error: error.message });
  }
});

// OTP Verification Endpoint
app.post('/api/verify-otp', (req, res) => {
  try {
    const { email, otp, hash } = req.body;
    if (!email || !otp || !hash) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const [hashValue, expires] = hash.split('.');
    if (!hashValue || !expires) {
      return res.status(400).json({ message: 'Invalid hash format' });
    }

    if (Date.now() > parseInt(expires)) {
      return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
    }

    const data = `${email}.${otp}.${expires}`;
    const validHash = crypto.createHmac('sha256', OTP_SECRET).update(data).digest('hex');

    if (hashValue === validHash) {
      res.status(200).json({ success: true, message: 'OTP Verified' });
    } else {
      res.status(400).json({ success: false, message: 'Invalid OTP' });
    }
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ message: 'Verification failed', error: error.message });
  }
});

const ADMIN_EMAILS = [
  'acctopedge@gmail.com',
  'moksh2031@gmail.com',
  'smittilva2006@gmail.com',
  'team@topedgeai.com'
];

app.post('/api/get-protected-resource-link', async (req, res) => {
  try {
    if (!firebaseInitialized) {
      return res.status(500).json({ message: 'Protected resource service unavailable' });
    }

    const authHeader = req.headers.authorization || '';
    const tokenFromHeader = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const { idToken: tokenFromBody, resourceId } = req.body || {};
    const idToken = tokenFromHeader || tokenFromBody;

    if (!idToken) {
      return res.status(401).json({ message: 'Missing authentication token' });
    }

    if (!resourceId || typeof resourceId !== 'string') {
      return res.status(400).json({ message: 'resourceId is required' });
    }

    const decoded = await authAdmin().verifyIdToken(idToken);
    const uid = decoded.uid;
    const email = decoded.email || '';

    const db = firestore();

    const resourceRef = db.collection('community_resources').doc(resourceId);
    const resourceSnap = await resourceRef.get();

    if (!resourceSnap.exists) {
      return res.status(404).json({ message: 'Resource not found' });
    }

    const resource = resourceSnap.data() || {};

    const isCreator = resource.userId === uid;
    const isAdmin = ADMIN_EMAILS.includes(email);
    const purchasers = Array.isArray(resource.purchasers) ? resource.purchasers : [];
    let isPurchaser = purchasers.includes(uid);

    let isApprovedBuyer = false;

    if (!isCreator && !isAdmin && !isPurchaser) {
      const requestsRef = db.collection('resource_access_requests');
      const approvedSnap = await requestsRef
        .where('resourceId', '==', resourceId)
        .where('buyerId', '==', uid)
        .where('status', '==', 'approved')
        .limit(1)
        .get();

      if (!approvedSnap.empty) {
        isApprovedBuyer = true;
        try {
          await resourceRef.update({
            purchasers: admin.firestore.FieldValue.arrayUnion(uid)
          });
          isPurchaser = true;
        } catch (e) {
          console.error('[PROTECTED_LINK] Failed to backfill purchasers array:', e);
        }
      }
    }

    if (!isCreator && !isAdmin && !isPurchaser && !isApprovedBuyer) {
      return res.status(403).json({ message: 'Not authorized to access this resource' });
    }

    const protectedRef = db.collection('protected_resource_links').doc(resourceId);
    const protectedSnap = await protectedRef.get();

    if (!protectedSnap.exists) {
      return res.status(404).json({ message: 'Protected link not configured for this resource' });
    }

    const protectedData = protectedSnap.data() || {};
    const privateUrl = protectedData.privateUrl;

    if (!privateUrl || typeof privateUrl !== 'string') {
      return res.status(404).json({ message: 'Protected link missing for this resource' });
    }

    try {
      await db.collection('resource_access_audit_logs').add({
        resourceId,
        buyerId: isPurchaser ? uid : null,
        action: 'link_fetched',
        performedBy: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) {
      console.error('[PROTECTED_LINK] Failed to write access audit log (link_fetched):', e);
    }

    return res.status(200).json({ url: privateUrl });
  } catch (error) {
    console.error('[PROTECTED_LINK] Error fetching protected link:', error);
    return res.status(500).json({ message: 'Failed to fetch protected link' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    message: 'TopEdge Backend API is healthy', 
    timestamp: new Date().toISOString() 
  });
});

// Root endpoint for Netlify backend
app.get('/', (req, res) => {
  res.status(200).send('TopEdge Backend API is running!');
});

// Add error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// --- NEW ENDPOINTS FOR COMMUNITY (Updated with Premium UI & Enhanced Logic) ---

// 1. Welcome Email (Immediate upon Signup)
app.post('/api/send-welcome-email', async (req, res) => {
  try {
    const { email, name } = req.body;

    await sendEmail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Welcome to TopEdge AI Community! 🚀',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Welcome to TopEdge AI Community</title>
            <style>${commonEmailStyles}</style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="logo-text">TopEdge AI</div>
                <p class="header-subtitle">Welcome to the Future of Automation</p>
              </div>
              
              <div class="content">
                <div class="section">
                  <h2 class="section-title">Hello ${name || 'Builder'},</h2>
                  <p class="text-muted">
                    Welcome to the TopEdge AI Community! We are thrilled to have you on board. This is an exclusive space for AI enthusiasts, developers, and founders to collaborate, share resources, and grow together.
                  </p>
                  
                  <div class="premium-box">
                    <h3 style="color: #F8FAFC; font-size: 18px; margin-bottom: 16px; font-weight: 600;">Get Started Immediately</h3>
                    <p style="color: #CBD5E1; margin-bottom: 20px; font-size: 15px;">Complete these steps to maximize your visibility:</p>
                    
                    <a href="https://topedgeai.com/community/profile" class="button" style="display: block; width: 100%;">Create Your Profile</a>
                    
                    <div style="text-align: center; margin-top: 16px;">
                      <a href="https://topedgeai.com/community" style="color: #818CF8; text-decoration: none; font-size: 14px; font-weight: 500;">Explore Resources &rarr;</a>
                    </div>
                  </div>
                </div>

                <div class="divider"></div>

                <div class="section">
                  <h3 class="section-title">Community Highlights</h3>
                  <div class="info-grid">
                    <div class="info-item">
                      <div style="font-size: 24px; margin-bottom: 12px;">🚀</div>
                      <h4 style="color: #F8FAFC; margin-bottom: 8px; font-size: 16px;">Share & Grow</h4>
                      <p style="color: #94A3B8; font-size: 13px; line-height: 1.5;">Upload your AI agents and templates to gain visibility.</p>
                    </div>
                    <div class="info-item">
                      <div style="font-size: 24px; margin-bottom: 12px;">🤝</div>
                      <h4 style="color: #F8FAFC; margin-bottom: 8px; font-size: 16px;">Connect</h4>
                      <p style="color: #94A3B8; font-size: 13px; line-height: 1.5;">Network with other top AI talent and founders.</p>
                    </div>
                  </div>
                </div>

                <div class="footer">
                  <p style="margin-bottom: 12px;">Best regards,</p>
                  <p style="font-weight: 600; color: #F8FAFC;">Team TopEdge AI</p>
                  <div style="margin-top: 24px;">
                    <a href="https://topedgeai.com" style="margin: 0 12px;">Website</a>
                    <a href="https://topedgeai.com/community" style="margin: 0 12px;">Community</a>
                  </div>
                </div>
              </div>
            </div>
          </body>
        </html>
      `
    });

    res.status(200).json({ success: true, message: 'Welcome email sent' });
  } catch (error) {
    console.error('Error sending welcome email:', error);
    res.status(500).json({ message: 'Failed to send welcome email', error: error.message });
  }
});

// 1.5 Generic Automation Email
app.post('/api/send-automation-email', async (req, res) => {
  try {
    const { email, subject, html } = req.body;

    if (!email || !html) {
      return res.status(400).json({ message: 'Missing email or html content' });
    }

    await sendEmail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: subject || 'Notification from TopEdge AI',
      html: html
    });

    res.status(200).json({ success: true, message: 'Automation email sent' });
  } catch (error) {
    console.error('Error sending automation email:', error);
    res.status(500).json({ message: 'Failed to send automation email', error: error.message });
  }
});

// 2. Broadcast: Community Live (One-Time / Manual)
app.post('/api/admin/broadcast-live', async (req, res) => {
  try {
    const { secret } = req.body;
    if (secret !== (process.env.OTP_SECRET || 'topedge-secret-key-change-in-prod')) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    if (!firebaseInitialized) {
       return res.status(500).json({ message: 'Firebase not initialized' });
    }

    const listUsersResult = await authAdmin().listUsers(1000);
    const users = listUsersResult.users;
    let sentCount = 0;
    let errors = [];

    console.log(`[BROADCAST] Found ${users.length} users. Starting broadcast...`);

    for (const user of users) {
      if (!user.email) continue;

      try {
        const profileDoc = await firestore().collection('users').doc(user.uid).get();
        const hasProfile = profileDoc.exists;
        const name = user.displayName || (hasProfile ? profileDoc.data().fullName : 'Member');

        let subject = 'TopEdge AI Community is LIVE! 🚀';
        let content = '';

        if (hasProfile) {
          content = `
            <p class="text-muted">The TopEdge AI Community is officially LIVE!</p>
            <p class="text-muted">You are one of our founding members. Thank you for setting up your profile early.</p>
            <div class="premium-box">
              <h3 style="color: #F8FAFC; margin-bottom: 12px;">What's New:</h3>
              <ul style="color: #CBD5E1; padding-left: 20px;">
                 <li style="margin-bottom: 8px;">Browse the new <strong>Automation Hub</strong> for AI agents.</li>
                 <li style="margin-bottom: 8px;">Check out the <strong>Request Board</strong> for opportunities.</li>
                 <li>Connect with other members.</li>
              </ul>
            </div>
            <div style="text-align: center; margin-top: 24px;">
               <a href="https://topedgeai.com/community" class="button">Visit Community</a>
            </div>
          `;
        } else {
          content = `
            <p class="text-muted">The TopEdge AI Community is officially LIVE!</p>
            <p class="text-muted">We noticed you haven't set up your profile yet. As one of our early members, your profile will get featured visibility.</p>
            <div class="premium-box">
              <h3 style="color: #F8FAFC; margin-bottom: 12px;">Why Create a Profile?</h3>
              <ul style="color: #CBD5E1; padding-left: 20px;">
                 <li style="margin-bottom: 8px;">Get discovered by clients and collaborators.</li>
                 <li style="margin-bottom: 8px;">Showcase your AI skills and portfolio.</li>
                 <li>Access exclusive community resources.</li>
              </ul>
            </div>
            <div style="text-align: center; margin-top: 24px;">
               <a href="https://topedgeai.com/community/profile" class="button">Create Profile Now</a>
            </div>
          `;
        }

        await sendEmail({
          from: process.env.EMAIL_USER,
          to: user.email,
          subject: subject,
          html: `
            <!DOCTYPE html>
            <html>
              <head>
                <style>${commonEmailStyles}</style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <div class="logo-text">TopEdge AI</div>
                    <p class="header-subtitle">Community Launch 🚀</p>
                  </div>
                  <div class="content">
                    <div class="section">
                      <h2 class="section-title">Hello ${name},</h2>
                      ${content}
                    </div>
                    <div class="footer">
                      <p>Best regards,<br>Team TopEdge AI</p>
                    </div>
                  </div>
                </div>
              </body>
            </html>
          `
        });
        sentCount++;
        await new Promise(r => setTimeout(r, 500)); // Rate limit protection

      } catch (err) {
        console.error(`[BROADCAST] Failed to send to ${user.email}:`, err);
        errors.push({ email: user.email, error: err.message });
      }
    }

    res.status(200).json({ 
      success: true, 
      message: `Broadcast completed. Sent to ${sentCount} users.`,
      errors: errors
    });

  } catch (error) {
    console.error('Broadcast error:', error);
    res.status(500).json({ message: 'Broadcast failed', error: error.message });
  }
});

// 3. Engagement Check (Daily Cron Job)
// Logic: 
// - If no profile after 2 days: Nudge 1
// - If no profile after 4 days: Nudge 2 (Final)
// - If profile exists but no resources after 2 days: Nudge Resource (One-time)
app.post('/api/cron/engagement-check', async (req, res) => {
    try {
        const { secret } = req.body;
        if (secret !== (process.env.OTP_SECRET || 'topedge-secret-key-change-in-prod')) {
             return res.status(403).json({ message: 'Unauthorized' });
        }

        if (!firebaseInitialized) {
            return res.status(500).json({ message: 'Firebase not initialized' });
        }

        const now = new Date();
        const twoDays = 2 * 24 * 60 * 60 * 1000;
        const threeDays = 3 * 24 * 60 * 60 * 1000;
        const fourDays = 4 * 24 * 60 * 60 * 1000;
        const fiveDays = 5 * 24 * 60 * 60 * 1000;

        let sentCount = 0;
        let emailsSent = [];
        let nextPageToken;
        let processedCount = 0;

        // Pagination loop to fetch all users
        do {
            const listUsersResult = await authAdmin().listUsers(1000, nextPageToken);
            const users = listUsersResult.users;
            nextPageToken = listUsersResult.pageToken;
            processedCount += users.length;

            console.log(`[CRON] Processing batch of ${users.length} users...`);

            for (const user of users) {
                if (!user.email) continue;

                try {
                    const creationTime = new Date(user.metadata.creationTime);
                    const diffTime = now.getTime() - creationTime.getTime();

                    // Fetch profile
                    const profileDoc = await firestore().collection('users').doc(user.uid).get();
                    const hasProfile = profileDoc.exists;

                    // --- Logic 1: Profile Nudge (Day 2) ---
                    if (!hasProfile && diffTime >= twoDays && diffTime < threeDays) {
                         await sendEmail({
                            from: process.env.EMAIL_USER,
                            to: user.email,
                            subject: 'Action Required: Complete Your Profile ⚠️',
                            html: `
                                <!DOCTYPE html>
                                <html>
                                <head><style>${commonEmailStyles}</style></head>
                                <body>
                                    <div class="container">
                                    <div class="header">
                                        <div class="logo-text">TopEdge AI</div>
                                        <p class="header-subtitle">Pending Action</p>
                                    </div>
                                    <div class="content">
                                        <div class="section">
                                        <h2 class="section-title">Hello ${user.displayName || 'Member'},</h2>
                                        <p class="text-muted">It's been 2 days since you joined, but your profile is incomplete. You are missing out on visibility within the community.</p>
                                        <div class="premium-box">
                                            <h3 style="color: #F8FAFC; margin-bottom: 12px;">Unlock Benefits:</h3>
                                            <ul style="color: #CBD5E1; padding-left: 20px;">
                                                <li>Showcase your skills</li>
                                                <li>Connect with clients</li>
                                                <li>Access premium resources</li>
                                            </ul>
                                        </div>
                                        <div style="text-align: center; margin-top: 24px;">
                                            <a href="https://topedgeai.com/community/profile" class="button">Complete Profile Now</a>
                                        </div>
                                        </div>
                                        <div class="footer"><p>Team TopEdge AI</p></div>
                                    </div>
                                    </div>
                                </body>
                                </html>
                            `
                        });
                        sentCount++;
                        emailsSent.push({ email: user.email, type: 'Profile Nudge 1' });
                    }

                    // --- Logic 2: Profile Nudge (Day 4 - Final) ---
                    else if (!hasProfile && diffTime >= fourDays && diffTime < fiveDays) {
                        await sendEmail({
                           from: process.env.EMAIL_USER,
                           to: user.email,
                           subject: 'Last Reminder: Your Profile is Incomplete ⏳',
                           html: `
                               <!DOCTYPE html>
                               <html>
                               <head><style>${commonEmailStyles}</style></head>
                               <body>
                                   <div class="container">
                                   <div class="header">
                                       <div class="logo-text">TopEdge AI</div>
                                       <p class="header-subtitle">Final Reminder</p>
                                   </div>
                                   <div class="content">
                                       <div class="section">
                                       <h2 class="section-title">Hello ${user.displayName || 'Member'},</h2>
                                       <p class="text-muted">This is a friendly reminder that your profile is still empty. To get the most out of TopEdge AI, please complete your setup.</p>
                                       <div style="text-align: center; margin-top: 24px;">
                                           <a href="https://topedgeai.com/community/profile" class="button">Finish Setup</a>
                                       </div>
                                       </div>
                                       <div class="footer"><p>Team TopEdge AI</p></div>
                                   </div>
                                   </div>
                               </body>
                               </html>
                           `
                       });
                       sentCount++;
                       emailsSent.push({ email: user.email, type: 'Profile Nudge 2' });
                   }

                   // --- Logic 3: Resource Nudge (Day 2 after Profile Creation) ---
                   else if (hasProfile) {
                       // Check if we should send resource nudge
                       // 1. Check if already sent
                       const userData = profileDoc.data();
                       if (!userData.resourceNudgeSent) {
                           // 2. Check time since profile creation (fallback to user creation if not stored)
                           const profileCreatedAt = userData.createdAt ? new Date(userData.createdAt.toDate()) : creationTime;
                           const profileDiff = now.getTime() - profileCreatedAt.getTime();

                           if (profileDiff >= twoDays && profileDiff < threeDays) {
                               // 3. Check if they have resources
                               const resourcesSnap = await firestore().collection('resources').where('userId', '==', user.uid).limit(1).get();
                               if (resourcesSnap.empty) {
                                   // Send Nudge
                                   await sendEmail({
                                        from: process.env.EMAIL_USER,
                                        to: user.email,
                                        subject: 'Share Your First Resource! 🌟',
                                        html: `
                                            <!DOCTYPE html>
                                            <html>
                                            <head><style>${commonEmailStyles}</style></head>
                                            <body>
                                                <div class="container">
                                                <div class="header">
                                                    <div class="logo-text">TopEdge AI</div>
                                                    <p class="header-subtitle">Contribution Opportunity</p>
                                                </div>
                                                <div class="content">
                                                    <div class="section">
                                                    <h2 class="section-title">Hello ${userData.fullName || 'Member'},</h2>
                                                    <p class="text-muted">You've set up your profile - great job! Now it's time to showcase your expertise.</p>
                                                    <div class="premium-box">
                                                        <p style="color: #CBD5E1;">Upload your first AI agent, template, or tool to the community.</p>
                                                    </div>
                                                    <div style="text-align: center; margin-top: 24px;">
                                                        <a href="https://topedgeai.com/community/submit-resource" class="button">Upload Resource</a>
                                                    </div>
                                                    </div>
                                                    <div class="footer"><p>Team TopEdge AI</p></div>
                                                </div>
                                                </div>
                                            </body>
                                            </html>
                                        `
                                    });
                                    // Mark as sent
                                    await firestore().collection('users').doc(user.uid).update({ resourceNudgeSent: true });
                                    sentCount++;
                                    emailsSent.push({ email: user.email, type: 'Resource Nudge' });
                               }
                           }
                       }
                   }
                } catch (err) {
                    console.error(`[CRON] Error processing user ${user.email}:`, err);
                }
            }
        } while (nextPageToken);

        res.status(200).json({ success: true, processed: processedCount, sent: sentCount, details: emailsSent });

    } catch (error) {
        console.error('Engagement check error:', error);
        res.status(500).json({ message: 'Failed', error: error.message });
    }
});

// 4. New Resource Notification (Broadcast)
app.post('/api/send-resource-notification', async (req, res) => {
    try {
         const { secret, resourceTitle, authorName, resourceId } = req.body;
         if (secret !== (process.env.OTP_SECRET || 'topedge-secret-key-change-in-prod')) {
             return res.status(403).json({ message: 'Unauthorized' });
         }

         const listUsersResult = await authAdmin().listUsers(1000);
         const users = listUsersResult.users;
         
         let count = 0;
         for (const user of users) {
             if (!user.email) continue;
             
             await sendEmail({
                 from: process.env.EMAIL_USER,
                 to: user.email,
                 subject: `New Resource: ${resourceTitle} 🚨`,
                 html: `
                    <!DOCTYPE html>
                    <html>
                    <head><style>${commonEmailStyles}</style></head>
                    <body>
                        <div class="container">
                        <div class="header">
                            <div class="logo-text">TopEdge AI</div>
                            <p class="header-subtitle">New Community Drop</p>
                        </div>
                        <div class="content">
                            <div class="section">
                            <h2 class="section-title">New Resource Alert</h2>
                            <p class="text-muted">
                                <strong>${authorName}</strong> just uploaded a new resource to the community.
                            </p>
                            <div class="premium-box">
                                <h3 style="color: #F8FAFC; font-size: 20px; margin-bottom: 12px;">${resourceTitle}</h3>
                                <div style="text-align: center;">
                                    <a href="https://topedgeai.com/community/resource/${resourceId}" class="button">View Resource</a>
                                </div>
                            </div>
                            </div>
                            <div class="footer"><p>Team TopEdge AI</p></div>
                        </div>
                        </div>
                    </body>
                    </html>
                 `
             });
             count++;
             // Rate limiting check - 100ms
             await new Promise(r => setTimeout(r, 100));
         }
         
         res.status(200).json({ success: true, sent: count });

    } catch (error) {
        console.error('Resource notification error:', error);
        res.status(500).json({ message: 'Failed', error: error.message });
    }
});

// 5. New Request Notification (Broadcast)
app.post('/api/send-request-notification', async (req, res) => {
    try {
         const { secret, title, requestTitle, requesterName, requestId, description, budget } = req.body;
         const finalTitle = title || requestTitle;

         if (secret !== (process.env.OTP_SECRET || 'topedge-secret-key-change-in-prod')) {
             return res.status(403).json({ message: 'Unauthorized' });
         }

         const listUsersResult = await authAdmin().listUsers(1000);
         const users = listUsersResult.users;
         
         let count = 0;
         for (const user of users) {
             if (!user.email) continue;
             
             await sendEmail({
                 from: process.env.EMAIL_USER,
                 to: user.email,
                 subject: `New Request: ${finalTitle} 💡`,
                 html: `
                    <!DOCTYPE html>
                    <html>
                    <head><style>${commonEmailStyles}</style></head>
                    <body>
                        <div class="container">
                        <div class="header">
                            <div class="logo-text">TopEdge AI</div>
                            <p class="header-subtitle">New Community Request</p>
                        </div>
                        <div class="content">
                            <div class="section">
                            <h2 class="section-title">Opportunity Alert</h2>
                            <p class="text-muted">
                                <strong>${requesterName}</strong> is looking for something. Can you help?
                            </p>
                            <div class="premium-box">
                                <h3 style="color: #F8FAFC; font-size: 18px; margin-bottom: 8px;">"${finalTitle}"</h3>
                                ${budget ? `<p style="color: #818CF8; font-weight: 600; margin-bottom: 12px;">Budget: ${budget}</p>` : ''}
                                ${description ? `<p style="color: #94A3B8; font-size: 14px; margin-bottom: 16px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">${description}</p>` : ''}
                                <div style="text-align: center;">
                                    <a href="https://topedgeai.com/community/requests" class="button">View Request</a>
                                </div>
                            </div>
                            </div>
                            <div class="footer"><p>Team TopEdge AI</p></div>
                        </div>
                        </div>
                    </body>
                    </html>
                 `
             });
             count++;
             await new Promise(r => setTimeout(r, 100));
         }
         
         res.status(200).json({ success: true, sent: count });

    } catch (error) {
        console.error('Request notification error:', error);
        res.status(500).json({ message: 'Failed', error: error.message });
    }
});

// 6. Admin Announcement (Manual Broadcast)
app.post('/api/admin/announcement', async (req, res) => {
    try {
         const { secret, subject, message, actionUrl, actionText } = req.body;
         if (secret !== (process.env.OTP_SECRET || 'topedge-secret-key-change-in-prod')) {
             return res.status(403).json({ message: 'Unauthorized' });
         }

         const listUsersResult = await authAdmin().listUsers(1000);
         const users = listUsersResult.users;
         
         let count = 0;
         for (const user of users) {
             if (!user.email) continue;
             
             await sendEmail({
                 from: process.env.EMAIL_USER,
                 to: user.email,
                 subject: subject || 'Announcement from TopEdge AI 📢',
                 html: `
                    <!DOCTYPE html>
                    <html>
                    <head><style>${commonEmailStyles}</style></head>
                    <body>
                        <div class="container">
                        <div class="header">
                            <div class="logo-text">TopEdge AI</div>
                            <p class="header-subtitle">Community Announcement</p>
                        </div>
                        <div class="content">
                            <div class="section">
                            <h2 class="section-title">${subject}</h2>
                            <div class="text-muted" style="margin-bottom: 24px;">
                                ${message}
                            </div>
                            ${actionUrl ? `
                            <div style="text-align: center;">
                                <a href="${actionUrl}" class="button">${actionText || 'Learn More'}</a>
                            </div>
                            ` : ''}
                            </div>
                            <div class="footer"><p>Team TopEdge AI</p></div>
                        </div>
                        </div>
                    </body>
                    </html>
                 `
             });
             count++;
             await new Promise(r => setTimeout(r, 100));
         }
         
         res.status(200).json({ success: true, sent: count });

    } catch (error) {
        console.error('Announcement error:', error);
        res.status(500).json({ message: 'Failed', error: error.message });
    }
});

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Export the serverless handler
export const handler = serverless(app);

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  console.log(`Email server configured with: ${process.env.EMAIL_USER}`);
}); 
