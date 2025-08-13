import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import ffmpegPath from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import { nanoid } from 'nanoid';
import puppeteer from 'puppeteer';
import ytdlp from 'yt-dlp-exec';
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
const bgDir = path.join(dataDir, 'backgrounds');

for (const d of [dataDir, videosDir, framesDir, uploadsDir, bgDir]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// Static
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/videos', express.static(videosDir));
app.use('/uploads', express.static(uploadsDir));
app.use('/backgrounds', express.static(bgDir));

app.use(express.json({ limit: '10mb' }));

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

app.get('/api/backgrounds', (req, res) => {
  const files = fs.readdirSync(bgDir).filter(f=>/\.(mp4|mov|webm)$/i.test(f)).map(f=>({file:f,url:`/backgrounds/${f}`}));
  res.json({files});
});

app.post('/api/backgrounds/download', async (req, res) => {
  const { url } = req.body || {};
  if(!url) return res.status(400).json({error:'Missing url'});
  try{
    const id = nanoid(6);
    const out = path.join(bgDir, `${id}.mp4`);
    await ytdlp(url, { output: out, noCheckCertificates: true, noWarnings: true, preferFreeFormats: true, format: 'mp4/bestaudio/best' });
    res.json({file: path.basename(out), url: `/backgrounds/${path.basename(out)}`});
  }catch(err){
    res.status(500).json({error:String(err?.stderr || err?.message || err)});
  }
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
    fps = 60,
    width = 1080,
    height = 1920,
    backgroundUrl = '',
    theme = 'sunset', // 'sunset' | 'aqua' | 'violet'
    messageDelay = null // override auto spacing in seconds
  } = req.body || {};

  const jobId = nanoid(8);
  const outFile = path.join(videosDir, `${jobId}.mp4`);
  const framesPath = path.join(framesDir, jobId);
  fs.mkdirSync(framesPath, { recursive: true });

  const job = { id: jobId, status: 'queued', progress: 0, message: 'Queued', outputFile: null };
  jobs.set(jobId, job);

  // Fire and forget
  generateVideo({ job, title, episode, totalEpisodes, messages, durationSec, fps, width, height, framesPath, outFile, backgroundUrl, theme, messageDelay })
    .catch((err) => {
      job.status = 'error';
      job.message = String(err?.stack || err);
    });

  res.json({ jobId });
});

async function ensureBackgroundVideo(backgroundUrl, width, height) {
  if(!backgroundUrl) return null;
  if(backgroundUrl.startsWith('/backgrounds/')) return path.join(__dirname, backgroundUrl);
  const id = nanoid(6);
  const out = path.join(bgDir, `${id}.mp4`);
  await ytdlp(backgroundUrl, { output: out, noCheckCertificates: true, noWarnings: true, preferFreeFormats: true, format: 'mp4/bestaudio/best' });
  // scale/crop to canvas
  const scaled = path.join(bgDir, `${id}-scaled.mp4`);
  await new Promise((resolve,reject)=>{
    ffmpeg(out)
      .videoFilters([`scale=w=${width}:h=${height}:force_original_aspect_ratio=cover,setsar=1`])
      .outputOptions(['-c:v libx264','-preset ultrafast','-crf 23','-pix_fmt yuv420p'])
      .on('error',reject)
      .on('end',resolve)
      .save(scaled);
  });
  return scaled;
}

async function generateVideo({ job, title, episode, totalEpisodes, messages, durationSec, fps, width, height, framesPath, outFile, backgroundUrl, theme, messageDelay }) {
  job.status = 'rendering';
  job.message = 'Launching headless browser';

  const frameStep = 2; // even at 60fps capture every 2nd frame -> 30fps effective input, output still 60fps
  const totalFrames = Math.floor((durationSec * fps) / frameStep);
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width, height },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  let bgVideo = null;
  try {
    // Resolve background video in parallel with page load
    const page = await browser.newPage();
    await page.goto('file://' + path.join(__dirname, 'templates', 'video.html'));

    const bgPromise = ensureBackgroundVideo(backgroundUrl, width, height).catch(()=>null);

    await page.evaluate((data) => {
      window.__VIDEO_DATA__ = data;
    }, { title, episode, totalEpisodes, messages, durationSec, fps, width, height, theme, messageDelay });

    await page.evaluate(() => window.startRender && window.startRender());
    await new Promise((r)=>setTimeout(r,300));

    bgVideo = await bgPromise;

    for (let i = 0; i < totalFrames; i++) {
      const t = (i * frameStep) / fps;
      await page.evaluate((timeSec) => {
        window.setTimelineTime && window.setTimelineTime(timeSec);
      }, t);

      const file = path.join(framesPath, `frame_${String(i).padStart(5, '0')}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 85 });
      job.progress = Math.round(((i + 1) / totalFrames) * 80);
      job.message = `Captured frame ${i + 1}/${totalFrames}`;
    }

    job.message = 'Encoding video';
    job.progress = 85;

    await new Promise((resolve, reject) => {
      const inputPattern = path.join(framesPath, 'frame_%05d.jpg');
      const command = ffmpeg().input(inputPattern).inputOptions(['-framerate ' + Math.round(fps/frameStep)])
        .outputOptions([
          '-c:v libx264',
          '-preset ultrafast',
          '-crf 23',
          '-pix_fmt yuv420p',
          '-r ' + fps,
        ]);
      if (bgVideo) {
        // Overlay frames on background video
        command
          .input(bgVideo)
          .complexFilter([
            '[1:v]scale='+width+':'+height+':force_original_aspect_ratio=cover,setsar=1[bg]',
            '[0:v]setpts=PTS-STARTPTS[fg]',
            '[bg][fg]overlay=(W-w)/2:(H-h)/2:shortest=1[outv]'
          ], 'outv')
          .map('outv');
      }
      command
        .on('progress', (p) => {
          if (p.percent) job.progress = 85 + Math.min(10, Math.round(p.percent / 10));
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
    setTimeout(() => {
      try {
        fs.rmSync(framesPath, { recursive: true, force: true });
      } catch (_) {}
    }, 10_000);
  }
}

function defaultMessages() {
  return [
    { type: 'text', who: 'other', icon:'🍼', text: 'WE DID IT BABE! I\'M PREGNANT!' },
    { type: 'text', who: 'you', text: 'fr?' },
    { type: 'media', who: 'other', name: 'Ava', image: '', caption: 'Ultrassom 10:23' },
    { type: 'alert', text: 'Continua no Ep. 2…' },
  ];
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});