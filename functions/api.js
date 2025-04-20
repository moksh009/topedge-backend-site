const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://topedgeai.com',
    'https://www.topedgeai.com',
    'https://topedge-frontend-site.netlify.app'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true,
  maxAge: 86400
}));

app.use(express.json());

// Create transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false
  },
  debug: true
});

// Verify email configuration
transporter.verify((error, success) => {
  if (error) {
    console.error('Error verifying email configuration:', error);
  } else {
    console.log('Server is ready to send emails');
  }
});

// Import your existing email sending functions
const { sendEmail } = require('../app');

// API Routes
app.post('/api/send-maintenance-user-email', async (req, res) => {
  try {
    // Your existing maintenance user email logic
    await sendEmail({
      from: process.env.EMAIL_USER,
      to: req.body.email,
      subject: `Welcome to TopEdge AI - Your ${req.body.planType} Journey Begins`,
      html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to TopEdge AI!</h2>
        <p>Thank you for choosing our ${req.body.planType} plan. We're excited to have you on board.</p>
        <p>Your journey to enhanced productivity and efficiency starts now.</p>
        <p>If you have any questions, feel free to reach out to our support team.</p>
        <p>Best regards,<br>The TopEdge AI Team</p>
      </div>`
    });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ success: false, error: 'Failed to send email' });
  }
});

// Add all your other email routes here...

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK',
    message: 'Email server is running',
    emailConfigured: !!process.env.EMAIL_USER
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Export the serverless handler
module.exports.handler = serverless(app); 