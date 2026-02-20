
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
    background-color: #f8fafc;
    color: #0f172a;
    line-height: 1.6;
    width: 100%;
    height: 100%;
  }

  /* Layout */
  .wrapper {
    width: 100%;
    table-layout: fixed;
    background-color: #f3f4f6;
    padding-bottom: 0;
  }

  .container {
    margin: 0 auto;
    width: 100%;
    max-width: 600px;
    background-color: #ffffff;
    border-radius: 24px;
    overflow: hidden;
    border: 1px solid #e2e8f0;
    box-shadow: 0 20px 40px rgba(15, 23, 42, 0.12);
    margin-top: 20px;
    margin-bottom: 20px;
  }

  /* Header */
  .header {
    text-align: center;
    padding: 24px 24px 16px;
    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 45%, #0f172a 100%);
    border-bottom: 1px solid rgba(148, 163, 184, 0.12);
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
    color: #e5e7eb;
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  /* Content */
  .content {
    background-color: #ffffff;
  }

  .section {
    padding: 24px;
  }

  .section-title {
    color: #0f172a;
    font-size: 24px;
    font-weight: 700;
    margin-bottom: 16px;
    letter-spacing: -0.01em;
    line-height: 1.3;
  }

  .text-regular {
    color: #334155;
    font-size: 16px;
    line-height: 1.7;
    margin-bottom: 24px;
  }

  .text-muted {
    color: #6b7280;
    font-size: 14px;
    line-height: 1.6;
  }

  /* Components */
  .premium-box {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    padding: 32px 24px;
    margin: 32px 0;
    text-align: center;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  }

  .otp-box {
    background: #eef2ff;
    border: 1px solid rgba(79, 70, 229, 0.3);
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
    color: #4f46e5;
    display: block;
    text-shadow: 0 0 30px rgba(129, 140, 248, 0.4);
    margin-left: 16px; /* Offset for letter-spacing */
  }

  .button {
    display: inline-block;
    padding: 16px 40px;
    background: linear-gradient(90deg, #4f46e5 0%, #6366f1 50%, #0f172a 100%);
    color: #ffffff !important;
    text-decoration: none;
    border-radius: 50px; /* Pill shape */
    font-weight: 600;
    font-size: 16px;
    margin: 24px 0;
    text-align: center;
    transition: all 0.3s ease;
    box-shadow: 0 10px 25px -8px rgba(15, 23, 42, 0.35);
    border: 1px solid rgba(15, 23, 42, 0.06);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .button:hover {
    transform: translateY(-2px);
    box-shadow: 0 18px 30px -12px rgba(15, 23, 42, 0.45);
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
    background: #f1f5f9;
    padding: 24px;
    border-radius: 16px;
    border: 1px solid #e2e8f0;
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
    background: #f1f5f9;
    padding: 24px 12px;
    border-radius: 16px;
    border: 1px solid #e2e8f0;
    text-align: center;
    vertical-align: top;
    box-sizing: border-box;
  }
  
  .alert-box {
    background: #eef2ff;
    border: 1px solid rgba(79, 70, 229, 0.25);
    border-radius: 16px;
    padding: 24px;
    margin: 24px 0;
    text-align: center;
  }
  
  .list-box {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    padding: 32px;
    margin: 24px 0;
    text-align: left;
  }

  .stat-number {
    font-size: 24px;
    font-weight: 700;
    color: #4f46e5;
    margin-bottom: 4px;
  }

  .stat-label {
    color: #6b7280;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
  }

  .info-label {
    color: #6b7280;
    font-size: 11px;
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
  }

  .info-value {
    color: #0f172a;
    font-size: 15px;
    font-weight: 500;
    word-break: break-word;
  }

  /* Footer */
  .footer {
    text-align: center;
    padding: 40px;
    background-color: #f3f4f6;
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
