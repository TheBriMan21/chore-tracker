// Weekly chore report, emailed to every parent on the family list.
// Runs from GitHub Actions (see .github/workflows/weekly-report.yml).
//
// Env:
//   FIREBASE_SERVICE_ACCOUNT  service account JSON (Firebase → Project settings → Service accounts)
//   GMAIL_USER                Gmail address that sends the report
//   GMAIL_APP_PASSWORD        16-character Google app password for that address
//   TIMEZONE                  default America/New_York
//   SCHEDULE                  the cron that fired (github.event.schedule); empty = manual run, always sends
//   DRY_RUN=1                 write report.html instead of sending
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';
import fs from 'fs';

const TZ = process.env.TIMEZONE || 'America/New_York';
const SEND_HOUR = 15; // 3 PM local
const HOUSEHOLD = 'home';
const APP_URL = 'https://thebriman21.github.io/chore-tracker/';

// ---- time helpers (all in the household's timezone) ----
const partsIn = (date, opts) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...opts }).formatToParts(date).map(p => [p.type, p.value]));
const localISO = date => { const p = partsIn(date, { year: 'numeric', month: '2-digit', day: '2-digit' }); return `${p.year}-${p.month}-${p.day}`; };
const utcOffsetHours = date => { const p = partsIn(date, { hour: 'numeric', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', minute: 'numeric' });
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute); return Math.round((asUTC - date.getTime()) / 36e5); };
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dayName = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
const prettyDate = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// GitHub cron is UTC, so the workflow fires at both 19:00 and 20:00 UTC on Sundays.
// Only the one that is 3 PM local (EDT → 19, EST → 20) goes ahead, even if GitHub starts it late.
export function shouldSend(schedule, now = new Date()) {
  if (!schedule) return true;
  const targetUTCHour = SEND_HOUR - utcOffsetHours(now);
  return schedule.trim().startsWith(`0 ${targetUTCHour} `);
}

export function buildReport(data, now = new Date()) {
  const todayISO = localISO(now);
  const days = Array.from({ length: 7 }, (_, i) => addDays(todayISO, i - 6)); // last 7 days, ending today
  const inWeek = new Set(days);
  const log = (data.log || []).filter(l => inWeek.has(l.date));
  const chores = data.chores || [];
  const doneOn = c => new Set(log.filter(l => l.id ? l.id === c.id : l.chore === c.name).map(l => l.date));

  let doneCount = 0, expected = 0;
  const daily = chores.filter(c => +c.every === 1), other = chores.filter(c => +c.every !== 1);
  const dailyRows = daily.map(c => { const s = doneOn(c); doneCount += s.size; expected += 7; return { c, s }; });
  const otherRows = other.map(c => { const s = doneOn(c); const exp = Math.max(1, Math.round(7 / (+c.every || 7)));
    doneCount += Math.min(s.size, exp); expected += exp; return { c, s, exp }; });
  const allDoneDays = days.filter(d => daily.length && daily.every(c => doneOn(c).has(d))).length;
  const pct = expected ? Math.round(100 * doneCount / expected) : 0;
  const kid = (data.people || []).length === 1 ? data.people[0] : 'the kids';
  const headline = pct >= 90 ? `Amazing week for ${kid}! 🏆` : pct >= 70 ? `Solid week for ${kid} 🌟` : pct >= 40 ? `Some good effort from ${kid} 👍` : `A tough week for chores 💪`;
  const range = `${prettyDate(days[0])} – ${prettyDate(days[6])}`;

  const pink = '#d94a8c', blue = '#7cc4f2', ink = '#3a2a44', muted = '#7a6a85';
  const cell = ok => `<td style="text-align:center;padding:6px 4px;font-size:16px">${ok ? '✅' : '<span style="color:#d8c6d3">○</span>'}</td>`;
  const th = `<th style="text-align:left;padding:6px 8px;color:${muted};font-weight:600;font-size:12px">Chore</th>` + days.map(d => `<th style="padding:6px 4px;color:${muted};font-weight:600;font-size:12px">${dayName(d)}</th>`).join('');
  const dailyTable = dailyRows.length ? `
    <h3 style="margin:22px 0 6px;color:${ink};font-size:16px">Daily chores</h3>
    <table style="border-collapse:collapse;width:100%;background:#fff;border-radius:12px">
      <tr>${th}<th style="padding:6px 8px;color:${muted};font-size:12px">Done</th></tr>
      ${dailyRows.map(({ c, s }) => `<tr style="border-top:1px solid #f6d3e4"><td style="padding:6px 8px;color:${ink};font-size:14px">${esc(c.name)}</td>${days.map(d => cell(s.has(d))).join('')}<td style="text-align:center;font-weight:700;color:${s.size === 7 ? pink : ink}">${s.size}/7</td></tr>`).join('')}
    </table>` : '';
  const otherList = otherRows.length ? `
    <h3 style="margin:22px 0 6px;color:${ink};font-size:16px">Other chores</h3>
    ${otherRows.map(({ c, s, exp }) => `<div style="background:#fff;border-radius:12px;padding:10px 12px;margin-bottom:6px;color:${ink};font-size:14px">${s.size >= exp ? '✅' : '⚠️'} <b>${esc(c.name)}</b> <span style="color:${muted}">· ${s.size ? 'done ' + [...s].sort().map(dayName).join(', ') : 'not done this week'}</span></div>`).join('')}` : '';

  const html = `<!doctype html><html><body style="margin:0;background:#fdf3f8;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px">
    <div style="background:linear-gradient(135deg,#ffd6e8,#d6ecff);border-radius:20px;padding:22px;text-align:center">
      <div style="font-size:13px;color:${muted}">Weekly chore report · ${range}</div>
      <div style="font-size:24px;font-weight:800;color:${ink};margin:6px 0">${esc(headline)}</div>
      <div style="display:inline-block;margin-top:8px">
        <span style="display:inline-block;background:#fff;border-radius:14px;padding:10px 16px;margin:4px"><b style="font-size:22px;color:${pink}">${pct}%</b><br><span style="font-size:12px;color:${muted}">chores done</span></span>
        <span style="display:inline-block;background:#fff;border-radius:14px;padding:10px 16px;margin:4px"><b style="font-size:22px;color:#1f6fa8">${allDoneDays}/7</b><br><span style="font-size:12px;color:${muted}">all-done days</span></span>
        <span style="display:inline-block;background:#fff;border-radius:14px;padding:10px 16px;margin:4px"><b style="font-size:22px;color:${ink}">${log.length}</b><br><span style="font-size:12px;color:${muted}">check-offs</span></span>
      </div>
    </div>
    ${dailyTable}${otherList}
    <p style="color:${muted};font-size:12px;margin-top:22px;text-align:center">Today counts through the time this was sent. <a href="${APP_URL}" style="color:${pink}">Open the chore tracker</a></p>
  </div></body></html>`;
  const text = `${headline}\n${range}: ${pct}% of chores done, ${allDoneDays}/7 all-done days, ${log.length} check-offs.\n\n` +
    dailyRows.map(({ c, s }) => `${c.name}: ${s.size}/7`).concat(otherRows.map(({ c, s }) => `${c.name}: ${s.size ? 'done ' + [...s].sort().map(dayName).join(', ') : 'not done'}`)).join('\n') + `\n\n${APP_URL}`;
  return { subject: `Chore report: ${pct}% done this week (${range})`, html, text, pct };
}

async function main() {
  if (!shouldSend(process.env.SCHEDULE)) { console.log('Not 3 PM local for this trigger; skipping.'); return; }
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  initializeApp(sa.project_id ? { credential: cert(sa) } : { projectId: process.env.GCLOUD_PROJECT || 'demo-chores' });
  const db = getFirestore();
  const [home, roles] = await Promise.all([db.doc(`households/${HOUSEHOLD}`).get(), db.doc('access/roles').get()]);
  if (!home.exists) throw new Error('households/home not found');
  const parents = (roles.exists ? roles.data().parents : []) || [];
  if (!parents.length) throw new Error('No parents on the family list');
  const report = buildReport(home.data());
  if (process.env.DRY_RUN) {
    fs.writeFileSync('report.html', report.html);
    console.log(`Dry run: wrote report.html for ${parents.length} parent(s). Subject: ${report.subject}`);
    return;
  }
  const mail = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
  await mail.sendMail({ from: `"Chore Tracker" <${process.env.GMAIL_USER}>`, to: parents.join(', '), subject: report.subject, html: report.html, text: report.text });
  console.log(`Sent the weekly report to ${parents.length} parent(s).`); // no addresses: Actions logs are public
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e.message); process.exit(1); });
