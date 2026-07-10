// QA driver: exercises every UI feature case end-to-end against the live
// /api/video pipeline, auto-approves the character step, and saves one MP4 per
// case into d:/HookCraft/qa_examples/. Run: node scripts/qa_examples.mjs
import fs from 'fs';
import path from 'path';

const BASE = process.env.QA_BASE || 'http://localhost:3002';
const OUT_DIR = path.resolve('d:/HookCraft/qa_examples');
const JOB_TIMEOUT_MS = 8 * 60 * 1000; // 8 min hard cap per case
fs.mkdirSync(OUT_DIR, { recursive: true });

const VERBATIM_SCRIPT =
  'Listen closely. Trust is not given, it is earned. ' +
  'Say what you mean, and mean what you say. ' +
  'Do that every single day, and people will follow you anywhere.';

const cases = [
  { name: '1_baseline',        topic: 'Why drinking water first thing in the morning boosts your energy', scriptMode: 'auto',     language: 'en', aspectRatio: '9:16', captionStyle: 'word',     imageMode: 'dynamic' },
  { name: '2_script_verbatim', topic: VERBATIM_SCRIPT,                                                    scriptMode: 'verbatim', language: 'en', aspectRatio: '9:16', captionStyle: 'word',     imageMode: 'dynamic' },
  { name: '3_language_hindi',  topic: 'Three quick tips to wake up early and feel fresh',                 scriptMode: 'auto',     language: 'hi', aspectRatio: '9:16', captionStyle: 'word',     imageMode: 'dynamic' },
  { name: '4_format_landscape',topic: 'How the Eiffel Tower was built',                                   scriptMode: 'auto',     language: 'en', aspectRatio: '16:9', captionStyle: 'word',     imageMode: 'dynamic' },
  { name: '5_captions_sentence',topic: 'A single coach explains why discipline beats motivation',         scriptMode: 'auto',     language: 'en', aspectRatio: '9:16', captionStyle: 'sentence', imageMode: 'dynamic' },
  { name: '6_imagery_static',  topic: 'A single barista shares one secret to better coffee at home',      scriptMode: 'auto',     language: 'en', aspectRatio: '9:16', captionStyle: 'word',     imageMode: 'static'  },
  { name: '7_imagery_narrator',topic: 'The hidden history of the Great Wall of China',                    scriptMode: 'auto',     language: 'en', aspectRatio: '9:16', captionStyle: 'word',     imageMode: 'narrator'},
];

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function postJSON(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  return { ok: r.ok, status: r.status, body: j };
}

// Consume the SSE progress stream, invoking onUpdate(parsedJson) for each event.
async function streamProgress(jobId, onUpdate, signal) {
  const res = await fetch(`${BASE}/api/video/progress/${jobId}`, { signal });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data:')) {
          try { onUpdate(JSON.parse(line.slice(5).trim())); } catch {}
        }
      }
    }
  }
}

async function runCase(c) {
  log(`▶ ${c.name}: starting (${c.scriptMode}/${c.language}/${c.aspectRatio}/${c.captionStyle}/${c.imageMode})`);
  const start = Date.now();
  const { ok, body } = await postJSON(`${BASE}/api/video/generate`, {
    topic: c.topic, aspectRatio: c.aspectRatio, captionStyle: c.captionStyle,
    imageMode: c.imageMode, scriptMode: c.scriptMode, language: c.language,
  });
  if (!ok || !body.jobId) return { ...c, result: 'FAIL', error: `generate failed: ${JSON.stringify(body)}` };
  const jobId = body.jobId;
  log(`  job ${jobId}`);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), JOB_TIMEOUT_MS);
  let approved = false, final = null, lastStage = '';
  try {
    await streamProgress(jobId, (u) => {
      if (u.stage && u.stage !== lastStage) { lastStage = u.stage; log(`    [${u.pct ?? '?'}%] ${u.stage} — ${u.message || ''}`); }
      if (u.status === 'awaiting_approval' && !approved) {
        approved = true;
        log('    auto-approving character…');
        postJSON(`${BASE}/api/video/${jobId}/approve`).catch(() => {});
      }
      if (u.status === 'done' || u.status === 'error') final = u;
    }, ac.signal);
  } catch (e) {
    if (ac.signal.aborted) return { ...c, jobId, result: 'TIMEOUT', error: `exceeded ${JOB_TIMEOUT_MS / 1000}s`, lastStage };
    return { ...c, jobId, result: 'FAIL', error: `stream error: ${e.message}`, lastStage };
  } finally {
    clearTimeout(timer);
  }

  const secs = Math.round((Date.now() - start) / 1000);
  if (!final || final.status === 'error') return { ...c, jobId, result: 'FAIL', error: final?.message || 'stream closed with no done', secs };

  // Download the MP4.
  const url = final.downloadUrl;
  let saved = null;
  try {
    const r = await fetch(url);
    const buf = Buffer.from(await r.arrayBuffer());
    saved = path.join(OUT_DIR, `${c.name}.mp4`);
    fs.writeFileSync(saved, buf);
  } catch (e) {
    return { ...c, jobId, result: 'PARTIAL', error: `done but download failed: ${e.message}`, downloadUrl: url, secs };
  }
  const sizeKB = Math.round(fs.statSync(saved).size / 1024);
  log(`  ✅ ${c.name} done in ${secs}s — ${sizeKB}KB, ${final.scenes?.length ?? '?'} scenes`);
  return { ...c, jobId, result: 'PASS', secs, sizeKB, scenes: final.scenes?.length, saved };
}

const results = [];
for (const c of cases) {
  try { results.push(await runCase(c)); }
  catch (e) { results.push({ ...c, result: 'FAIL', error: e.message }); }
}

log('\n================ SUMMARY ================');
for (const r of results) {
  log(`${r.result.padEnd(8)} ${r.name.padEnd(22)} ${r.result === 'PASS' ? `${r.secs}s ${r.sizeKB}KB ${r.scenes}sc` : (r.error || '')}`);
}
fs.writeFileSync(path.join(OUT_DIR, '_summary.json'), JSON.stringify(results, null, 2));
log('Saved summary → qa_examples/_summary.json');
const failed = results.filter((r) => r.result !== 'PASS');
process.exit(failed.length ? 1 : 0);
