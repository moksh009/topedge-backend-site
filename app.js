import express from 'express';
import nodemailer from 'nodemailer';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors({
<<<<<<< HEAD
  origin: ['http://localhost:3000', 'https://topedge-frontend-site.onrender.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true,
  maxAge: 86400 // 24 hours
=======
  origin: ['https://main.dvuabchwge8pz.amplifyapp.com', 'https://topedgeai.com', 'http://localhost:5173', 'https://topedgeai.netlify.app'],
  credentials: true
>>>>>>> ddfea4f90d5f1a645ff400eeb88eba88e84c5d16
}));

// Handle preflight requests explicitly
app.options('*', cors({
  origin: ['http://localhost:3000', 'https://topedge-frontend-site.onrender.com'],
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
    rejectUnauthorized: false // Only for development
  },
  debug: true // Enable debug logging
});

// Verify email configuration
transporter.verify((error, success) => {
  if (error) {
    console.error('Error verifying email configuration:', error);
  } else {
    console.log('Server is ready to send emails');
  }
});

// Unified email sending function for both booking and contact
const sendEmail = async (mailOptions) => {
  try {
    console.log('Attempting to send email with options:', {
      ...mailOptions,
      auth: { user: process.env.EMAIL_USER }
    });
    
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.response);
    return { success: true, message: 'Email sent successfully' };
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
};

