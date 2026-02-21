import express from 'express';
import nodemailer from 'nodemailer';
import cors from 'cors';
import dotenv from 'dotenv';
import serverless from 'serverless-http';
import crypto from 'crypto';
import admin from 'firebase-admin';
import { commonEmailStyles } from '../../lib/emailStyles.js';
import { automationLogic } from './scheduled-email-automation.js';

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
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      throw new Error('Firebase admin not initialized: FIREBASE_SERVICE_ACCOUNT_KEY is missing in environment variables');
    }
    throw new Error('Firebase admin not initialized (check server logs for initialization errors)');
  }
  return admin.firestore();
};

const authAdmin = () => {
  if (!firebaseInitialized) {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      throw new Error('Firebase admin not initialized: FIREBASE_SERVICE_ACCOUNT_KEY is missing in environment variables');
    }
    throw new Error('Firebase admin not initialized (check server logs for initialization errors)');
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
    } catch { }
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

// --- HELPER FOR REPUTATION (Backend Version) ---
function calculateReputation(userProfile, resources) {
  const resourcesCount = resources.length;
  const totalUpvotes = resources.reduce((sum, r) => sum + (Number(r.upvotes || r.stars) || 0), 0);
  const totalViews = resources.reduce((sum, r) => sum + (Number(r.views) || 0), 0);
  const totalDownloads = resources.reduce((sum, r) => sum + (Number(r.downloads) || 0), 0);
  const totalLinkClicks = resources.reduce((sum, r) => sum + (Number(r.linkClicks) || 0), 0);
  const totalSales = resources.reduce((sum, r) => sum + (r.purchasers?.length || 0), 0);

  const hasBio = !!userProfile?.bio;
  const hasPhoto = !!userProfile?.photoURL;
  const hasSocial = !!userProfile?.github || !!userProfile?.linkedin || !!userProfile?.websiteURL;

  const profileScore =
    (hasBio ? 5 : 0) +
    (hasPhoto ? 5 : 0) +
    (hasSocial ? 5 : 0);

  const score =
    resourcesCount * 15 +
    totalUpvotes * 2 +
    Math.floor(totalViews * 0.1) +
    totalDownloads * 1 +
    totalLinkClicks * 1 +
    totalSales * 5 +
    profileScore;

  let tier = 'Builder';
  if (score >= 500) tier = 'Grandmaster';
  else if (score >= 100) tier = 'Architect';

  return { score: Math.floor(score), tier };
}

// --- PUBLIC DATA ENDPOINT (Bypass Firestore Rules for Guests) ---
const handlePublicStats = async (req, res) => {
  try {
    const db = firestore();

    // Run in parallel for speed
    const [profilesSnap, resourcesSnap, requestsSnap] = await Promise.all([
      db.collection('public_profiles').get(),
      db.collection('community_resources').get(),
      db.collection('community_requests').get()
    ]);

    const profiles = [];
    profilesSnap.forEach(doc => profiles.push({ id: doc.id, ...doc.data() }));

    const resources = [];
    resourcesSnap.forEach(doc => resources.push({ id: doc.id, ...doc.data() }));

    const requests = [];
    requestsSnap.forEach(doc => requests.push({ id: doc.id, ...doc.data() }));

    // 1. Calculate Top Profiles
    const scoredProfiles = profiles
      .filter(p => p.fullName && p.fullName.trim().length > 0)
      .map(p => {
        const userResources = resources.filter(r => r.userId === p.id || (p.uid && r.userId === p.uid));
        const { score, tier } = calculateReputation(
          {
            bio: p.description || p.bio,
            photoURL: p.photoURL,
            github: p.github,
            linkedin: p.linkedin,
            websiteURL: p.websiteURL
          },
          userResources
        );
        return { ...p, score, tier };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    // 2. Top Resources (Upvotes) - for Footer
    const topResources = resources
      .sort((a, b) => (Number(b.upvotes || b.stars || 0) - Number(a.upvotes || a.stars || 0)))
      .slice(0, 5)
      .map(r => ({ id: r.id, title: r.title || 'Untitled' }));

    // 3. New Resources - for Home and Automation Hub Teaser
    const newResources = resources
      .sort((a, b) => {
        // Handle Firestore Timestamp or Date string
        const dateA = a.createdAt && a.createdAt._seconds ? a.createdAt._seconds * 1000 : new Date(a.createdAt || 0).getTime();
        const dateB = b.createdAt && b.createdAt._seconds ? b.createdAt._seconds * 1000 : new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      })
      .slice(0, 12); // Increased to support teaser views (need 3, fetching more for safety)

    // 4. Open Source Projects (Free Resources) - for Open Source Page
    const openSourceProjects = resources
      .filter(r => r.isPaid === false)
      .sort((a, b) => {
        const dateA = a.createdAt && a.createdAt._seconds ? a.createdAt._seconds * 1000 : new Date(a.createdAt || 0).getTime();
        const dateB = b.createdAt && b.createdAt._seconds ? b.createdAt._seconds * 1000 : new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      })
      .slice(0, 6);

    // 5. Recent Requests - for Request Board
    const recentRequests = requests
      .sort((a, b) => {
        const dateA = a.createdAt && a.createdAt._seconds ? a.createdAt._seconds * 1000 : new Date(a.createdAt || 0).getTime();
        const dateB = b.createdAt && b.createdAt._seconds ? b.createdAt._seconds * 1000 : new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      })
      .slice(0, 6);

    res.json({
      success: true,
      stats: {
        totalProfiles: profiles.length,
        totalResources: resources.length,
        totalRequests: requests.length,
        totalOpenSource: resources.filter(r => r.isPaid === false).length
      },
      topProfiles: scoredProfiles,
      topResourcesByUpvotes: topResources,
      newResources: newResources,
      openSourceProjects: openSourceProjects,
      recentRequests: recentRequests
    });

  } catch (error) {
    console.error('Public stats error:', error);
    // If initialization fails, return empty stats to not break frontend
    res.status(200).json({
      success: false,
      error: error.message,
      stats: { totalProfiles: 0, totalResources: 0, totalRequests: 0, totalOpenSource: 0 },
      topProfiles: [],
      topResourcesByUpvotes: [],
      newResources: [],
      openSourceProjects: [],
      recentRequests: []
    });
  }
};

// --- PUBLIC DATA ENDPOINT (Bypass Firestore Rules for Guests) ---
// Register both with and without /api prefix to handle Netlify rewrites vs local dev
app.get('/api/public-stats', handlePublicStats);
app.get('/public-stats', handlePublicStats);

const handlePublicResource = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Missing resource ID' });
    }

    // Bypass rules using admin SDK
    const db = firestore();
    const docRef = db.collection('community_resources').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    const data = docSnap.data();

    res.json({
      id: docSnap.id,
      ...data
    });
  } catch (error) {
    console.error('Public resource fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch resource' });
  }
};

app.get('/api/public-resource/:id', handlePublicResource);
app.get('/public-resource/:id', handlePublicResource);

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,
  tls: {
    rejectUnauthorized: false
  }
});

