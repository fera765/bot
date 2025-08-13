import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import ffmpegPath from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import { nanoid } from 'nanoid';
import puppeteer from 'puppeteer';
ffmpeg.setFfmpegPath(ffmpegPath);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Folders
const dataDir = path.join(__dirname, 'data');
const videosDir = path.join(dataDir, 'videos');
const framesDir = path.join(dataDir, 'frames');
const uploadsDir = path.join(dataDir, 'uploads');

for (const d of [dataDir, videosDir, framesDir, uploadsDir]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// Static
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/videos', express.static(videosDir));
app.use('/uploads', express.static(uploadsDir));

app.use(express.json({ limit: '5mb' }));

// Multer for optional uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
    cb(null, unique);
  },
});
const upload = multer({ storage });

// In-memory job store
const jobs = new Map();

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/videos', (req, res) => {
  const files = fs
    .readdirSync(videosDir)
    .filter((f) => f.endsWith('.mp4'))
    .map((f) => {
      const filePath = path.join(videosDir, f);
      const stat = fs.statSync(filePath);
      return {
        id: path.parse(f).name,
        filename: f,
        size: stat.size,
        mtime: stat.mtimeMs,
        url: `/videos/${f}`,
        download: `/api/download/${path.parse(f).name}`,
      };
    })
    .sort((a, b) => b.mtime - a.mtime);
  res.json({ files });
});

app.get('/api/progress/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({
    id: req.params.jobId,
    status: job.status,
    progress: job.progress,
    message: job.message,
    outputUrl: job.outputFile ? `/videos/${path.basename(job.outputFile)}` : null,
  });
});

app.get('/api/download/:id', (req, res) => {
  const id = req.params.id;
  const filePath = path.join(videosDir, `${id}.mp4`);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.download(filePath);
});

// Upload route (optional background or media)
app.post('/api/upload', upload.single('file'), (req, res) => {
  res.json({ path: `/uploads/${req.file.filename}` });
});

// Generate video
app.post('/api/generate', async (req, res) => {
  const {
    title = 'Mensagem no Ultrassom',
    episode = 1,
    totalEpisodes = 7,
    messages = defaultMessages(),
    durationSec = 90,
    fps = 24,
    width = 1080,
    height = 1920,
  } = req.body || {};

  const jobId = nanoid(8);
  const outFile = path.join(videosDir, `${jobId}.mp4`);
  const framesPath = path.join(framesDir, jobId);
  fs.mkdirSync(framesPath, { recursive: true });

  const job = { id: jobId, status: 'queued', progress: 0, message: 'Queued', outputFile: null };
  jobs.set(jobId, job);

  // Fire and forget
  generateVideo({ job, title, episode, totalEpisodes, messages, durationSec, fps, width, height, framesPath, outFile })
    .catch((err) => {
      job.status = 'error';
      job.message = String(err?.stack || err);
    });

  res.json({ jobId });
});

async function generateVideo({ job, title, episode, totalEpisodes, messages, durationSec, fps, width, height, framesPath, outFile }) {
  job.status = 'rendering';
  job.message = 'Launching headless browser';

  const totalFrames = Math.floor(durationSec * fps);
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width, height },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  try {
    const page = await browser.newPage();
    await page.goto('file://' + path.join(__dirname, 'templates', 'video.html'));

    await page.evaluate((data) => {
      window.__VIDEO_DATA__ = data;
    }, { title, episode, totalEpisodes, messages, durationSec, fps, width, height });

    await page.evaluate(() => window.startRender && window.startRender());

    // Give page time to init
    await new Promise((r)=>setTimeout(r,300));

    for (let i = 0; i < totalFrames; i++) {
      const t = i / fps;
      await page.evaluate((timeSec) => {
        window.setTimelineTime && window.setTimelineTime(timeSec);
      }, t);

      const file = path.join(framesPath, `frame_${String(i).padStart(5, '0')}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 85 });
      job.progress = Math.round(((i + 1) / totalFrames) * 80); // 0-80% for frame capture
      job.message = `Captured frame ${i + 1}/${totalFrames}`;
    }

    job.message = 'Encoding video';
    job.progress = 85;

    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(path.join(framesPath, 'frame_%05d.jpg'))
        .inputOptions(['-framerate ' + fps])
        .outputOptions([
          '-c:v libx264',
          '-preset ultrafast',
          '-crf 23',
          '-pix_fmt yuv420p',
          '-r ' + fps,
        ])
        .on('start', (cmd) => {
          ffmpeg.setFfmpegPath(ffmpegPath);
        })
        .on('progress', (p) => {
          if (p.percent) {
            job.progress = 85 + Math.min(10, Math.round(p.percent / 10));
          }
        })
        .on('error', (err) => reject(err))
        .on('end', resolve)
        .save(outFile);
    });

    job.progress = 100;
    job.status = 'done';
    job.message = 'Completed';
    job.outputFile = outFile;
  } finally {
    await browser.close();
    // Cleanup frames directory lazily
    setTimeout(() => {
      try {
        fs.rmSync(framesPath, { recursive: true, force: true });
      } catch (_) {}
    }, 10_000);
  }
}

function defaultMessages() {
  return [
    { type: 'text', who: 'other', name: 'Ava', text: 'WE DID IT BABE! I\'M PREGNANT!' },
    { type: 'text', who: 'you', text: 'fr?' },
    { type: 'text', who: 'other', name: 'Ava', text: 'YES! I\'m so excited for US 😘' },
    { type: 'text', who: 'other', name: 'Ava', text: 'I know this has been a dream of yours too' },
    { type: 'system', text: 'Detalhes importam.' },
    { type: 'media', who: 'other', name: 'Ava', image: '', caption: 'Ultrassom 10:23' },
    { type: 'alert', text: 'Continua no Ep. 2…' },
  ];
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});