// Common email styles to be used across all templates
const commonEmailStyles = `
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
body {
  font-family: 'Arial', sans-serif;
  line-height: 1.6;
  color: #1F2937;
  background-color: #f4f4f4;
  width: 100%;
  -webkit-font-smoothing: antialiased;
}
.container {
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
  background-color: #fff;
  overflow: hidden;
}
.header {
  text-align: center;
  padding: 40px 0;
  background: linear-gradient(135deg, #0A84FF 0%, #3B82F6 100%);
  color: white;
}
.content {
  padding: 0;
  background: #fff;
}
.section {
  margin-bottom: 24px;
  padding: 24px 20px;
  background-color: #fff;
}
.section-title {
  color: #0A84FF;
  font-size: 22px;
  margin-bottom: 16px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.section-content {
  background-color: #fff;
  padding: 0;
}
.premium-box {
  background: linear-gradient(135deg, rgba(10, 132, 255, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 12px;
  padding: 24px;
  margin: 24px 0;
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
  margin: 20px 0;
}
.stat-item {
  background: #fff;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  text-align: center;
}
.stat-number {
  font-size: 24px;
  font-weight: 700;
  color: #0A84FF;
  margin-bottom: 8px;
}
.stat-label {
  color: #4B5563;
  font-size: 14px;
}
.button {
  display: inline-block;
  padding: 16px 32px;
  background: linear-gradient(135deg, #0A84FF 0%, #3B82F6 100%);
  color: white;
  text-decoration: none;
  border-radius: 8px;
  font-weight: 600;
  margin: 8px 0;
  text-align: center;
  transition: all 0.3s ease;
  box-shadow: 0 4px 6px rgba(10, 132, 255, 0.12);
}
.button:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 8px rgba(10, 132, 255, 0.2);
}
.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin: 20px 0;
}
.info-item {
  background: #F9FAFB;
  padding: 16px;
  border-radius: 8px;
}
.info-label {
  color: #6B7280;
  font-size: 13px;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.info-value {
  color: #1F2937;
  font-size: 16px;
  font-weight: 500;
}
.divider {
  height: 1px;
  background: #E5E7EB;
  margin: 24px 0;
}
.footer {
  text-align: center;
  color: #6B7280;
  font-size: 14px;
  padding: 24px;
  background: #F9FAFB;
}
@media screen and (max-width: 600px) {
  .container {
    width: 100%;
    margin: 0;
  }
  .section {
    padding: 20px 16px;
  }
  .premium-box {
    padding: 20px 16px;
  }
  .stats-grid {
    grid-template-columns: 1fr;
  }
  .info-grid {
    grid-template-columns: 1fr;
  }
}`;

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
    console.error('Error sending email:', error);
    res.status(500).json({ success: false, error: 'Failed to send email' });
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
            <style>
              body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                background-color: #f4f4f4;
                margin: 0;
                padding: 20px;
              }
              .container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #fff;
                border-radius: 16px;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                overflow: hidden;
              }
              .header {
                text-align: center;
                padding: 40px 20px;
                background: ${planGradient};
                color: white;
              }
              .content {
                padding: 40px 30px;
              }
              .section {
                background-color: #F9FAFB;
                border-radius: 12px;
                padding: 25px;
                margin-bottom: 30px;
              }
              .section-title {
                color: ${planColor};
                font-size: 20px;
                margin: 0 0 15px 0;
                font-weight: 600;
              }
              .section-content {
                background-color: #fff;
                border-radius: 8px;
                padding: 20px;
                border: 1px solid #E5E7EB;
              }
              .info-item {
                margin-bottom: 15px;
              }
              .info-label {
                color: #6B7280;
                font-size: 14px;
                margin: 0;
              }
              .info-value {
                color: #1F2937;
                font-size: 16px;
                font-weight: 500;
                margin: 5px 0 0 0;
              }
              .action-section {
                background-color: #FEF2F2;
                border-radius: 12px;
                padding: 25px;
              }
              .action-title {
                color: #DC2626;
                font-size: 20px;
                margin: 0 0 15px 0;
              }
              .action-content {
                background-color: #fff;
                border-radius: 8px;
                padding: 20px;
                border: 1px solid #FCA5A5;
              }
              @media (max-width: 480px) {
                .content {
                  padding: 20px 15px;
                }
                .section {
                  padding: 15px;
                }
                .section-content {
                  padding: 15px;
                }
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0; font-size: 28px; font-weight: 700;">TopEdge AI</h1>
                <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.9;">New ${planType} Inquiry</p>
              </div>
              
              <div class="content">
                <div style="margin-bottom: 30px;">
                  <h2 style="color: #1F2937; font-size: 24px; margin: 0 0 15px 0;">New Inquiry Received</h2>
                  <p style="color: #4B5563; font-size: 16px; margin: 0;">A new ${planType} inquiry has been submitted. Here are the details:</p>
                </div>
                
                <div class="section">
                  <h3 class="section-title">Client Information</h3>
                  <div class="section-content">
                    <div class="info-item">
                      <p class="info-label">Name</p>
                      <p class="info-value">${name}</p>
                    </div>
                    <div class="info-item">
                      <p class="info-label">Email</p>
                      <p class="info-value">
                        <a href="mailto:${email}" style="color: ${planColor}; text-decoration: none;">${email}</a>
                      </p>
                    </div>
                    <div class="info-item">
                      <p class="info-label">Phone</p>
                      <p class="info-value">
                        <a href="tel:${phone}" style="color: ${planColor}; text-decoration: none;">${phone}</a>
                      </p>
                    </div>
                    <div class="info-item">
                      <p class="info-label">Selected Plan</p>
                      <p class="info-value">${plan}</p>
                    </div>
                  </div>
                </div>

                <div class="action-section">
                  <h3 class="action-title">Action Required</h3>
                  <div class="action-content">
                    <p style="margin: 0 0 15px 0; color: #4B5563;">Please take the following actions:</p>
                    <ol style="margin: 0; padding-left: 20px; color: #4B5563;">
                      <li style="margin-bottom: 10px;">Review the client's requirements</li>
                      <li style="margin-bottom: 10px;">Prepare a customized solution proposal</li>
                      <li style="margin-bottom: 10px;">Schedule a demo call</li>
                      <li>Respond within 24 hours</li>
                    </ol>
                  </div>
                </div>
                
                <div style="text-align: center; color: #6B7280; font-size: 14px; margin-top: 40px;">
                  <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #E5E7EB;">
                    <p style="margin: 0;">© 2024 TopEdge AI. All rights reserved.</p>
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
    console.error('Error sending email:', error);
    res.status(500).json({ success: false, error: 'Failed to send email' });
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
            <style>
              * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
              }
              body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                background-color: #f4f4f4;
                width: 100%;
              }
              .container {
                width: 100%;
                background-color: #fff;
                border-radius: 16px;
                overflow: hidden;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
              }
              .header {
                text-align: center;
                padding: 40px 0;
                background: linear-gradient(135deg, #0A84FF 0%, #3B82F6 100%);
                color: white;
              }
              .content {
                padding: 40px 20px;
                background: #fff;
              }
              .section {
                background-color: #F9FAFB;
                margin-bottom: 30px;
                padding: 25px 20px;
                border-radius: 12px;
              }
              .section-title {
                color: #0A84FF;
                font-size: 20px;
                margin-bottom: 15px;
                font-weight: 600;
              }
              .section-content {
                background-color: #fff;
                padding: 20px;
                border: 1px solid #E5E7EB;
                border-radius: 8px;
              }
              .info-item {
                margin-bottom: 15px;
              }
              .info-label {
                color: #6B7280;
                font-size: 14px;
                margin-bottom: 5px;
              }
              .info-value {
                color: #1F2937;
                font-size: 16px;
                font-weight: 500;
              }
              .footer {
                text-align: center;
                color: #6B7280;
                font-size: 14px;
                padding: 20px;
                border-top: 1px solid #E5E7EB;
              }
              @media screen and (min-width: 600px) {
                .container {
                  max-width: 600px;
                  margin: 0 auto;
                }
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0; font-size: 28px; font-weight: 700;">TopEdge AI</h1>
                <p style="margin-top: 10px; font-size: 18px;">New Contact Form Submission</p>
              </div>
              
              <div class="content">
                <div class="section">
                  <h3 class="section-title">Contact Information</h3>
                  <div class="section-content">
                    <div class="info-item">
                      <p class="info-label">Name</p>
                      <p class="info-value">${name}</p>
                    </div>
                    <div class="info-item">
                      <p class="info-label">Email</p>
                      <p class="info-value">
                        <a href="mailto:${email}" style="color: #0A84FF; text-decoration: none;">${email}</a>
                      </p>
                    </div>
                    ${phone ? `
                    <div class="info-item">
                      <p class="info-label">Phone</p>
                      <p class="info-value">
                        <a href="tel:${phone}" style="color: #0A84FF; text-decoration: none;">${phone}</a>
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
                      <p class="info-label">Monthly Queries (Calls + Text Combined)</p>
                      <p class="info-value">${queries}</p>
                    </div>
                    ` : ''}
                    <div class="info-item">
                      <p class="info-label">Subject</p>
                      <p class="info-value">${subject}</p>
                    </div>
                    <div class="info-item">
                      <p class="info-label">Message</p>
                      <p class="info-value">${message}</p>
                    </div>
                  </div>
                </div>

                <div class="section" style="background-color: #FEF2F2;">
                  <h3 class="section-title" style="color: #DC2626;">Action Required</h3>
                  <div class="section-content" style="border-color: #FCA5A5;">
                    <p style="color: #4B5563;">Please take the following actions:</p>
                    <ol style="margin: 15px 0 0 20px; color: #4B5563;">
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
    console.error('Error sending admin notification:', error);
    res.status(500).json({ message: 'Failed to send admin notification', error: error.message });
  }
});