console.log('[MAIL] SMTP config:', {
  host: 'smtp.gmail.com',
  port: 465,
  secure: true
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
      const sanitized = {
        from: mailOptions.from,
        to: mailOptions.to,
        subject: mailOptions.subject,
        hasHtml: typeof mailOptions.html === 'string',
        htmlLength: typeof mailOptions.html === 'string' ? mailOptions.html.length : 0
      };
      console.log(`[MAIL] Attempt ${i + 1} send`, sanitized);

      const info = await transporter.sendMail(mailOptions);
      console.log('[MAIL] sent:', info.response);
      return { success: true, message: 'Email sent successfully' };
    } catch (error) {
      const msg = error?.message || String(error);
      const code = error?.code || '';
      const resp = error?.response || '';
      console.error(`[MAIL] send error attempt ${i + 1}:`, {
        attempt: i + 1,
        message: msg,
        code,
        response: resp || null
      });
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
                <span class="logo-text">TopEdge AI</span>
                <p class="header-subtitle">Booking Confirmed</p>
              </div>
              
              <div class="content">
                <div class="section">
                  <h2 class="section-title">Hello ${name},</h2>
                  <p class="text-regular">
                    Thank you for booking a consultation with TopEdge AI. We're looking forward to discussing how we can help transform your business.
                  </p>
                  
                  <div class="premium-box">
                    <h3 style="color: #818CF8; font-size: 20px; margin-bottom: 16px;">Your Meeting Details</h3>
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
                  <div class="list-box">
                    <ol style="margin: 0; padding-left: 24px; color: #E2E8F0;">
                      <li style="margin-bottom: 16px; padding-left: 8px;">
                        <strong style="color: #F8FAFC;">Meeting Link</strong>
                        <p style="margin-top: 4px; color: #94A3B8;">We'll send you a Google Meet link shortly</p>
                      </li>
                      <li style="margin-bottom: 16px; padding-left: 8px;">
                        <strong style="color: #F8FAFC;">Duration</strong>
                        <p style="margin-top: 4px; color: #94A3B8;">The consultation typically lasts 30-45 minutes</p>
                      </li>
                      <li style="padding-left: 8px;">
                        <strong style="color: #F8FAFC;">Preparation</strong>
                        <p style="margin-top: 4px; color: #94A3B8;">Please bring any specific questions or requirements</p>
                      </li>
                    </ol>
                  </div>
                </div>

                <div class="section" style="text-align: center;">
                  <h3 class="section-title">
                    Need to Reschedule?
                  </h3>
                  <p class="text-regular">
                    If you need to change your appointment time, please reply to this email.
                  </p>
                </div>

                <div class="footer">
                  <p>Best regards,</p>
                  <p style="color: #F8FAFC; font-weight: 600;">Team TopEdge AI</p>
                  <div style="margin-top: 24px;">
                    <p>© 2026 TopEdge AI. All rights reserved.</p>
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
                <div class="alert-box">
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

                <div class="list-box" style="background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.2);">
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
                  <p>Best regards,</p>
                  <p style="color: #F8FAFC; font-weight: 600;">Team TopEdge AI</p>
                  <div style="margin-top: 24px;">
                    <p>© 2026 TopEdge AI. All rights reserved.</p>
                  </div>
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
                <span class="logo-text">TopEdge AI</span>
                <p class="header-subtitle">Transform Your Business with AI</p>
              </div>
              
              <div class="content">
                <div class="section">
                  <h2 class="section-title">Hello ${name},</h2>
                  <p class="text-regular">
                    Thank you for choosing TopEdge AI's ${planType} solution. We're excited to help you revolutionize your business operations!
                  </p>
                  
                  <div class="premium-box">
                    <h3 style="color: #818CF8; font-size: 20px; margin-bottom: 16px;">Your Selected Plan</h3>
                    <p style="color: #F8FAFC; font-size: 24px; font-weight: 700;">${plan}</p>
                  </div>
                </div>

                <div class="section">
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
                  
                  <div style="text-align: center; margin-top: 32px;">
                    <p class="text-regular" style="margin-bottom: 24px;">
                      Calculate your specific ROI based on your business metrics
                    </p>
                    <a href="https://topedgeai.com/roi" class="button">Calculate Your ROI Now →</a>
                  </div>
                </div>

                <div class="section">
                  <h3 class="section-title">Key Benefits</h3>
                  <div class="info-grid">
                    <div class="info-item">
                      <div style="font-size: 24px; margin-bottom: 12px;">💰</div>
                      <h4 style="color: #F8FAFC; margin-bottom: 8px; font-weight: 600;">Revenue Growth</h4>
                      <p class="text-muted">Recover $10,000+ in missed opportunities within 45 days</p>
                    </div>
                    <div class="info-item">
                      <div style="font-size: 24px; margin-bottom: 12px;">📈</div>
                      <h4 style="color: #F8FAFC; margin-bottom: 8px; font-weight: 600;">Booking Rate</h4>
                      <p class="text-muted">Increase appointment bookings by up to 2.5x</p>
                    </div>
                    <div class="info-item">
                      <div style="font-size: 24px; margin-bottom: 12px;">⚡</div>
                      <h4 style="color: #F8FAFC; margin-bottom: 8px; font-weight: 600;">Efficiency</h4>
                      <p class="text-muted">Save 30+ hours per week in manual work</p>
                    </div>
                  </div>
                </div>

                <div class="section">
                  <h3 class="section-title">Next Steps</h3>
                  <div class="list-box">
                    <ol style="margin: 0; padding-left: 24px; color: #E2E8F0;">
                      <li style="margin-bottom: 20px; padding-left: 8px;">
                        <strong style="color: #F8FAFC;">Initial Contact</strong>
                        <p style="margin-top: 4px; color: #94A3B8;">Our team will reach out within 24 hours</p>
                      </li>
                      <li style="margin-bottom: 20px; padding-left: 8px;">
                        <strong style="color: #F8FAFC;">Requirements Analysis</strong>
                        <p style="margin-top: 4px; color: #94A3B8;">We'll understand your specific needs</p>
                      </li>
                      <li style="margin-bottom: 20px; padding-left: 8px;">
                        <strong style="color: #F8FAFC;">Solution Design</strong>
                        <p style="margin-top: 4px; color: #94A3B8;">Get your customized implementation plan</p>
                      </li>
                      <li style="padding-left: 8px;">
                        <strong style="color: #F8FAFC;">Demo Session</strong>
                        <p style="margin-top: 4px; color: #94A3B8;">See your tailored solution in action</p>
                      </li>
                    </ol>
                  </div>
                </div>

                <div class="section" style="text-align: center;">
                  <h3 class="section-title">Ready to Transform Your Business?</h3>
                  <p class="text-regular">
                    Reply with "Tell me more" to unlock exclusive insights and success stories!
                  </p>
                  <div class="divider"></div>
                  <p style="color: #818CF8; font-weight: 600; margin-top: 24px;">
                    P.S. Most of our clients achieve positive ROI within the first month!
                  </p>
                </div>

                <div class="footer">
                  <p>Best regards,</p>
                  <p style="font-weight: 600; color: #F8FAFC;">Team TopEdge AI</p>
                  <div style="margin-top: 24px;">
                    <p>© 2026 TopEdge AI. All rights reserved.</p>
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
                <div class="section">
                  <div style="text-align: center; background: ${planGradient}; border-radius: 16px; padding: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                    <h3 style="color: white; margin-bottom: 8px; font-size: 24px; font-weight: 700;">${plan}</h3>
                    <p style="color: rgba(255,255,255,0.9); font-size: 16px;">${planType} Inquiry</p>
                  </div>
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

                <div class="section">
                  <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 16px; padding: 24px;">
                    <h3 class="section-title" style="color: #F87171; margin-bottom: 16px;">Action Required</h3>
                    <div style="color: #E2E8F0;">
                      <p style="margin-bottom: 12px;">Please take the following actions:</p>
                      <ol style="margin: 0; padding-left: 20px; color: #94A3B8;">
                        <li style="margin-bottom: 10px;">Review the client's requirements</li>
                        <li style="margin-bottom: 10px;">Prepare a customized solution proposal</li>
                        <li style="margin-bottom: 10px;">Schedule a demo call</li>
                        <li>Respond within 24 hours</li>
                      </ol>
                    </div>
                  </div>
                </div>
                
                <div class="footer">
                  <p>Best regards,</p>
                  <p style="color: #F8FAFC; font-weight: 600;">Team TopEdge AI</p>
                  <div style="margin-top: 24px;">
                    <p>© 2026 TopEdge AI. All rights reserved.</p>
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
                <span class="logo-text">TopEdge AI</span>
                <p class="header-subtitle">Thank You for Reaching Out!</p>
              </div>
              
              <div class="content">
                <div class="section">
                  <h2 class="section-title">Hello ${name},</h2>
                  <p class="text-regular">
                    Thank you for contacting TopEdge AI. We're excited to help you explore how AI can transform your business operations.
                  </p>
                  
                  <div class="premium-box">
                    <h3 style="color: #818CF8; font-size: 20px; margin-bottom: 16px;">Your Message Details</h3>
                    <div style="margin-bottom: 16px;">
                      <p style="color: #94A3B8; font-size: 14px; margin-bottom: 4px;">Subject</p>
                      <p style="color: #F8FAFC; font-size: 16px; font-weight: 500;">${subject}</p>
                    </div>
                    <div>
                      <p style="color: #94A3B8; font-size: 14px; margin-bottom: 4px;">Message</p>
                      <p style="color: #F8FAFC; font-size: 16px;">${message}</p>
                    </div>
                  </div>
                </div>

                <div class="section">
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
                  
                  <div style="text-align: center; margin-top: 32px;">
                    <p class="text-regular" style="margin-bottom: 24px;">
                      See what these numbers mean for your business
                    </p>
                    <a href="https://topedgeai.com/roi" class="button">Calculate Your ROI →</a>
                  </div>
                </div>

                <div class="section">
                  <h3 class="section-title">What Happens Next?</h3>
                  <div style="background: #1E293B; padding: 32px; border-radius: 16px; border: 1px solid #334155;">
                    <ol style="margin: 0; padding-left: 24px; color: #E2E8F0;">
                      <li style="margin-bottom: 20px; padding-left: 8px;">
                        <strong style="color: #F8FAFC;">Message Review</strong>
                        <p style="margin-top: 4px; color: #94A3B8;">Our team is analyzing your requirements</p>
                      </li>
                      <li style="margin-bottom: 20px; padding-left: 8px;">
                        <strong style="color: #F8FAFC;">Solution Preparation</strong>
                        <p style="margin-top: 4px; color: #94A3B8;">We're crafting the perfect solution for you</p>
                      </li>
                      <li style="margin-bottom: 20px; padding-left: 8px;">
                        <strong style="color: #F8FAFC;">Quick Response</strong>
                        <p style="margin-top: 4px; color: #94A3B8;">Expect to hear from us within 24 hours</p>
                      </li>
                      <li style="padding-left: 8px;">
                        <strong style="color: #F8FAFC;">Strategy Discussion</strong>
                        <p style="margin-top: 4px; color: #94A3B8;">We'll schedule a call to discuss next steps</p>
                      </li>
                    </ol>
                  </div>
                </div>

                <div class="section" style="text-align: center;">
                  <h3 class="section-title">While You Wait...</h3>
                  <p class="text-regular" style="margin-bottom: 24px;">
                    Explore our success stories and see how other businesses have transformed with TopEdge AI
                  </p>
                  <a href="https://topedgeai.com/case-studies" class="button">View Success Stories →</a>
                </div>

                <div class="footer">
                  <p>Best regards,</p>
                  <p style="font-weight: 600; color: #F8FAFC;">Team TopEdge AI</p>
                  <div style="margin-top: 24px;">
                    <p>© 2026 TopEdge AI. All rights reserved.</p>
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
                <div class="section">
                  <div style="text-align: center; background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 16px; padding: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                    <h3 style="color: #818CF8; margin-bottom: 8px; font-size: 24px; font-weight: 700;">New Message</h3>
                    <p style="font-size: 16px; color: #F8FAFC;">${subject}</p>
                  </div>
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
                  <div style="background: #1E293B; border-radius: 12px; padding: 24px; border: 1px solid #334155;">
                    <p style="color: #E2E8F0; white-space: pre-wrap; margin: 0; line-height: 1.6;">${message}</p>
                  </div>
                </div>

                <div class="section">
                  <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 16px; padding: 24px;">
                    <h3 class="section-title" style="color: #F87171; margin-bottom: 16px;">Action Required</h3>
                    <div style="color: #E2E8F0;">
                      <p style="margin-bottom: 12px;">Please take the following actions:</p>
                      <ol style="margin: 0; padding-left: 20px; color: #94A3B8;">
                        <li style="margin-bottom: 10px;">Review the inquiry details</li>
                        <li style="margin-bottom: 10px;">Prepare a response</li>
                        <li style="margin-bottom: 10px;">Respond within 24-48 hours</li>
                        <li>Update the CRM if necessary</li>
                      </ol>
                    </div>
                  </div>
                </div>

                <div class="footer">
                  <p>Best regards,</p>
                  <p style="color: #F8FAFC; font-weight: 600;">Team TopEdge AI</p>
                  <div style="margin-top: 24px;">
                    <p>© 2026 TopEdge AI. All rights reserved.</p>
                  </div>
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
                <span class="logo-text">TopEdge AI</span>
                <p class="header-subtitle">Access Request Received</p>
              </div>
              <div class="content">
                <div class="section">
                  <h2 class="section-title">Hello ${buyerName || 'there'},</h2>
                  <p class="text-regular">
                    Your request for access to <strong style="color: #F8FAFC;">${resourceTitle || 'a paid resource'}</strong> has been sent to the creator.
                  </p>
                  <div class="premium-box">
                    <p class="text-regular" style="margin-bottom: 0;">
                      Complete payment with the creator. You will receive access only after the creator approves your request.
                    </p>
                  </div>
                </div>
                <div class="footer">
                  <p>Best regards,</p>
                  <p style="color: #F8FAFC; font-weight: 600;">Team TopEdge AI</p>
                  <div style="margin-top: 24px;">
                    <p>© 2026 TopEdge AI. All rights reserved.</p>
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
                <span class="logo-text">TopEdge AI</span>
                <p class="header-subtitle">New Access Request</p>
              </div>
              <div class="content">
                <div class="section">
                  <h2 class="section-title">Hello ${creatorName || 'Creator'},</h2>
                  <p class="text-regular">
                    <strong style="color: #F8FAFC;">${buyerName || 'A user'}</strong> (${buyerEmail || 'no email provided'}) requested access to
                    <strong style="color: #F8FAFC;">${resourceTitle || 'your paid resource'}</strong>.
                  </p>
                  ${priceText ? `<div class="premium-box" style="margin: 24px 0;"><p class="text-regular" style="margin: 0;">Price: <strong style="color: #818CF8;">${priceText}</strong></p></div>` : ''}
                  <p class="text-regular">
                    To review and approve or reject this request, please proceed to the approval page.
                  </p>
                  <div style="text-align: center; margin-top: 32px;">
                    <a href="${approvalUrl}" class="button">
                      Review Access Request
                    </a>
                  </div>
                </div>
                <div class="footer">
                  <p>Best regards,</p>
                  <p style="color: #F8FAFC; font-weight: 600;">Team TopEdge AI</p>
                  <div style="margin-top: 24px;">
                    <p>© 2026 TopEdge AI. All rights reserved.</p>
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
                <span class="logo-text">TopEdge AI</span>
                <p class="header-subtitle">Access Approved</p>
              </div>
              <div class="content">
                <div class="section">
                  <h2 class="section-title">Good news, ${buyerName || 'there'}!</h2>
                  <p class="text-regular">
                    Your access request for <strong style="color: #F8FAFC;">${resourceTitle || 'a paid resource'}</strong> has been approved.
                  </p>
                  ${priceText ? `<div class="premium-box" style="margin: 24px 0;"><p class="text-regular" style="margin: 0;">Price: <strong style="color: #818CF8;">${priceText}</strong></p></div>` : ''}
                  <div class="premium-box">
                    <p class="text-regular" style="margin: 0;">
                      You can now access this resource directly from your TopEdge AI community account.
                      Sign in and open the resource page; it will be unlocked for your account.
                    </p>
                  </div>
                </div>
                <div class="footer">
                  <p>Best regards,</p>
                  <p style="color: #F8FAFC; font-weight: 600;">Team TopEdge AI</p>
                  <div style="margin-top: 24px;">
                    <p>© 2026 TopEdge AI. All rights reserved.</p>
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
                <span class="logo-text">TopEdge AI</span>
                <p class="header-subtitle">Approval Confirmed</p>
              </div>
              <div class="content">
                <div class="section">
                  <h2 class="section-title">Hello ${creatorName || 'Creator'},</h2>
                  <p class="text-regular">
                    You approved access for <strong style="color: #F8FAFC;">${buyerEmail || 'a buyer'}</strong> to
                    <strong style="color: #F8FAFC;">${resourceTitle || 'your paid resource'}</strong>.
                  </p>
                </div>
                <div class="footer">
                  <p>Best regards,</p>
                  <p style="color: #F8FAFC; font-weight: 600;">Team TopEdge AI</p>
                  <div style="margin-top: 24px;">
                    <p>© 2026 TopEdge AI. All rights reserved.</p>
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
    <title>Verification Code | TopEdge AI</title>
    <style>
      body { margin: 0; padding: 0; background-color: #fafafa; font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif; -webkit-font-smoothing: antialiased; }
      .wrapper { width: 100%; table-layout: fixed; background-color: #fafafa; padding: 20px 0; }
      .container { max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 32px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.04); }
      
      /* Header: Secure & Minimal */
      .header { padding: 24px 24px 16px; text-align: center; border-bottom: 1px solid #f1f5f9; }
      .logo { font-size: 14px; font-weight: 900; color: #0f172a; text-transform: uppercase; letter-spacing: 3px; display: block; margin-bottom: 8px; }
      .security-label { font-size: 11px; font-weight: 700; color: #6366f1; text-transform: uppercase; letter-spacing: 1px; }
      
      /* Content */
      .content { padding: 48px; text-align: center; }
      .headline { font-size: 24px; font-weight: 800; color: #0f172a; line-height: 1.2; letter-spacing: -1px; margin-bottom: 16px; }
      .instruction { font-size: 15px; color: #64748b; line-height: 1.6; margin-bottom: 40px; }
      
      /* OTP Box: High Contrast Cinematic Look */
      .otp-container { 
        background-color: #0f172a; 
        border-radius: 20px; 
        padding: 32px; 
        margin-bottom: 32px; 
        box-shadow: 0 10px 25px rgba(15, 23, 42, 0.15); 
      }
      .otp-code { 
        font-family: 'Courier New', Courier, monospace; 
        font-size: 42px; 
        font-weight: 800; 
        color: #ffffff; 
        letter-spacing: 8px; 
        display: block; 
      }
      .expiry-tag { font-size: 12px; color: #94a3b8; margin-top: 16px; display: block; font-weight: 500; }

      /* Footer */
      .footer { padding: 40px; text-align: center; background-color: #fafbfc; border-top: 1px solid #f1f5f9; }
      .footer-brand { font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 8px; display: block; }
      .legal-muted { font-size: 11px; color: #94a3b8; line-height: 1.6; max-width: 300px; margin: 0 auto; }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="container">
        
        <div class="header">
          <span class="logo">TopEdge AI</span>
          <span class="security-label">Two-Factor Authentication</span>
        </div>
        
        <div class="content">
          <h1 class="headline">Verify your identity.</h1>
          <p class="instruction">
            Use the secure code below to finalize your access to the TopEdge community dashboard.
          </p>
          
          <div class="otp-container">
            <span class="otp-code">${otp}</span>
            <span class="expiry-tag">Valid for the next 10 minutes</span>
          </div>
          
          <p style="font-size: 13px; color: #94a3b8; margin: 0;">
            If you did not request this, please ignore this email.
          </p>
        </div>

        <div class="footer">
          <span class="footer-brand">Team TopEdge AI</span>
          <p class="legal-muted">
            © 2026 TopEdge AI. All rights reserved.<br>
            Secure verification for @topedge_ai members.
          </p>
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
    <title>Welcome to TopEdge AI</title>
    <style>
      /* Base Resets */
      body { margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
      table { border-collapse: collapse; width: 100%; }
      img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
      
      /* Container */
      .email-wrapper { width: 100%; table-layout: fixed; background-color: #f8fafc; padding-bottom: 40px; }
      .email-container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; margin-top: 40px; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05); }

      /* Header */
      .header { padding: 40px 40px 20px 40px; text-align: left; }
      .logo-text { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: #0f172a; text-transform: uppercase; }
      
      /* Content */
      .content { padding: 0 24px 24px 24px; }
      .hero-title { font-size: 32px; font-weight: 800; color: #0f172a; line-height: 1.2; margin-bottom: 16px; letter-spacing: -1px; }
      .text-regular { font-size: 16px; line-height: 1.6; color: #475569; margin-bottom: 24px; }

      /* The Premium Card */
      .cta-card { 
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); 
        border-radius: 20px; 
        padding: 32px; 
        color: #ffffff; 
        text-align: center; 
        box-shadow: 0 15px 30px rgba(15, 23, 42, 0.15);
      }
      .cta-title { font-size: 18px; font-weight: 600; margin-bottom: 8px; color: #f8fafc; }
      .cta-text { font-size: 14px; color: #94a3b8; margin-bottom: 24px; }
      
      /* Button */
      .button { 
        display: inline-block; 
        background-color: #ffffff; 
        color: #0f172a !important; 
        padding: 14px 32px; 
        border-radius: 12px; 
        text-decoration: none; 
        font-weight: 700; 
        font-size: 15px; 
        transition: all 0.3s ease; 
      }

      /* Grid Section */
      .feature-grid { padding: 32px 0; }
      .feature-item { padding: 0 0 24px 0; }
      .feature-icon { font-size: 24px; margin-bottom: 8px; }
      .feature-heading { font-size: 16px; font-weight: 700; color: #0f172a; margin: 0 0 4px 0; }
      .feature-desc { font-size: 14px; color: #64748b; margin: 0; }

      /* Footer */
      .footer { padding: 40px; text-align: center; border-top: 1px solid #f1f5f9; background-color: #fafafa; }
      .footer-text { font-size: 13px; color: #94a3b8; line-height: 1.5; }
      .footer-links a { color: #6366f1; text-decoration: none; font-weight: 600; margin: 0 10px; font-size: 13px; }
    </style>
  </head>
  <body>
    <div class="email-wrapper">
      <div class="email-container">
        
        <div class="header">
          <span class="logo-text">TopEdge AI</span>
        </div>
        
        <div class="content">
          <h1 class="hero-title">Welcome to the inner circle, ${name || 'Builder'}.</h1>
          <p class="text-regular">
            You've just joined an exclusive ecosystem of AI developers, founders, and automation experts. We’re here to help you deploy faster and connect with the best in the industry.
          </p>
          
          <div class="cta-card">
            <h3 class="cta-title">Activate Your Presence</h3>
            <p class="cta-text">Set up your public profile to showcase your stack and start receiving outreach from founders.</p>
            <a href="https://topedgeai.com/community/promote-profile" class="button">Create My Profile</a>
            <div style="margin-top: 20px;">
                <a href="https://topedgeai.com/community" style="color: #818cf8; text-decoration: none; font-size: 13px; font-weight: 600;">Browse the Directory &rarr;</a>
            </div>
          </div>

          <div class="feature-grid">
            <table role="presentation">
              <tr>
                <td class="feature-item">
                  <div class="feature-icon">🚀</div>
                  <h4 class="feature-heading">Ship Your Agents</h4>
                  <p class="feature-desc">Upload templates and tools to gain visibility and establish your authority.</p>
                </td>
              </tr>
              <tr>
                <td class="feature-item">
                  <div class="feature-icon">🤝</div>
                  <h4 class="feature-heading">Elite Networking</h4>
                  <p class="feature-desc">Connect with verified builders and founders building the future of AI.</p>
                </td>
              </tr>
            </table>
          </div>
        </div>

        <div class="footer">
          <p class="footer-text" style="color: #0f172a; font-weight: 700; margin-bottom: 8px;">Team TopEdge AI</p>
          <div class="footer-links">
            <a href="https://topedgeai.com">Website</a>
            <a href="https://topedgeai.com/community">Community</a>
          </div>
          <p class="footer-text" style="margin-top: 24px;">
            © 2026 TopEdge AI. All rights reserved.<br>
            The future of automation starts here.
          </p>
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

// 1.6 Profile Reminder Email
app.post('/api/send-profile-reminder', async (req, res) => {
  try {
    const { email, name, daysAgo } = req.body;

    const html = `
      <!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Boost Your Visibility | TopEdge AI</title>
    <style>
      body { margin: 0; padding: 0; background-color: #fcfcfc; font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
      .wrapper { width: 100%; table-layout: fixed; background-color: #fcfcfc; padding: 40px 0; }
      .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #f1f5f9; border-radius: 28px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03); }
      
      /* Header */
      .header { padding: 40px 40px 0; text-align: left; }
      .logo { font-size: 18px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 1px; }
      
      /* Content */
      .content { padding: 40px; }
      .title { font-size: 28px; font-weight: 800; color: #0f172a; line-height: 1.2; letter-spacing: -0.8px; margin-bottom: 20px; }
      .description { font-size: 16px; color: #64748b; line-height: 1.6; margin-bottom: 32px; }
      
      /* Dark Premium Card */
      .status-card { background: #0f172a; border-radius: 24px; padding: 32px; color: #ffffff; position: relative; overflow: hidden; }
      .status-label { font-size: 12px; font-weight: 700; color: #818cf8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; display: block; }
      .status-headline { font-size: 18px; font-weight: 600; margin-bottom: 24px; display: block; }
      
      /* Bullet List */
      .benefit-item { display: flex; align-items: center; margin-bottom: 16px; font-size: 14px; color: #cbd5e1; }
      .bullet { color: #818cf8; margin-right: 12px; font-weight: bold; }
      
      /* Button */
      .button { display: inline-block; background: #ffffff; color: #0f172a !important; padding: 16px 32px; border-radius: 14px; text-decoration: none; font-weight: 700; font-size: 15px; margin-top: 12px; transition: transform 0.2s; }
      
      /* Footer */
      .footer { padding: 40px; border-top: 1px solid #f1f5f9; text-align: center; }
      .footer-text { font-size: 12px; color: #94a3b8; line-height: 1.8; }
      .footer-brand { font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 16px; }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="container">
        <div class="header">
          <div class="logo">TopEdge AI</div>
        </div>
        
        <div class="content">
          <h1 class="title">Your profile is currently hidden from the community.</h1>
          <p class="description">
            It’s been ${daysAgo} days since you joined the ranks. Right now, founders and fellow builders cannot see your expertise or reach out for collaborations.
          </p>
          
          <div class="status-card">
            <span class="status-label">Setup Pending</span>
            <span class="status-headline">Complete these to go live:</span>
            
            <div class="benefit-item"><span class="bullet">→</span> Get discovered by potential clients</div>
            <div class="benefit-item"><span class="bullet">→</span> Unlock exclusive resource access</div>
            <div class="benefit-item"><span class="bullet">→</span> Earn the "Early Adopter" trust badge</div>
            
            <a href="https://topedgeai.com/community/promote-profile" class="button">Setup My Profile</a>
          </div>
        </div>
        
        <div class="footer">
          <div class="footer-brand">Team TopEdge AI</div>
          <p class="footer-text">
            You are receiving this because you are a registered member of the TopEdge AI Community.<br>
            © 2026 TopEdge AI. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  </body>
</html>
    `;

    await sendEmail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Don't Stay Anonymous, ${name}! 👀`,
      html: html
    });

    res.status(200).json({ success: true, message: 'Profile reminder email sent' });
  } catch (error) {
    console.error('Error sending profile reminder email:', error);
    res.status(500).json({ message: 'Failed to send profile reminder email', error: error.message });
  }
});

// 1.7 Resource Nudge Email
app.post('/api/send-resource-nudge', async (req, res) => {
  try {
    const { email, name } = req.body;

    const html = `
      <!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Monetize Your Expertise | TopEdge AI</title>
    <style>
      body { margin: 0; padding: 0; background-color: #f4f7f9; font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; -webkit-font-smoothing: antialiased; }
      .wrapper { width: 100%; table-layout: fixed; background-color: #f4f7f9; padding: 20px 0; }
      .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 32px; overflow: hidden; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.04); border: 1px solid #eef2f6; }
      
      /* Header */
      .header { padding: 48px 48px 0; text-align: left; }
      .logo { font-size: 16px; font-weight: 900; color: #0f172a; text-transform: uppercase; letter-spacing: 2px; }
      
      /* Content */
      .content { padding: 48px; }
      .hero-title { font-size: 32px; font-weight: 800; color: #0f172a; line-height: 1.1; letter-spacing: -1.2px; margin-bottom: 24px; }
      .description { font-size: 16px; color: #475569; line-height: 1.7; margin-bottom: 32px; }
      
      /* The Earnings Card */
      .market-card { background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); border-radius: 24px; padding: 40px; color: #ffffff; }
      .market-label { font-size: 12px; font-weight: 700; color: #c7d2fe; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 16px; display: block; }
      .market-title { font-size: 20px; font-weight: 700; margin-bottom: 24px; display: block; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 16px; }
      
      /* Grid Items */
      .asset-list { margin-bottom: 32px; }
      .asset-item { display: flex; align-items: center; margin-bottom: 12px; font-size: 15px; font-weight: 500; }
      .dot { height: 6px; width: 6px; background-color: #ffffff; border-radius: 50%; margin-right: 12px; opacity: 0.6; }
      
      /* Button */
      .button { display: inline-block; background: #ffffff; color: #4f46e5 !important; padding: 18px 36px; border-radius: 16px; text-decoration: none; font-weight: 800; font-size: 15px; box-shadow: 0 10px 20px rgba(0,0,0,0.1); }
      
      /* Footer */
      .footer { padding: 48px; text-align: center; background-color: #fafbfc; border-top: 1px solid #f1f5f9; }
      .footer-links a { color: #64748b; text-decoration: none; font-size: 13px; font-weight: 600; margin: 0 12px; }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="container">
        <div class="header">
          <div class="logo">TopEdge AI</div>
        </div>
        
        <div class="content">
          <h1 class="hero-title">Transform your workflows into digital assets.</h1>
          <p class="description">
            Hey ${name}, your profile is already standing out. Now, leverage the TopEdge Marketplace to build your reputation as a top-tier builder—or generate recurring revenue from your scripts and templates.
          </p>
          
          <div class="market-card">
            <span class="market-label">Marketplace Opportunity</span>
            <span class="market-title">High-demand categories:</span>
            
            <div class="asset-list">
              <div class="asset-item"><span class="dot"></span> Custom AI Agent Configs</div>
              <div class="asset-item"><span class="dot"></span> SaaS Automation Workflows</div>
              <div class="asset-item"><span class="dot"></span> Niche Chatbot Blueprints</div>
            </div>
            
            <a href="https://topedgeai.com/community/upload" class="button">Publish Your First Asset</a>
          </div>
        </div>
        
        <div class="footer">
          <div class="footer-links">
            <a href="https://topedgeai.com">Website</a>
            <a href="https://topedgeai.com/community">Marketplace</a>
          </div>
          <p style="font-size: 12px; color: #94a3b8; margin-top: 24px;">
            © 2026 TopEdge AI. All rights reserved.<br>
            Empowering the next generation of AI Builders.
          </p>
        </div>
      </div>
    </div>
  </body>
</html>
    `;

    await sendEmail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Turn Your Knowledge into Income 💰',
      html: html
    });

    res.status(200).json({ success: true, message: 'Resource nudge email sent' });
  } catch (error) {
    console.error('Error sending resource nudge email:', error);
    res.status(500).json({ message: 'Failed to send resource nudge email', error: error.message });
  }
});

// 1.8 Community Update Email
app.post('/api/send-community-update', async (req, res) => {
  try {
    const { email, title, content, ctaText, ctaLink } = req.body;

    const html = `
      <!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | TopEdge AI</title>
    <style>
      body { margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif; -webkit-font-smoothing: antialiased; }
      .wrapper { width: 100%; table-layout: fixed; background-color: #f8fafc; padding: 10px 0; }
      .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 32px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.04); }
      
      /* Header: Minimal & Brand-focused */
      .header { padding: 24px 24px 0; text-align: left; }
      .brand { font-size: 14px; font-weight: 800; color: #6366f1; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 8px; display: block; }
      .update-label { font-size: 13px; font-weight: 500; color: #94a3b8; }
      
      /* Content: Editorial Typography */
      .content { padding: 24px 48px 48px; }
      .hero-title { font-size: 32px; font-weight: 800; color: #0f172a; line-height: 1.2; letter-spacing: -1.2px; margin-bottom: 24px; }
      .body-text { font-size: 16px; color: #475569; line-height: 1.8; margin-bottom: 32px; }
      
      /* Dynamic Action Section */
      .action-area { 
        background-color: #f8fafc; 
        border: 1px solid #f1f5f9; 
        border-radius: 24px; 
        padding: 32px; 
        text-align: center; 
      }
      .button { 
        display: inline-block; 
        background-color: #0f172a; 
        color: #ffffff !important; 
        padding: 16px 36px; 
        border-radius: 14px; 
        text-decoration: none; 
        font-weight: 700; 
        font-size: 15px; 
        box-shadow: 0 10px 15px -3px rgba(15, 23, 42, 0.2); 
      }

      /* Footer: Professional & Muted */
      .footer { padding: 48px; border-top: 1px solid #f1f5f9; background-color: #fafbfc; text-align: center; }
      .footer-brand { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 12px; display: block; }
      .footer-links a { color: #6366f1; text-decoration: none; font-size: 13px; font-weight: 600; margin: 0 12px; }
      .footer-legal { font-size: 12px; color: #94a3b8; margin-top: 24px; line-height: 1.6; }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="container">
        
        <div class="header">
          <span class="brand">TopEdge AI</span>
          <span class="update-label">Community Bulletin • 2026</span>
        </div>
        
        <div class="content">
          <h1 class="hero-title">${title}</h1>
          
          <div class="body-text">
            ${content.replace(/\n/g, '<br>')}
          </div>
          
          <div class="action-area">
            <a href="${ctaLink}" class="button">${ctaText}</a>
            <p style="margin-top: 16px; font-size: 13px; color: #94a3b8;">
              Clicking will redirect you to the community dashboard.
            </p>
          </div>
        </div>

        <div class="footer">
          <span class="footer-brand">Team TopEdge AI</span>
          <div class="footer-links">
            <a href="https://topedgeai.com">Main Website</a>
            <a href="https://topedgeai.com/community">Builder Directory</a>
          </div>
          <p class="footer-legal">
            © 2026 TopEdge AI. All rights reserved.<br>
            Sent with care to our verified AI Builder community.
          </p>
        </div>
        
      </div>
    </div>
  </body>
</html>
    `;

    await sendEmail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: title,
      html: html
    });

    res.status(200).json({ success: true, message: 'Community update email sent' });
  } catch (error) {
    console.error('Error sending community update email:', error);
    res.status(500).json({ message: 'Failed to send community update email', error: error.message });
  }
});

// 2. Broadcast: General Announcement (Dynamic)
app.post('/api/admin/broadcast-announcement', async (req, res) => {
  try {
    const { secret, title, content, ctaText, ctaLink } = req.body;
    if (secret !== (process.env.OTP_SECRET || 'topedge-secret-key-change-in-prod')) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    if (!firebaseInitialized) {
      return res.status(500).json({ message: 'Firebase not initialized' });
    }

    let sentCount = 0;
    let errors = [];
    let nextPageToken;
    let totalProcessed = 0;

    console.log(`[BROADCAST] Starting announcement: ${title}`);

    do {
      const listUsersResult = await authAdmin().listUsers(1000, nextPageToken);
      const users = listUsersResult.users;
      nextPageToken = listUsersResult.pageToken;
      totalProcessed += users.length;

      console.log(`[BROADCAST] Processing batch of ${users.length} users... Total so far: ${totalProcessed}`);

      for (const user of users) {
        if (!user.email) continue;

        try {
          const html = `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${title} | TopEdge AI</title>
                <style>
                  body { margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif; -webkit-font-smoothing: antialiased; }
                  .wrapper { width: 100%; table-layout: fixed; background-color: #f8fafc; padding: 10px 0; }
                  .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 32px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.04); }
                  
                  .header { padding: 24px 24px 0; text-align: left; }
                  .brand { font-size: 14px; font-weight: 800; color: #6366f1; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 8px; display: block; }
                  .update-label { font-size: 13px; font-weight: 500; color: #94a3b8; }
                  
                  .content { padding: 24px 48px 48px; }
                  .hero-title { font-size: 32px; font-weight: 800; color: #0f172a; line-height: 1.2; letter-spacing: -1.2px; margin-bottom: 24px; }
                  .body-text { font-size: 16px; color: #475569; line-height: 1.8; margin-bottom: 32px; }
                  
                  .action-area { 
                    background-color: #f8fafc; 
                    border: 1px solid #f1f5f9; 
                    border-radius: 24px; 
                    padding: 32px; 
                    text-align: center; 
                  }
                  .button { 
                    display: inline-block; 
                    background-color: #0f172a; 
                    color: #ffffff !important; 
                    padding: 16px 36px; 
                    border-radius: 14px; 
                    text-decoration: none; 
                    font-weight: 700; 
                    font-size: 15px; 
                    box-shadow: 0 10px 15px -3px rgba(15, 23, 42, 0.2); 
                  }

                  .footer { padding: 48px; border-top: 1px solid #f1f5f9; background-color: #fafbfc; text-align: center; }
                  .footer-brand { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 12px; display: block; }
                  .footer-links a { color: #6366f1; text-decoration: none; font-size: 13px; font-weight: 600; margin: 0 12px; }
                  .footer-legal { font-size: 12px; color: #94a3b8; margin-top: 24px; line-height: 1.6; }
                </style>
              </head>
              <body>
                <div class="wrapper">
                  <div class="container">
                    <div class="header">
                      <span class="brand">TopEdge AI</span>
                      <span class="update-label">Community Bulletin</span>
                    </div>
                    
                    <div class="content">
                      <h1 class="hero-title">${title}</h1>
                      <div class="body-text">
                        ${content.replace(/\n/g, '<br>')}
                      </div>
                      
                      <div class="action-area">
                        <a href="${ctaLink}" class="button">${ctaText || 'View Details'}</a>
                      </div>
                    </div>

                    <div class="footer">
                      <span class="footer-brand">Team TopEdge AI</span>
                      <div class="footer-links">
                        <a href="https://topedgeai.com">Main Website</a>
                        <a href="https://topedgeai.com/community">Builder Directory</a>
                      </div>
                      <p class="footer-legal">
                        © 2026 TopEdge AI. All rights reserved.<br>
                        Sent with care to our verified AI Builder community.
                      </p>
                    </div>
                  </div>
                </div>
              </body>
            </html>
          `;

          await sendEmail({
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: title,
            html: html
          });

          sentCount++;
          // Rate limit: 100ms
          await new Promise(r => setTimeout(r, 100));

        } catch (err) {
          console.error(`Failed to send to ${user.email}`, err);
          errors.push({ email: user.email, error: err.message });
        }
      }
    } while (nextPageToken);

    res.status(200).json({
      success: true,
      message: `Broadcast completed. Processed ${totalProcessed} users. Sent ${sentCount} emails.`,
      errors
    });

  } catch (error) {
    console.error('Error in broadcast:', error);
    res.status(500).json({ message: 'Broadcast failed', error: error.message });
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

    let sentCount = 0;
    let errors = [];
    let nextPageToken;
    let totalProcessed = 0;

    do {
      const listUsersResult = await authAdmin().listUsers(1000, nextPageToken);
      const users = listUsersResult.users;
      nextPageToken = listUsersResult.pageToken;
      totalProcessed += users.length;

      console.log(`[BROADCAST] Processing batch of ${users.length} users... Total so far: ${totalProcessed}`);

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
              <p class="text-regular">The TopEdge AI Community is officially LIVE!</p>
              <p class="text-regular">You are one of our founding members. Thank you for setting up your profile early.</p>
              <div class="premium-box">
                <h3 class="subtitle">What's New:</h3>
                <ul class="premium-list">
                   <li>Browse the new <strong style="color: #818CF8;">Automation Hub</strong> for AI agents.</li>
                   <li>Check out the <strong style="color: #818CF8;">Request Board</strong> for opportunities.</li>
                   <li>Connect with other members.</li>
                </ul>
              </div>
              <div class="text-center mt-24">
                 <a href="https://topedgeai.com/community" class="button">Visit Community</a>
              </div>
            `;
          } else {
            content = `
              <p class="text-regular">The TopEdge AI Community is officially LIVE!</p>
              <p class="text-regular">We noticed you haven't set up your profile yet. As one of our early members, your profile will get featured visibility.</p>
              <div class="premium-box">
                <h3 class="subtitle">Why Create a Profile?</h3>
                <ul class="premium-list">
                   <li>Get discovered by clients and collaborators.</li>
                   <li>Showcase your AI skills and portfolio.</li>
                   <li>Access exclusive community resources.</li>
                </ul>
              </div>
              <div class="text-center mt-24">
                 <a href="https://topedgeai.com/community/promote-profile" class="button">Create Profile Now</a>
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
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <title>Community Launch</title>
                  <style>${commonEmailStyles}</style>
                </head>
                <body>
                  <div class="container">
                    <div class="header">
                      <span class="logo-text">TopEdge AI</span>
                      <p class="header-subtitle">Community Launch 🚀</p>
                    </div>
                    <div class="content">
                      <div class="section">
                        <h2 class="section-title">Hello ${name},</h2>
                        ${content}
                      </div>
                      <div class="footer">
                        <p>Best regards,</p>
                        <p style="color: #F8FAFC; font-weight: 600;">Team TopEdge AI</p>
                        <div style="margin-top: 24px;">
                          <p>© 2026 TopEdge AI. All rights reserved.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </body>
              </html>
            `
          });
          sentCount++;
          await new Promise(r => setTimeout(r, 200)); // Rate limit protection (reduced to 200ms for speed)

        } catch (err) {
          console.error(`[BROADCAST] Failed to send to ${user.email}:`, err);
          errors.push({ email: user.email, error: err.message });
        }
      }
    } while (nextPageToken);

    res.status(200).json({
      success: true,
      message: `Broadcast completed. Processed ${totalProcessed} users. Sent to ${sentCount} users.`,
      errors: errors
    });

  } catch (error) {
    console.error('Broadcast error:', error);
    res.status(500).json({ message: 'Broadcast failed', error: error.message });
  }
});

// 3. Engagement Check (Daily Cron Job) - Legacy path for Netlify / Firebase Auth based flow
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
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Action Required | TopEdge AI</title>
    <style>
      body { margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
      .wrapper { width: 100%; table-layout: fixed; background-color: #f9fafb; padding: 10px 0; }
      .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 28px; overflow: hidden; border: 1px solid #e5e7eb; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03); }
      
      /* Header */
      .header { padding: 24px 24px 0; text-align: left; }
      .brand-accent { height: 4px; width: 40px; background-color: #6366f1; border-radius: 2px; margin-bottom: 24px; }
      .logo { font-size: 14px; font-weight: 900; color: #0f172a; text-transform: uppercase; letter-spacing: 2px; }
      
      /* Content */
      .content { padding: 48px; }
      .headline { font-size: 28px; font-weight: 800; color: #0f172a; line-height: 1.2; letter-spacing: -1px; margin-bottom: 24px; }
      .subtext { font-size: 16px; color: #4b5563; line-height: 1.7; margin-bottom: 32px; }
      
      /* Professional Status Box */
      .status-container { background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 24px; padding: 32px; margin-bottom: 32px; }
      .status-header { display: flex; align-items: center; margin-bottom: 20px; }
      .status-dot { height: 8px; width: 8px; background-color: #f59e0b; border-radius: 50%; margin-right: 10px; }
      .status-text { font-size: 13px; font-weight: 700; color: #b45309; text-transform: uppercase; letter-spacing: 1px; }
      
      /* Benefit List */
      .benefit-item { margin-bottom: 14px; font-size: 14px; color: #475569; display: flex; align-items: center; }
      .check { color: #6366f1; margin-right: 12px; font-weight: 800; }
      
      /* CTA */
      .button { display: inline-block; background-color: #0f172a; color: #ffffff !important; padding: 18px 36px; border-radius: 14px; text-decoration: none; font-weight: 700; font-size: 15px; box-shadow: 0 10px 15px -3px rgba(15, 23, 42, 0.1); }
      
      /* Footer */
      .footer { padding: 48px; background-color: #fafafa; border-top: 1px solid #f3f4f6; text-align: center; }
      .footer-brand { font-size: 13px; font-weight: 700; color: #111827; margin-bottom: 8px; display: block; }
      .footer-legal { font-size: 12px; color: #9ca3af; line-height: 1.6; }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="container">
        
        <div class="header">
          <div class="brand-accent"></div>
          <div class="logo">TopEdge AI</div>
        </div>
        
        <div class="content">
          <h1 class="headline">Complete your verification, ${user.displayName || 'Builder'}.</h1>
          <p class="subtext">
            It’s been 48 hours since you joined the TopEdge community. To ensure the quality of our directory and unlock full visibility, we require a completed profile.
          </p>
          
          <div class="status-container">
            <div class="status-header">
              <span class="status-dot"></span>
              <span class="status-text">Account Status: Incomplete</span>
            </div>
            
            <div style="margin-bottom: 24px;">
              <div class="benefit-item"><span class="check">✓</span> Professional visibility in the Directory</div>
              <div class="benefit-item"><span class="check">✓</span> Direct outreach from verified Founders</div>
              <div class="benefit-item"><span class="check">✓</span> Access to restricted AI Workflows</div>
            </div>
            
            <a href="https://topedgeai.com/community/promote-profile" class="button">Finalize Profile</a>
          </div>
        </div>

        <div class="footer">
          <span class="footer-brand">Team TopEdge AI</span>
          <p class="footer-legal">
            © 2026 TopEdge AI. All rights reserved.<br>
            Sent to registered members of @topedge_ai.
          </p>
        </div>
        
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
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Final Setup Reminder | TopEdge AI</title>
    <style>
      body { margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; -webkit-font-smoothing: antialiased; }
      .wrapper { width: 100%; table-layout: fixed; background-color: #ffffff; padding: 10px 0; }
      .container { max-width: 560px; margin: 0 auto; border-radius: 32px; overflow: hidden; border: 1px solid #f1f5f9; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.02); }
      
      /* Header */
      .header { padding: 24px 24px 0; text-align: left; }
      .logo { font-size: 14px; font-weight: 900; color: #0f172a; text-transform: uppercase; letter-spacing: 3px; }
      
      /* Content */
      .content { padding: 24px 48px 48px; }
      .headline { font-size: 32px; font-weight: 800; color: #0f172a; line-height: 1.1; letter-spacing: -1.5px; margin-bottom: 24px; }
      .body-text { font-size: 16px; color: #64748b; line-height: 1.8; margin-bottom: 40px; }
      
      /* Visual "Progress" Divider */
      .progress-bar { height: 2px; width: 100%; background: #f1f5f9; margin-bottom: 40px; position: relative; }
      .progress-fill { height: 2px; width: 85%; background: #0f172a; position: absolute; left: 0; top: 0; }
      .progress-label { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-top: 8px; display: block; }
      
      /* CTA */
      .button { display: inline-block; background-color: #0f172a; color: #ffffff !important; padding: 18px 40px; border-radius: 16px; text-decoration: none; font-weight: 700; font-size: 15px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.15); transition: all 0.3s ease; }
      
      /* Footer */
      .footer { padding: 24px; text-align: center; border-top: 1px solid #f8fafc; }
      .footer-brand { font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 12px; display: block; }
      .footer-legal { font-size: 12px; color: #cbd5e1; line-height: 1.6; }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="container">
        
        <div class="header">
          <div class="logo">TopEdge AI</div>
        </div>
        
        <div class="content">
          <h1 class="headline">Don't lose your spot in the directory, ${user.displayName || 'Builder'}.</h1>
          
          <p class="body-text">
            Your registration with TopEdge AI is nearly complete. However, without a finished profile, you remain invisible to founders and potential clients searching the community for top AI talent.
          </p>
          
          <div class="progress-bar">
            <div class="progress-fill"></div>
            <span class="progress-label">Profile Completion: 85%</span>
          </div>
          
          <div style="text-align: left;">
            <a href="https://topedgeai.com/community/promote-profile" class="button">Finish My Setup</a>
          </div>
        </div>

        <div class="footer">
          <span class="footer-brand">Team TopEdge AI</span>
          <p class="footer-legal">
            © 2026 TopEdge AI. All rights reserved.<br>
            Official communication for @topedge_ai members.
          </p>
        </div>
        
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
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Launch Your First Asset | TopEdge AI</title>
    <style>
      body { margin: 0; padding: 0; background-color: #fcfcfc; font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; -webkit-font-smoothing: antialiased; }
      .wrapper { width: 100%; table-layout: fixed; background-color: #fcfcfc; padding: 10px 0; }
      .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 32px; overflow: hidden; border: 1px solid #f1f5f9; box-shadow: 0 30px 60px -12px rgba(0,0,0,0.03); }
      
      /* Header: Elegant & Minimal */
      .header { padding: 24px 24px 0; text-align: left; }
      .logo { font-size: 15px; font-weight: 900; color: #0f172a; text-transform: uppercase; letter-spacing: 2px; }
      
      /* Content: Bold Typography */
      .content { padding: 24px 48px 48px; }
      .hero-title { font-size: 34px; font-weight: 800; color: #0f172a; line-height: 1.1; letter-spacing: -1.8px; margin-bottom: 24px; }
      .body-text { font-size: 16px; color: #475569; line-height: 1.8; margin-bottom: 40px; }
      
      /* The "Creator" Feature Card */
      .feature-card { 
        background: #0f172a; 
        border-radius: 28px; 
        padding: 40px; 
        color: #ffffff;
        text-align: center;
      }
      .feature-icon { font-size: 32px; margin-bottom: 16px; display: block; }
      .feature-heading { font-size: 18px; font-weight: 700; margin-bottom: 12px; display: block; color: #f8fafc; }
      .feature-sub { font-size: 14px; color: #94a3b8; margin-bottom: 28px; line-height: 1.6; }
      
      /* Button: High-End White */
      .button { 
        display: inline-block; 
        background-color: #ffffff; 
        color: #0f172a !important; 
        padding: 16px 40px; 
        border-radius: 14px; 
        text-decoration: none; 
        font-weight: 800; 
        font-size: 15px; 
        box-shadow: 0 10px 20px rgba(0,0,0,0.1);
      }

      /* Footer */
      .footer { padding: 24px; text-align: center; border-top: 1px solid #f8fafc; }
      .footer-brand { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 12px; display: block; }
      .footer-links a { color: #6366f1; text-decoration: none; font-size: 13px; font-weight: 600; margin: 0 12px; }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="container">
        
        <div class="header">
          <div class="logo">TopEdge AI</div>
        </div>
        
        <div class="content">
          <h1 class="hero-title">Your profile is live. Now, lead the community.</h1>
          <p class="body-text">
            Excellent work on your profile, ${userData.fullName || 'Builder'}. The community is ready to see what you're building. Showcase your expertise by publishing your first digital asset today.
          </p>
          
          <div class="feature-card">
            <span class="feature-icon">💎</span>
            <span class="feature-heading">Establish Your Authority</span>
            <p class="feature-sub">
              Upload your custom AI agents, automation templates, or scripts to become a verified contributor in the @topedge_ai ecosystem.
            </p>
            <a href="https://topedgeai.com/community/submit-resource" class="button">Publish My First Asset</a>
          </div>
        </div>

        <div class="footer">
          <span class="footer-brand">Team TopEdge AI</span>
          <div class="footer-links">
            <a href="https://topedgeai.com">Dashboard</a>
            <a href="https://topedgeai.com/community">Marketplace</a>
          </div>
          <p style="font-size: 12px; color: #cbd5e1; margin-top: 24px; line-height: 1.6;">
            © 2026 TopEdge AI. All rights reserved.<br>
            Designed for the next generation of AI Builders.
          </p>
        </div>
        
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

// 3b. Engagement Check via Render/HTTP (uses Firestore-based automationLogic)
app.post('/api/admin/run-daily-automation', async (req, res) => {
  try {
    const { secret } = req.body || {};
    if (secret !== OTP_SECRET) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const result = await automationLogic({}, {});
    const statusCode = result?.statusCode || 200;
    let body = {};
    try {
      body = result?.body ? JSON.parse(result.body) : {};
    } catch {
      body = { raw: result?.body };
    }

    return res.status(statusCode).json(body);
  } catch (error) {
    console.error('Error running daily automation via admin endpoint:', error);
    return res.status(500).json({ message: 'Failed to run automation', error: error.message });
  }
});

// 4. New Resource Notification (Broadcast)
app.post('/api/send-resource-notification', async (req, res) => {
  try {
    const { secret, resourceTitle, authorName, resourceId } = req.body;
    if (secret !== (process.env.OTP_SECRET || 'topedge-secret-key-change-in-prod')) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    let nextPageToken;
    let count = 0;
    let errors = [];

    console.log(`[BROADCAST] Starting broadcast for resource: ${resourceTitle}`);

    do {
      const listUsersResult = await authAdmin().listUsers(1000, nextPageToken);
      const users = listUsersResult.users;
      nextPageToken = listUsersResult.pageToken;

      console.log(`[BROADCAST] Fetched batch of ${users.length} users. Next page: ${!!nextPageToken}`);

      for (const user of users) {
        if (!user.email) {
          console.log(`[BROADCAST] Skipping user ${user.uid} - no email`);
          continue;
        }

        try {
          await sendEmail({
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: `New Resource: ${resourceTitle} 🚨`,
            html: `
                    <!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Resource | TopEdge AI</title>
    <style>
      body { margin: 0; padding: 0; background-color: #fcfcfc; font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; -webkit-font-smoothing: antialiased; }
      .wrapper { width: 100%; table-layout: fixed; background-color: #fcfcfc; padding: 10px 0; }
      .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 32px; overflow: hidden; border: 1px solid #f1f5f9; box-shadow: 0 40px 80px -12px rgba(0,0,0,0.05); }
      
      /* Header: Exclusive & Tech-focused */
      .header { padding: 24px 24px 0; text-align: left; }
      .drop-badge { display: inline-block; background: #e0e7ff; color: #4338ca; font-size: 11px; font-weight: 800; padding: 4px 12px; border-radius: 100px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px; }
      .logo { font-size: 14px; font-weight: 900; color: #0f172a; text-transform: uppercase; letter-spacing: 2px; display: block; }
      
      /* Content: Impactful Typography */
      .content { padding: 24px 48px 48px; }
      .headline { font-size: 30px; font-weight: 800; color: #0f172a; line-height: 1.1; letter-spacing: -1.5px; margin-bottom: 12px; }
      .author-tag { font-size: 15px; color: #64748b; margin-bottom: 32px; }
      .author-name { color: #0f172a; font-weight: 700; border-bottom: 2px solid #e0e7ff; }
      
      /* The Resource Card: Premium Dark Mode */
      .resource-card { 
        background: #0f172a; 
        border-radius: 24px; 
        padding: 40px; 
        text-align: center;
        box-shadow: 0 20px 40px rgba(15, 23, 42, 0.15);
      }
      .resource-title { 
        font-size: 22px; 
        font-weight: 700; 
        color: #ffffff; 
        margin-bottom: 28px; 
        line-height: 1.4;
        display: block;
      }
      
      /* Button: Clean & High-Contrast */
      .button { 
        display: inline-block; 
        background-color: #ffffff; 
        color: #0f172a !important; 
        padding: 16px 36px; 
        border-radius: 14px; 
        text-decoration: none; 
        font-weight: 800; 
        font-size: 15px; 
        box-shadow: 0 10px 15px rgba(0,0,0,0.1);
      }

      /* Footer */
      .footer { padding: 24px; text-align: center; border-top: 1px solid #f8fafc; background-color: #fafbfc; }
      .footer-brand { font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 12px; display: block; }
      .footer-links a { color: #6366f1; text-decoration: none; font-size: 13px; font-weight: 600; margin: 0 12px; }
      .legal-text { font-size: 11px; color: #94a3b8; margin-top: 24px; line-height: 1.6; }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="container">
        
        <div class="header">
          <span class="drop-badge">New Drop</span>
          <div class="logo">TopEdge AI</div>
        </div>
        
        <div class="content">
          <h1 class="headline">A new asset has entered the community.</h1>
          <p class="author-tag">
            Contribution by <span class="author-name">${authorName}</span>
          </p>
          
          <div class="resource-card">
            <span class="resource-title">${resourceTitle}</span>
            <a href="https://topedgeai.com/community/resource/${resourceId}" class="button">Access Resource</a>
          </div>
        </div>

        <div class="footer">
          <span class="footer-brand">Team TopEdge AI</span>
          <div class="footer-links">
            <a href="https://topedgeai.com/community">Marketplace</a>
            <a href="https://topedgeai.com/community/profiles">Directory</a>
          </div>
          <p class="legal-text">
            © 2026 TopEdge AI. All rights reserved.<br>
            Stay updated with the latest in AI automation and business solutions.
          </p>
        </div>
        
      </div>
    </div>
  </body>
</html>
                 `
          });
          count++;
          // Rate limiting check - 100ms
          await new Promise(r => setTimeout(r, 100));
        } catch (err) {
          console.error(`Failed to send to ${user.email}`, err);
          errors.push({ email: user.email, error: err.message });
        }
      }
    } while (nextPageToken);

    res.status(200).json({ success: true, sent: count, errors });

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
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Opportunity Brief | TopEdge AI</title>
    <style>
      body { margin: 0; padding: 0; background-color: #fcfcfc; font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; -webkit-font-smoothing: antialiased; }
      .wrapper { width: 100%; table-layout: fixed; background-color: #fcfcfc; padding: 10px 0; }
      .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 32px; overflow: hidden; border: 1px solid #f1f5f9; box-shadow: 0 40px 80px -12px rgba(0,0,0,0.06); }
      
      /* Header: Professional Labeling */
      .header { padding: 24px 24px 0; text-align: left; }
      .badge { display: inline-block; background: #fef3c7; color: #92400e; font-size: 11px; font-weight: 800; padding: 4px 12px; border-radius: 100px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px; }
      .logo { font-size: 14px; font-weight: 900; color: #0f172a; text-transform: uppercase; letter-spacing: 2px; display: block; }
      
      /* Content: Editorial Layout */
      .content { padding: 24px 48px 48px; }
      .headline { font-size: 30px; font-weight: 800; color: #0f172a; line-height: 1.1; letter-spacing: -1.5px; margin-bottom: 12px; }
      .requester-tag { font-size: 15px; color: #64748b; margin-bottom: 32px; }
      .requester-name { color: #0f172a; font-weight: 700; border-bottom: 2px solid #fef3c7; }
      
      /* The Brief Card: Premium & Focused */
      .brief-card { 
        background: #0f172a; 
        border-radius: 24px; 
        padding: 40px; 
        box-shadow: 0 20px 40px rgba(15, 23, 42, 0.15);
      }
      .brief-title { font-size: 20px; font-weight: 700; color: #ffffff; margin-bottom: 16px; display: block; line-height: 1.4; }
      .budget-badge { font-size: 14px; font-weight: 600; color: #818cf8; margin-bottom: 20px; display: block; }
      .brief-desc { font-size: 14px; color: #94a3b8; line-height: 1.6; margin-bottom: 32px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
      
      /* Button: High-Contrast Action */
      .button { display: inline-block; background-color: #ffffff; color: #0f172a !important; padding: 16px 36px; border-radius: 14px; text-decoration: none; font-weight: 800; font-size: 15px; box-shadow: 0 10px 15px rgba(0,0,0,0.1); }

      /* Footer */
      .footer { padding: 24px; text-align: center; border-top: 1px solid #f8fafc; background-color: #fafbfc; }
      .footer-brand { font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 12px; display: block; }
      .footer-links a { color: #6366f1; text-decoration: none; font-size: 13px; font-weight: 600; margin: 0 12px; }
      .legal-text { font-size: 11px; color: #94a3b8; margin-top: 24px; line-height: 1.6; }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="container">
        
        <div class="header">
          <span class="badge">Open Request</span>
          <div class="logo">TopEdge AI</div>
        </div>
        
        <div class="content">
          <h1 class="headline">A new project requires your expertise.</h1>
          <p class="requester-tag">
            Brief by <span class="requester-name">${requesterName}</span>
          </p>
          
          <div class="brief-card">
            <span class="brief-title">"${finalTitle}"</span>
            ${budget ? `<span class="budget-badge">Estimated Budget: ${budget}</span>` : ''}
            ${description ? `<p class="brief-desc">${description}</p>` : ''}
            <div style="text-align: center;">
                <a href="https://topedgeai.com/community/requests" class="button">Submit Proposal</a>
            </div>
          </div>
        </div>

        <div class="footer">
          <span class="footer-brand">Team TopEdge AI</span>
          <div class="footer-links">
            <a href="https://topedgeai.com/community/requests">View All Briefs</a>
            <a href="https://topedgeai.com/community/profiles">My Builder Profile</a>
          </div>
          <p class="legal-text">
            © 2026 TopEdge AI. All rights reserved.<br>
            Connecting world-class AI builders with high-impact opportunities.
          </p>
        </div>
        
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
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject} | TopEdge AI</title>
    <style>
      body { margin: 0; padding: 0; background-color: #fafafa; font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
      .wrapper { width: 100%; table-layout: fixed; background-color: #fafafa; padding: 10px 0; }
      .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 32px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.04); }
      
      /* Header: Clean & Minimalist */
      .header { padding: 24px 24px 0; text-align: left; }
      .brand-line { height: 3px; width: 32px; background-color: #6366f1; border-radius: 2px; margin-bottom: 24px; }
      .logo { font-size: 14px; font-weight: 900; color: #0f172a; text-transform: uppercase; letter-spacing: 2px; }
      
      /* Content: Bold Editorial Feel */
      .content { padding: 24px 48px 48px; }
      .headline { font-size: 32px; font-weight: 800; color: #0f172a; line-height: 1.2; letter-spacing: -1.5px; margin-bottom: 28px; }
      .message-body { font-size: 16px; color: #475569; line-height: 1.8; margin-bottom: 40px; }
      
      /* Action Box: High-Contrast Focus */
      .action-section { 
        background-color: #f8fafc; 
        border-radius: 24px; 
        padding: 32px; 
        text-align: center; 
        border: 1px solid #f1f5f9;
      }
      .button { 
        display: inline-block; 
        background-color: #0f172a; 
        color: #ffffff !important; 
        padding: 16px 36px; 
        border-radius: 14px; 
        text-decoration: none; 
        font-weight: 700; 
        font-size: 15px; 
        box-shadow: 0 10px 20px rgba(15, 23, 42, 0.1); 
      }

      /* Footer: Muted Professionalism */
      .footer { padding: 24px; background-color: #fafbfc; border-top: 1px solid #f1f5f9; text-align: center; }
      .footer-brand { font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 12px; display: block; }
      .footer-links a { color: #6366f1; text-decoration: none; font-size: 12px; font-weight: 600; margin: 0 12px; }
      .legal { font-size: 11px; color: #94a3b8; margin-top: 24px; line-height: 1.6; }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="container">
        
        <div class="header">
          <div class="brand-line"></div>
          <div class="logo">TopEdge AI</div>
        </div>
        
        <div class="content">
          <h1 class="headline">${subject}</h1>
          <div class="message-body">
            ${message}
          </div>
          
          ${actionUrl ? `
          <div class="action-section">
            <a href="${actionUrl}" class="button">${actionText || 'Explore Update'}</a>
          </div>
          ` : ''}
        </div>

        <div class="footer">
          <span class="footer-brand">Team TopEdge AI</span>
          <div class="footer-links">
            <a href="https://topedgeai.com">Official Site</a>
            <a href="https://topedgeai.com/community">Community Dashboard</a>
          </div>
          <p class="legal">
            © 2026 TopEdge AI. All rights reserved.<br>
            Official announcement for the @topedge_ai community.
          </p>
        </div>
        
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

// Test endpoint for email automation
app.get('/api/test-automation', async (req, res) => {
  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const baseUrl = `${protocol}://${host}`;
    const result = await automationLogic(null, null, baseUrl);
    res.json(result);
  } catch (error) {
    console.error('Test automation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export the serverless handler
export const handler = serverless(app);

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  console.log(`Email server configured with: ${process.env.EMAIL_USER}`);
}); 
