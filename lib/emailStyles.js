
export const commonEmailStyles = `
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
body {
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  line-height: 1.6;
  color: #E2E8F0;
  background-color: #020617; /* Slate 950 */
  width: 100%;
  -webkit-font-smoothing: antialiased;
}
.container {
  width: 100%;
  max-width: 600px;
  margin: 40px auto;
  background-color: #0F172A; /* Slate 900 */
  overflow: hidden;
  border-radius: 24px;
  border: 1px solid #1E293B;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}
.header {
  text-align: center;
  padding: 48px 0 32px;
  background: radial-gradient(circle at center, #1E293B 0%, #0F172A 100%);
  color: #F8FAFC;
  border-bottom: 1px solid #1E293B;
}
.logo-text {
  font-size: 32px;
  font-weight: 800;
  background: linear-gradient(135deg, #818CF8 0%, #C084FC 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  display: inline-block;
  letter-spacing: -0.02em;
}
.header-subtitle {
  margin-top: 12px;
  font-size: 16px;
  color: #94A3B8;
  font-weight: 500;
  letter-spacing: 0.02em;
}
.content {
  padding: 0;
  background: #0F172A;
}
.section {
  padding: 40px;
}
.section-title {
  color: #F8FAFC;
  font-size: 22px;
  margin-bottom: 20px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.text-regular {
  color: #E2E8F0;
  font-size: 16px;
  line-height: 1.8;
  margin-bottom: 24px;
}
.text-muted {
  color: #94A3B8;
  font-size: 14px;
  line-height: 1.6;
}
.premium-box {
  background: #1E293B;
  border: 1px solid #334155;
  border-radius: 16px;
  padding: 32px;
  margin: 32px 0;
  text-align: center;
}
.otp-box {
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(129, 140, 248, 0.2);
  border-radius: 16px;
  padding: 40px;
  text-align: center;
  margin: 32px 0;
  box-shadow: 0 0 40px rgba(129, 140, 248, 0.05);
}
.otp-code {
  font-family: 'Courier New', monospace;
  font-size: 42px;
  font-weight: 800;
  letter-spacing: 12px;
  color: #818CF8;
  display: block;
  text-shadow: 0 0 20px rgba(129, 140, 248, 0.3);
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin: 20px 0;
}
.stat-item {
  background: #1E293B;
  padding: 24px;
  border-radius: 16px;
  border: 1px solid #334155;
  text-align: center;
}
.stat-number {
  font-size: 28px;
  font-weight: 700;
  color: #818CF8;
  margin-bottom: 8px;
}
.stat-label {
  color: #94A3B8;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 600;
}
.button {
  display: inline-block;
  padding: 18px 48px;
  background: linear-gradient(135deg, #6366F1 0%, #A855F7 100%);
  color: white !important;
  text-decoration: none;
  border-radius: 12px;
  font-weight: 600;
  font-size: 16px;
  margin: 24px 0;
  text-align: center;
  transition: all 0.3s ease;
  box-shadow: 0 8px 20px rgba(99, 102, 241, 0.25);
  border: 1px solid rgba(255,255,255,0.1);
}
.button:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 24px rgba(99, 102, 241, 0.35);
}
.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin: 24px 0;
}
.info-item {
  background: #1E293B;
  padding: 24px;
  border-radius: 16px;
  border: 1px solid #334155;
}
.info-label {
  color: #94A3B8;
  font-size: 12px;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}
.info-value {
  color: #F8FAFC;
  font-size: 16px;
  font-weight: 500;
}
.divider {
  height: 1px;
  background: #334155;
  margin: 32px 0;
}
.footer {
  text-align: center;
  color: #64748B;
  font-size: 14px;
  padding: 40px;
  background: #020617;
  border-top: 1px solid #1E293B;
}
.footer p {
  margin-bottom: 8px;
}
.footer a {
  color: #818CF8;
  text-decoration: none;
}
@media screen and (max-width: 600px) {
  .container {
    width: 100%;
    margin: 0;
    border-radius: 0;
    border: none;
  }
  .section {
    padding: 32px 24px;
  }
  .otp-code {
    font-size: 32px;
    letter-spacing: 8px;
  }
}
`;
