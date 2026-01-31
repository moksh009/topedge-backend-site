
export const commonEmailStyles = `
  /* Reset & Base */
  body, table, td, div, p, a {
    -webkit-text-size-adjust: 100%;
    -ms-text-size-adjust: 100%;
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  }
  
  body {
    background-color: #020617; /* Slate 950 */
    color: #CBD5E1; /* Slate 300 */
    line-height: 1.6;
    width: 100%;
    height: 100%;
  }

  /* Layout */
  .wrapper {
    width: 100%;
    table-layout: fixed;
    background-color: #020617;
    padding-bottom: 40px;
  }

  .container {
    margin: 0 auto;
    width: 100%;
    max-width: 600px;
    background-color: #0F172A; /* Slate 900 */
    border-radius: 24px;
    overflow: hidden;
    border: 1px solid rgba(148, 163, 184, 0.1); /* Subtle border */
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    margin-top: 40px;
    margin-bottom: 40px;
  }

  /* Header */
  .header {
    text-align: center;
    padding: 48px 24px 32px;
    background: linear-gradient(180deg, #1E293B 0%, #0F172A 100%);
    border-bottom: 1px solid rgba(148, 163, 184, 0.05);
  }

  .logo-text {
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -0.02em;
    background: linear-gradient(135deg, #818CF8 0%, #C084FC 50%, #E879F9 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    display: inline-block;
    margin-bottom: 8px;
    text-transform: uppercase;
  }

  .header-subtitle {
    color: #94A3B8; /* Slate 400 */
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  /* Content */
  .content {
    background-color: #0F172A;
  }

  .section {
    padding: 40px;
  }

  .section-title {
    color: #F8FAFC; /* Slate 50 */
    font-size: 24px;
    font-weight: 700;
    margin-bottom: 16px;
    letter-spacing: -0.01em;
    line-height: 1.3;
  }

  .text-regular {
    color: #CBD5E1; /* Slate 300 */
    font-size: 16px;
    line-height: 1.7;
    margin-bottom: 24px;
  }

  .text-muted {
    color: #64748B; /* Slate 500 */
    font-size: 14px;
    line-height: 1.6;
  }

  /* Components */
  .premium-box {
    background: linear-gradient(145deg, #1E293B 0%, #0F172A 100%);
    border: 1px solid rgba(129, 140, 248, 0.15);
    border-radius: 16px;
    padding: 32px 24px;
    margin: 32px 0;
    text-align: center;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  }

  .otp-box {
    background: rgba(30, 41, 59, 0.4);
    border: 1px solid rgba(129, 140, 248, 0.3);
    border-radius: 20px;
    padding: 40px;
    text-align: center;
    margin: 32px 0;
    box-shadow: 0 0 40px rgba(129, 140, 248, 0.1);
    position: relative;
    overflow: hidden;
  }
  
  .otp-box::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(129, 140, 248, 0.5), transparent);
  }

  .otp-code {
    font-family: 'Courier New', monospace;
    font-size: 48px;
    font-weight: 800;
    letter-spacing: 16px;
    color: #818CF8;
    display: block;
    text-shadow: 0 0 30px rgba(129, 140, 248, 0.4);
    margin-left: 16px; /* Offset for letter-spacing */
  }

  .button {
    display: inline-block;
    padding: 16px 40px;
    background: linear-gradient(90deg, #4F46E5 0%, #7C3AED 50%, #DB2777 100%);
    color: #FFFFFF !important;
    text-decoration: none;
    border-radius: 50px; /* Pill shape */
    font-weight: 600;
    font-size: 16px;
    margin: 24px 0;
    text-align: center;
    transition: all 0.3s ease;
    box-shadow: 0 10px 25px -5px rgba(124, 58, 237, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.1);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .button:hover {
    transform: translateY(-2px);
    box-shadow: 0 20px 30px -10px rgba(124, 58, 237, 0.5);
  }

  /* Grids */
  .info-grid {
    text-align: center;
    margin: 24px 0;
    font-size: 0; /* Remove spacing between inline-blocks */
  }

  .info-item {
    display: inline-block;
    width: 46%;
    margin: 0 2% 16px 2%;
    background: #1E293B;
    padding: 24px;
    border-radius: 16px;
    border: 1px solid rgba(51, 65, 85, 0.5);
    vertical-align: top;
    text-align: left;
    box-sizing: border-box;
  }

  .stats-grid {
    text-align: center;
    margin: 24px 0;
    font-size: 0;
  }

  .stat-item {
    display: inline-block;
    width: 30%;
    margin: 0 1.5%;
    background: #1E293B;
    padding: 24px 12px;
    border-radius: 16px;
    border: 1px solid rgba(51, 65, 85, 0.5);
    text-align: center;
    vertical-align: top;
    box-sizing: border-box;
  }
  
  .alert-box {
    background: rgba(99, 102, 241, 0.1);
    border: 1px solid rgba(99, 102, 241, 0.2);
    border-radius: 16px;
    padding: 24px;
    margin: 24px 0;
    text-align: center;
  }
  
  .list-box {
    background: rgba(30, 41, 59, 0.3);
    border: 1px solid rgba(51, 65, 85, 0.5);
    border-radius: 16px;
    padding: 32px;
    margin: 24px 0;
    text-align: left;
  }

  .stat-number {
    font-size: 24px;
    font-weight: 700;
    color: #A78BFA;
    margin-bottom: 4px;
  }

  .stat-label {
    color: #94A3B8;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
  }

  .info-label {
    color: #94A3B8;
    font-size: 11px;
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
  }

  .info-value {
    color: #F8FAFC;
    font-size: 15px;
    font-weight: 500;
    word-break: break-word;
  }

  /* Footer */
  .footer {
    text-align: center;
    padding: 40px;
    background-color: #020617;
    color: #64748B;
    font-size: 13px;
    border-top: 1px solid #1E293B;
  }

  .footer p {
    margin-bottom: 12px;
  }

  .footer a {
    color: #818CF8;
    text-decoration: none;
    transition: color 0.2s;
  }

  .social-links {
    margin-top: 20px;
  }
  
  .social-links a {
    margin: 0 10px;
    font-size: 18px;
    text-decoration: none;
  }

  /* Helpers */
  .text-center {
    text-align: center;
  }
  
  .mt-24 {
    margin-top: 24px;
  }

  .subtitle {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 12px;
    color: #F8FAFC;
  }

  .premium-list {
    color: #E2E8F0;
    padding-left: 20px;
    text-align: left;
    margin: 0;
  }
  
  .premium-list li {
    margin-bottom: 8px;
  }
  
  .premium-list li:last-child {
    margin-bottom: 0;
  }

  /* Mobile Responsive */
  @media screen and (max-width: 600px) {
    .container {
      width: 100% !important;
      margin: 0 auto !important;
      border-radius: 0 !important;
      border: none !important;
      box-shadow: none !important;
    }

    .section {
      padding: 32px 20px !important;
    }
    
    .header {
      padding: 40px 20px 24px !important;
    }

    .logo-text {
      font-size: 24px !important;
    }

    .otp-code {
      font-size: 32px !important;
      letter-spacing: 8px !important;
      margin-left: 8px !important;
    }

    .button {
      display: block !important;
      width: 100% !important;
      padding: 18px 0 !important;
      margin: 24px 0 !important;
    }

    .info-item, .stat-item {
      display: block !important;
      width: 100% !important;
      margin: 0 0 16px 0 !important;
      padding: 24px !important;
    }
  }
`;
