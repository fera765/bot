function applyPreset(val){
  const w=document.getElementById('width');
  const h=document.getElementById('height');
  const fps=document.getElementById('fps');
  if(val==='tiktok'){ w.value=1080; h.value=1920; fps.value=24; }
  if(val==='reels30'){ w.value=1080; h.value=1920; fps.value=30; }
  if(val==='ytshorts'){ w.value=720; h.value=1280; fps.value=30; }
}

async function fetchVideos(){
  const res = await fetch('/api/videos');
  const data = await res.json();
  const wrap = document.getElementById('videos');
  wrap.innerHTML = '';
  for(const f of data.files){
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `
      <div>
        <strong>${f.filename}</strong>
        <div class="muted">${(f.size/1e6).toFixed(2)} MB</div>
      </div>
      <video controls src="${f.url}"></video>
      <div class="actions">
        <a href="${f.url}" target="_blank">Abrir</a>
        <a href="${f.download}">Baixar</a>
      </div>
    `;
    wrap.appendChild(div);
  }
}

async function createJob(payload){
  const res = await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const data = await res.json();
  return data.jobId;
}

async function poll(jobId){
  const el = document.getElementById('progress');
  el.classList.remove('hidden');
  let done=false;
  while(!done){
    const res = await fetch(`/api/progress/${jobId}`);
    const data = await res.json();
    el.textContent = `Status: ${data.status} — ${data.progress || 0}% — ${data.message || ''}`;
    if(data.status==='done'){ done=true; }
    if(data.status==='error'){ done=true; alert('Erro: '+data.message); }
    await new Promise(r=>setTimeout(r,800));
  }
  await fetchVideos();
}

const form = document.getElementById('gen-form');
const preset = document.getElementById('preset');
preset.addEventListener('change', ()=> applyPreset(preset.value));

form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const fd = new FormData(form);
  let messages;
  try{ messages = JSON.parse(fd.get('messages')); }
  catch(err){ alert('JSON de mensagens inválido'); return; }
  const payload = {
    title: fd.get('title'),
    episode: Number(fd.get('episode')), totalEpisodes: Number(fd.get('totalEpisodes')),
    durationSec: Number(fd.get('durationSec')),
    messages,
    width: Number(fd.get('width')), height: Number(fd.get('height')),
    fps: Number(fd.get('fps')),
  };
  const jobId = await createJob(payload);
  poll(jobId);
});

document.getElementById('quick').addEventListener('click', async()=>{
  applyPreset('tiktok');
  const payload = {
    title: 'Mensagem no Ultrassom', episode: 1, totalEpisodes: 7,
    durationSec: 30, width: 1080, height: 1920, fps: 24,
    messages: [
      {type:'text', who:'other', name:'Ava', text:"WE DID IT BABE! I'M PREGNANT!"},
      {type:'text', who:'you', text:'fr?'},
      {type:'text', who:'other', name:'Ava', text:"YES! I'm so excited for US 😘"},
      {type:'system', text:'Detalhes importam.'},
      {type:'media', who:'other', name:'Ava', image:'', caption:'Ultrassom 10:23'},
      {type:'alert', text:'Continua no Ep. 2…'},
    ]
  };
  const jobId = await createJob(payload);
  poll(jobId);
});

fetchVideos();