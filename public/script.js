function applyPreset(val){
  const w=document.getElementById('width');
  const h=document.getElementById('height');
  const fps=document.getElementById('fps');
  if(val==='tiktok'){ w.value=1080; h.value=1920; }
  if(val==='reels30'){ w.value=1080; h.value=1920; fps.value=30; }
  if(val==='ytshorts'){ w.value=720; h.value=1280; fps.value=30; }
}

async function fetchVideos(){
  const res = await fetch('/api/videos');
  const data = await res.json();
  const wrap = document.getElementById('videos');
  wrap.innerHTML = '';
  if(!data.files || !data.files.length){
    wrap.innerHTML = '<div class="muted">Nenhum vídeo gerado ainda.</div>';
    return;
  }
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

async function fetchBackgrounds(){
  const s = document.getElementById('bgGallery');
  s.innerHTML='';
  const data = await (await fetch('/api/backgrounds')).json();
  const opt = document.createElement('option'); opt.value=''; opt.textContent='(nenhum)'; s.appendChild(opt);
  for(const f of data.files){
    const o = document.createElement('option'); o.value = `/backgrounds/${f.file}`; o.textContent=f.file; s.appendChild(o);
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
  // force reload <video> elements to avoid caching
  document.querySelectorAll('#videos video').forEach(v=>{ v.src = v.src + (v.src.includes('?')?'&':'?') + 't=' + Date.now(); });
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

  const gallerySel = document.getElementById('bgGallery').value;
  const backgroundUrl = fd.get('backgroundUrl') || gallerySel;

  const payload = {
    title: fd.get('title'),
    episode: Number(fd.get('episode')), totalEpisodes: Number(fd.get('totalEpisodes')),
    durationSec: Number(fd.get('durationSec')),
    messages,
    width: Number(fd.get('width')), height: Number(fd.get('height')),
    fps: Number(fd.get('fps')),
    theme: document.getElementById('theme').value,
    messageDelay: fd.get('messageDelay') ? Number(fd.get('messageDelay')) : null,
    backgroundUrl
  };
  const jobId = await createJob(payload);
  poll(jobId);
});

document.getElementById('quick').addEventListener('click', async()=>{
  applyPreset('tiktok');
  const payload = {
    title: 'Mensagem no Ultrassom', episode: 1, totalEpisodes: 7,
    durationSec: 45, width: 1080, height: 1920, fps: 60, theme:'sunset',
    backgroundUrl: document.getElementById('bgGallery').value || '',
    messages: [
      {type:'text', who:'other', icon:'🍼', text:"WE DID IT BABE! I'M PREGNANT!"},
      {type:'text', who:'you', icon:'🤔', text:'fr?'},
      {type:'system', text:'Detalhes importam.'},
      {type:'media', who:'other', image:'https://images.unsplash.com/photo-1546182990-dffeafbe841d?w=800', caption:'Ultrassom 10:23'},
      {type:'text', who:'other', icon:'❤️', text:"YES! I'm so excited for US 😘"},
      {type:'alert', text:'Continua no Ep. 2…'},
    ]
  };
  const jobId = await createJob(payload);
  poll(jobId);
});

// Helper: one-click download from Pinterest sample
(async function init(){
  await fetchBackgrounds();
  const pin = 'https://br.pinterest.com/pin/493777546665664813/';
  const bgInput = document.getElementById('backgroundUrl');
  if(!bgInput.dataset.bound){
    bgInput.dataset.bound = '1';
    const btn = document.createElement('button');
    btn.type='button'; btn.textContent='Baixar do Pinterest (exemplo)';
    btn.style.marginLeft='8px';
    bgInput.parentElement.appendChild(btn);
    btn.addEventListener('click', async()=>{
      const res = await fetch('/api/backgrounds/download',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url: pin})});
      const data = await res.json();
      if(data.url){
        await fetchBackgrounds();
        document.getElementById('bgGallery').value = data.url;
        alert('Vídeo baixado e adicionado à galeria: '+data.file);
      } else {
        alert('Falha ao baixar: '+(data.error||'desconhecido'));
      }
    });
  }
  fetchVideos();
})();