// Booking - User Email
app.post('/api/send-user-email', async (req, res) => {
  try {
    const { name, email, date, time, additionalInfo, phone, companyName } = req.body;

    await sendEmail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your Consultation Booking Confirmation - TopEdge AI',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Booking Confirmation - TopEdge AI</title>
            <style>
              * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
              }
              body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                background-color: #f4f4f4;
                width: 100%;
              }
              .container {
                width: 100%;
                background-color: #fff;
                border-radius: 16px;
                overflow: hidden;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
              }
              .header {
                text-align: center;
                padding: 40px 0;
                background: linear-gradient(135deg, #0A84FF 0%, #3B82F6 100%);
                color: white;
              }
              .content {
                padding: 40px 20px;
                background: #fff;
              }
              .section {
                background-color: #F9FAFB;
                margin-bottom: 30px;
                padding: 25px 20px;
                border-radius: 12px;
              }
              .section-title {
                color: #0A84FF;
                font-size: 20px;
                margin-bottom: 15px;
                font-weight: 600;
              }
              .section-content {
                background-color: #fff;
                padding: 20px;
                border: 1px solid #E5E7EB;
                border-radius: 8px;
              }
              .info-item {
                margin-bottom: 15px;
              }
              .info-label {
                color: #6B7280;
                font-size: 14px;
                margin-bottom: 5px;
              }
              .info-value {
                color: #1F2937;
                font-size: 16px;
                font-weight: 500;
              }
              .highlight-box {
                background: linear-gradient(135deg, rgba(10, 132, 255, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%);
                border-radius: 12px;
                padding: 20px;
                margin: 30px 0;
                text-align: center;
              }
              .button {
                display: inline-block;
                padding: 16px 32px;
                background: linear-gradient(135deg, #0A84FF 0%, #3B82F6 100%);
                color: white;
                text-decoration: none;
                border-radius: 8px;
                font-weight: 600;
                margin-top: 20px;
              }
              .footer {
                text-align: center;
                color: #6B7280;
                font-size: 14px;
                padding: 20px;
                border-top: 1px solid #E5E7EB;
              }
              @media screen and (min-width: 600px) {
                .container {
                  max-width: 600px;
                  margin: 0 auto;
                }
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0; font-size: 28px; font-weight: 700;">TopEdge AI</h1>
                <p style="margin-top: 10px; font-size: 18px;">Booking Confirmation</p>
              </div>
              
              <div class="content">
                <h2 style="color: #1F2937; font-size: 24px; margin-bottom: 15px;">Hello ${name},</h2>
                <p style="color: #4B5563; font-size: 16px; line-height: 1.8;">
                  Thank you for booking a consultation with TopEdge AI. Your meeting has been confirmed for the following time:
                </p>

                <div class="highlight-box">
                  <h3 style="color: #0A84FF; font-size: 18px; margin-bottom: 10px;">Consultation Details</h3>
                  <p style="color: #1F2937; font-size: 20px; font-weight: 600;">
                    ${date}
                  </p>
                </div>

                <div class="section">
                  <h3 class="section-title">Your Information</h3>
                  <div class="section-content">
                    <div class="info-item">
                      <p class="info-label">Name</p>
                      <p class="info-value">${name}</p>
                    </div>
                    <div class="info-item">
                      <p class="info-label">Email</p>
                      <p class="info-value">${email}</p>
                    </div>
                    ${phone ? `
                    <div class="info-item">
                      <p class="info-label">Phone</p>
                      <p class="info-value">${phone}</p>
                    </div>
                    ` : ''}
                    ${companyName ? `
                    <div class="info-item">
                      <p class="info-label">Company</p>
                      <p class="info-value">${companyName}</p>
                    </div>
                    ` : ''}
                    ${additionalInfo ? `
                    <div class="info-item">
                      <p class="info-label">Additional Notes</p>
                      <p class="info-value">${additionalInfo}</p>
                    </div>
                    ` : ''}
                  </div>
                </div>

                <div class="section" style="background: linear-gradient(135deg, rgba(10, 132, 255, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%);">
                  <h3 class="section-title">Prepare for Your Consultation</h3>
                  <div class="section-content" style="text-align: center;">
                    <p style="color: #4B5563; margin-bottom: 20px; font-size: 16px;">
                      <strong>Get the most out of our upcoming meeting!</strong>
                    </p>
                    <p style="color: #4B5563; margin-bottom: 25px;">
                      Take 2 minutes to calculate your potential ROI and come prepared with questions about how we can help you achieve these numbers.
                    </p>
                    <div style="background: #F9FAFB; padding: 20px; border-radius: 8px; margin-bottom: 25px; text-align: left;">
                      <p style="color: #1F2937; font-weight: 600; margin-bottom: 10px;">What You'll Learn:</p>
                      <ul style="list-style: none; padding: 0;">
                        <li style="margin-bottom: 8px; color: #4B5563;">💡 Your potential monthly revenue increase</li>
                        <li style="margin-bottom: 8px; color: #4B5563;">⏱️ Hours saved through automation</li>
                        <li style="color: #4B5563;">📊 Expected ROI timeline</li>
                      </ul>
                    </div>
                    <div class="button-container">
                      <a href="https://topedgeai.com/roi" class="button">Calculate Your ROI Now →</a>
                      <a href="https://topedgeai.com/roi#case-studies" class="button-secondary">View Success Stories</a>
                    </div>
                  </div>
                </div>

                <div style="text-align: center; margin: 30px 0;">
                  <p style="color: #1F2937; font-size: 18px; margin-bottom: 15px;">
                    Need to make changes?
                  </p>
                  <p style="color: #4B5563;">
                    Contact us at <a href="mailto:team@topedgeai.com" style="color: #0A84FF; text-decoration: none;">team@topedgeai.com</a>
                  </p>
                </div>

                <div class="footer">
                  <p style="margin-bottom: 10px;">Looking forward to meeting with you!</p>
                  <p>© 2024 TopEdge AI. All rights reserved.</p>
                </div>
              </div>
            </div>
          </body>
        </html>
      `
    });

    res.status(200).json({ message: 'Booking confirmation sent successfully' });
  } catch (error) {
    console.error('Error sending booking confirmation:', error);
    res.status(500).json({ message: 'Failed to send booking confirmation', error: error.message });
  }
});

// Booking - Admin Email
app.post('/api/send-admin-email', async (req, res) => {
  try {
    const { name, email, phone, companyName, date, time, additionalInfo } = req.body;

    await sendEmail({
      from: process.env.EMAIL_USER,
      to: 'acctopedge@gmail.com',
      subject: `New Consultation Booking: ${name}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>New Booking - TopEdge</title>
            <style>
              * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
              }
              body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                background-color: #f4f4f4;
                width: 100%;
              }
              .container {
                width: 100%;
                background-color: #fff;
                border-radius: 16px;
                overflow: hidden;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
              }
              .header {
                text-align: center;
                padding: 40px 0;
                background: linear-gradient(135deg, #0A84FF 0%, #3B82F6 100%);
                color: white;
              }
              .content {
                padding: 40px 20px;
                background: #fff;
              }
              .section {
                background-color: #F9FAFB;
                margin-bottom: 30px;
                padding: 25px 20px;
                border-radius: 12px;
              }
              .section-title {
                color: #0A84FF;
                font-size: 20px;
                margin-bottom: 15px;
                font-weight: 600;
              }
              .section-content {
                background-color: #fff;
                padding: 20px;
                border: 1px solid #E5E7EB;
                border-radius: 8px;
              }
              .info-item {
                margin-bottom: 15px;
              }
              .info-label {
                color: #6B7280;
                font-size: 14px;
                margin-bottom: 5px;
              }
              .info-value {
                color: #1F2937;
                font-size: 16px;
                font-weight: 500;
              }
              .highlight-box {
                background: linear-gradient(135deg, rgba(220, 38, 38, 0.1) 0%, rgba(252, 165, 165, 0.1) 100%);
                border-radius: 12px;
                padding: 20px;
                margin: 30px 0;
              }
              .footer {
                text-align: center;
                color: #6B7280;
                font-size: 14px;
                padding: 20px;
                border-top: 1px solid #E5E7EB;
              }
              @media screen and (min-width: 600px) {
                .container {
                  max-width: 600px;
                  margin: 0 auto;
                }
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0; font-size: 28px; font-weight: 700;">TopEdge AI</h1>
                <p style="margin-top: 10px; font-size: 18px;">New Consultation Booking</p>
              </div>
              
              <div class="content">
                <div class="highlight-box">
                  <h3 style="color: #DC2626; font-size: 18px; margin-bottom: 10px;">New Booking Alert</h3>
                  <p style="color: #1F2937; font-size: 20px; font-weight: 600;">
                    ${date}
                  </p>
                </div>

                <div class="section">
                  <h3 class="section-title">Client Information</h3>
                  <div class="section-content">
                    <div class="info-item">
                      <p class="info-label">Name</p>
                      <p class="info-value">${name}</p>
                    </div>
                    <div class="info-item">
                      <p class="info-label">Email</p>
                      <p class="info-value">
                        <a href="mailto:${email}" style="color: #0A84FF; text-decoration: none;">${email}</a>
                      </p>
                    </div>
                    ${phone ? `
                    <div class="info-item">
                      <p class="info-label">Phone</p>
                      <p class="info-value">
                        <a href="tel:${phone}" style="color: #0A84FF; text-decoration: none;">${phone}</a>
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
                    <div class="info-item">
                      <p class="info-label">Additional Notes</p>
                      <p class="info-value">${additionalInfo}</p>
                    </div>
                    ` : ''}
                  </div>
                </div>

                <div class="section" style="background-color: #FEF2F2;">
                  <h3 class="section-title" style="color: #DC2626;">Required Actions</h3>
                  <div class="section-content" style="border-color: #FCA5A5;">
                    <p style="color: #4B5563;">Please complete the following tasks:</p>
                    <ol style="margin: 15px 0 0 20px; color: #4B5563;">
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
    console.error('Error sending admin notification:', error);
    res.status(500).json({ message: 'Failed to send admin notification', error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK',
    message: 'Email server is running',
    emailConfigured: !!process.env.EMAIL_USER
  });
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

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  console.log(`Email server configured with: ${process.env.EMAIL_USER}`);
}); 
