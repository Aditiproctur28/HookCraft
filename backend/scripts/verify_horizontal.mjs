// Verify the horizontal-framing fix: regenerate ONE 16:9 video against the
// edited backend, then report the generated scene-image dimensions (should be
// true landscape 896x512 from HuggingFace, not 1024x1024 square from Cloudflare).
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const BASE = process.env.QA_BASE || 'http://localhost:3010';
const OUT = path.resolve('d:/HookCraft/qa_examples');
fs.mkdirSync(OUT, { recursive: true });

const CFG = { topic: 'How the Eiffel Tower was built', aspectRatio: '16:9', captionStyle: 'word', imageMode: 'dynamic', scriptMode: 'auto', language: 'en' };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function postJSON(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  let j; try { j = JSON.parse(await r.text()); } catch { j = {}; }
  return { ok: r.ok, body: j };
}
async function stream(jobId, onUpdate, signal) {
  const res = await fetch(`${BASE}/api/video/progress/${jobId}`, { signal });
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true }); let i;
    while ((i = buf.indexOf('\n\n')) !== -1) { const c = buf.slice(0, i); buf = buf.slice(i + 2);
      for (const ln of c.split('\n')) if (ln.startsWith('data:')) { try { onUpdate(JSON.parse(ln.slice(5).trim())); } catch {} } }
  }
}

const start = Date.now();
log('starting landscape regen against', BASE);
const { ok, body } = await postJSON(`${BASE}/api/video/generate`, CFG);
if (!ok || !body.jobId) { log('generate failed', body); process.exit(1); }
const jobId = body.jobId; log('job', jobId);

const ac = new AbortController();
const timer = setTimeout(() => ac.abort(), 9 * 60 * 1000);
let approved = false, final = null, lastStage = '';
try {
  await stream(jobId, (u) => {
    if (u.stage && u.stage !== lastStage) { lastStage = u.stage; log(`[${u.pct ?? '?'}%] ${u.stage} — ${u.message || ''}`); }
    if (u.status === 'awaiting_approval' && !approved) { approved = true; log('approving…'); postJSON(`${BASE}/api/video/${jobId}/approve`).catch(() => {}); }
    if (u.status === 'done' || u.status === 'error') final = u;
  }, ac.signal);
} finally { clearTimeout(timer); }

if (!final || final.status === 'error') { log('FAILED', final?.message); process.exit(1); }

// Save the MP4.
const r = await fetch(final.downloadUrl);
const out = path.join(OUT, '4b_format_landscape_FIXED.mp4');
fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
log(`done in ${Math.round((Date.now() - start) / 1000)}s → ${out} (${Math.round(fs.statSync(out).size / 1024)}KB, ${final.scenes?.length} scenes)`);

// Probe generated scene-image dimensions via PowerShell + System.Drawing.
const imgDir = path.resolve(`d:/HookCraft/backend/jobs/${jobId}/images`);
log('scene image dimensions in', imgDir);
const ps = `Add-Type -AssemblyName System.Drawing; Get-ChildItem '${imgDir}' -Filter *.jpeg | ForEach-Object { $i=[System.Drawing.Image]::FromFile($_.FullName); '{0,-16} {1}x{2}' -f $_.Name,$i.Width,$i.Height; $i.Dispose() }`;
try { console.log(execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' })); } catch (e) { log('probe failed', e.message); }
