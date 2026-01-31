
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
  background-color: #0F172A; /* Slate 900 */
  width: 100%;
  -webkit-font-smoothing: antialiased;
}
.container {
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
  background-color: #1E293B; /* Slate 800 */
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid #334155;
}
.header {
  text-align: center;
  padding: 48px 0 32px;
  background: #1E293B;
  color: #F8FAFC;
}
.logo-text {
  font-size: 28px;
  font-weight: 800;
  background: linear-gradient(135deg, #818CF8 0%, #C084FC 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  display: inline-block;
}
.header-subtitle {
  margin-top: 8px;
  font-size: 16px;
  color: #94A3B8;
  font-weight: 500;
  letter-spacing: 0.02em;
}
.content {
  padding: 0;
  background: #1E293B;
}
.section {
  margin-bottom: 24px;
  padding: 24px 32px;
}
.section-title {
  color: #F8FAFC;
  font-size: 20px;
  margin-bottom: 16px;
  font-weight: 700;
}
.text-muted {
  color: #CBD5E1;
  font-size: 16px;
  line-height: 1.7;
}
.premium-box {
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid #475569;
  border-radius: 12px;
  padding: 24px;
  margin: 24px 0;
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin: 20px 0;
}
.stat-item {
  background: #0F172A;
  padding: 20px;
  border-radius: 8px;
  border: 1px solid #334155;
  text-align: center;
}
.stat-number {
  font-size: 24px;
  font-weight: 700;
  color: #818CF8; /* Indigo 400 */
  margin-bottom: 8px;
}
.stat-label {
  color: #94A3B8;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.button {
  display: inline-block;
  padding: 16px 36px;
  background: linear-gradient(135deg, #6366F1 0%, #A855F7 100%); /* Indigo to Purple */
  color: white !important;
  text-decoration: none;
  border-radius: 12px;
  font-weight: 600;
  margin: 16px 0;
  text-align: center;
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
  border: 1px solid rgba(255,255,255,0.1);
}
.button:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 16px rgba(99, 102, 241, 0.4);
}
.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin: 20px 0;
}
.info-item {
  background: #0F172A;
  padding: 20px;
  border-radius: 12px;
  border: 1px solid #334155;
}
.info-label {
  color: #94A3B8;
  font-size: 12px;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.info-value {
  color: #F8FAFC;
  font-size: 15px;
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
  font-size: 13px;
  padding: 32px;
  background: #0F172A;
  border-top: 1px solid #334155;
}
.footer a {
  color: #94A3B8;
  text-decoration: none;
}
@media screen and (max-width: 600px) {
  .container {
    width: 100%;
    border-radius: 0;
    border: none;
  }
  .section {
    padding: 24px 20px;
  }
}
`;
