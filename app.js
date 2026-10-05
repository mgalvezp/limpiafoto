const $ = (s) => document.querySelector(s);
const fileInput = $('#files');
const analyzeBtn = $('#analyze');
const cleanBtn = $('#clean');
const statusEl = $('#status');
const analysisSection = $('#analysis');
const analysisList = $('#analysisList');
const analysisStats = $('#analysisStats');
const riskBadge = $('#riskBadge');
const resultSection = $('#results');
const resultStats = $('#resultStats');
const grid = $('#grid');
const analysisTpl = $('#analysisTpl');
const resultTpl = $('#resultTpl');
const formatEl = $('#format');
const qualityEl = $('#quality');
const qualityValue = $('#qualityValue');
const deepCleanEl = $('#deepClean');
const shareAllBtn = $('#shareAll');
const clearSelectionBtn = $('#clearSelection');
const selectionSummary = $('#selectionSummary');
const selectionCount = $('#selectionCount');
const selectionSize = $('#selectionSize');
const dropZone = $('#dropZone');

let selectedFiles = [];
let analyses = [];
let cleaned = [];
let objectUrls = [];

const META_LABELS = {
  exif:'EXIF', gps:'GPS', xmp:'XMP', iptc:'IPTC', comment:'Comentarios',
  c2pa:'C2PA/JUMBF', text:'Texto incrustado', time:'Fecha PNG', phys:'pHYs', icc:'Perfil ICC', orientation:'Orientación EXIF'
};

qualityEl.addEventListener('input', () => qualityValue.textContent = `${qualityEl.value}%`);

function humanBytes(n){
  if(!Number.isFinite(n)) return '—';
  if(n < 1024) return `${n} B`;
  if(n < 1024*1024) return `${(n/1024).toFixed(1)} KB`;
  return `${(n/1024/1024).toFixed(2)} MB`;
}
function totalBytes(files){ return files.reduce((sum,f)=>sum+f.size,0); }
function escapeExt(name){ return name.replace(/\.[^/.]+$/, ''); }
function extensionFor(mime){ return mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'; }
function cleanName(name, ext){ return `${escapeExt(name)}-clean.${ext}`; }
function makeUrl(blob){ const u=URL.createObjectURL(blob); objectUrls.push(u); return u; }
function clearUrls(){ objectUrls.forEach(URL.revokeObjectURL); objectUrls=[]; }
function concatArrays(parts){
  const total=parts.reduce((n,p)=>n+p.length,0), out=new Uint8Array(total); let o=0;
  for(const p of parts){ out.set(p,o); o+=p.length; } return out;
}
function ascii(bytes,start,len){
  let s=''; for(let i=0;i<len && start+i<bytes.length;i++){ const c=bytes[start+i]; if(c===0) break; s+=String.fromCharCode(c); } return s;
}
function containsAscii(bytes,needle){
  const target=[...needle].map(c=>c.charCodeAt(0));
  outer: for(let i=0;i<=bytes.length-target.length;i++){
    for(let j=0;j<target.length;j++) if(bytes[i+j]!==target[j]) continue outer;
    return true;
  }
  return false;
}
function setSelected(files){
  selectedFiles=[...files].filter(f=>f && (f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)));
  analyses=[]; cleaned=[]; clearUrls(); analysisSection.hidden=true; resultSection.hidden=true; analysisList.innerHTML=''; grid.innerHTML='';
  const n=selectedFiles.length;
  analyzeBtn.disabled=!n; cleanBtn.disabled=!n; selectionSummary.hidden=!n;
  selectionCount.textContent=n===1?'1 imagen':`${n} imágenes`; selectionSize.textContent=humanBytes(totalBytes(selectedFiles));
  statusEl.className='status'; statusEl.textContent=n?`${n} archivo${n===1?'':'s'} listo${n===1?'':'s'} para analizar o limpiar.`:'';
}
fileInput.addEventListener('change',()=>setSelected(fileInput.files || []));
clearSelectionBtn.addEventListener('click',()=>{ fileInput.value=''; setSelected([]); });
['dragenter','dragover'].forEach(ev=>dropZone.addEventListener(ev,e=>{e.preventDefault();dropZone.classList.add('drag');}));
['dragleave','drop'].forEach(ev=>dropZone.addEventListener(ev,e=>{e.preventDefault();dropZone.classList.remove('drag');}));
dropZone.addEventListener('drop',e=>setSelected(e.dataTransfer?.files || []));

function parseTiffForGps(bytes,offset){
  try{
    if(offset+8>bytes.length) return false;
    const little=bytes[offset]===0x49 && bytes[offset+1]===0x49;
    const big=bytes[offset]===0x4D && bytes[offset+1]===0x4D;
    if(!little && !big) return false;
    const u16=(p)=> little ? bytes[p]|(bytes[p+1]<<8) : (bytes[p]<<8)|bytes[p+1];
    const u32=(p)=> little ? ((bytes[p]|(bytes[p+1]<<8)|(bytes[p+2]<<16)|(bytes[p+3]<<24))>>>0) : (((bytes[p]<<24)|(bytes[p+1]<<16)|(bytes[p+2]<<8)|bytes[p+3])>>>0);
    const ifd0=offset+u32(offset+4); if(ifd0+2>bytes.length) return false;
    const count=Math.min(u16(ifd0),256);
    for(let i=0;i<count;i++){
      const p=ifd0+2+i*12; if(p+12>bytes.length) break;
      if(u16(p)===0x8825) return true;
    }
  }catch(_){ }
  return false;
}

function parseTiffOrientation(bytes,offset){
  try{
    if(offset+8>bytes.length) return 1;
    const little=bytes[offset]===0x49 && bytes[offset+1]===0x49;
    const big=bytes[offset]===0x4D && bytes[offset+1]===0x4D;
    if(!little && !big) return 1;
    const u16=(p)=> little ? bytes[p]|(bytes[p+1]<<8) : (bytes[p]<<8)|bytes[p+1];
    const u32=(p)=> little ? ((bytes[p]|(bytes[p+1]<<8)|(bytes[p+2]<<16)|(bytes[p+3]<<24))>>>0) : (((bytes[p]<<24)|(bytes[p+1]<<16)|(bytes[p+2]<<8)|bytes[p+3])>>>0);
    const ifd0=offset+u32(offset+4); if(ifd0+2>bytes.length) return 1;
    const count=Math.min(u16(ifd0),256);
    for(let i=0;i<count;i++){
      const p=ifd0+2+i*12; if(p+12>bytes.length) break;
      if(u16(p)===0x0112){ const value=u16(p+8); return value>=1&&value<=8?value:1; }
    }
  }catch(_){ }
  return 1;
}

function analyzeJpeg(bytes){
  const found=new Set(); let segments=0,orientation=1;
  if(bytes[0]!==0xFF || bytes[1]!==0xD8) throw new Error('JPEG inválido');
  let p=2;
  while(p<bytes.length){
    if(bytes[p]!==0xFF) break;
    const mpos=p; while(bytes[p]===0xFF) p++; const marker=bytes[p++];
    if(marker===0xDA || marker===0xD9) break;
    if(marker===0x01 || (marker>=0xD0 && marker<=0xD7)) continue;
    if(p+1>=bytes.length) break;
    const len=(bytes[p]<<8)|bytes[p+1], payload=p+2, end=p+len; if(end>bytes.length || len<2) break; segments++;
    const head=ascii(bytes,payload,Math.min(80,end-payload));
    if(marker===0xE1){
      if(head.startsWith('Exif')){ found.add('exif'); if(parseTiffForGps(bytes,payload+6)) found.add('gps'); orientation=parseTiffOrientation(bytes,payload+6); if(orientation!==1) found.add('orientation'); }
      if(head.includes('http://ns.adobe.com/xap/1.0/') || head.includes('xmp')) found.add('xmp');
    }
    if(marker===0xED) found.add('iptc');
    if(marker===0xFE) found.add('comment');
    if(marker===0xEB || head.includes('JUMBF') || head.includes('c2pa')) found.add('c2pa');
    if(marker===0xE2 && (head.startsWith('ICC_PROFILE') || head.includes('ICC'))) found.add('icc');
    p=end;
  }
  if(containsAscii(bytes,'c2pa') || containsAscii(bytes,'jumb')) found.add('c2pa');
  return {format:'JPEG',found:[...found],segments,orientation};
}
function analyzePng(bytes){
  const sig=[137,80,78,71,13,10,26,10]; if(!sig.every((v,i)=>bytes[i]===v)) throw new Error('PNG inválido');
  const found=new Set(); let chunks=0,p=8;
  while(p+12<=bytes.length){
    const len=((bytes[p]<<24)>>>0)+(bytes[p+1]<<16)+(bytes[p+2]<<8)+bytes[p+3];
    const type=ascii(bytes,p+4,4), end=p+12+len; if(end>bytes.length) break; chunks++;
    if(type==='eXIf') found.add('exif'); if(type==='iTXt'||type==='tEXt'||type==='zTXt') found.add('text');
    if(type==='tIME') found.add('time'); if(type==='pHYs') found.add('phys'); if(type==='iCCP') found.add('icc');
    if(type==='caBX' || type==='c2pa') found.add('c2pa');
    if((type==='iTXt'||type==='tEXt'||type==='zTXt') && containsAscii(bytes.slice(p+8,p+8+len),'XML:com.adobe.xmp')) found.add('xmp');
    p=end; if(type==='IEND') break;
  }
  if(containsAscii(bytes,'c2pa')) found.add('c2pa');
  return {format:'PNG',found:[...found],segments:chunks,orientation:1};
}
function analyzeWebp(bytes){
  const is=(s,o)=>[...s].every((c,i)=>bytes[o+i]===c.charCodeAt(0)); if(bytes.length<12||!is('RIFF',0)||!is('WEBP',8)) throw new Error('WebP inválido');
  const found=new Set(); let chunks=0,p=12;
  while(p+8<=bytes.length){
    const type=ascii(bytes,p,4), size=(bytes[p+4]|(bytes[p+5]<<8)|(bytes[p+6]<<16)|(bytes[p+7]<<24))>>>0;
    const end=p+8+size+(size%2); if(end>bytes.length) break; chunks++;
    if(type==='EXIF') found.add('exif'); if(type==='XMP ') found.add('xmp'); if(type==='ICCP') found.add('icc'); if(type==='C2PA') found.add('c2pa');
    p=end;
  }
  if(containsAscii(bytes,'c2pa')) found.add('c2pa');
  return {format:'WebP',found:[...found],segments:chunks,orientation:1};
}
async function imageDimensions(file){
  const url=URL.createObjectURL(file);
  try{ const img=new Image(); img.src=url; await img.decode(); return {width:img.naturalWidth,height:img.naturalHeight}; }
  catch(_){ return {width:null,height:null}; }
  finally{ URL.revokeObjectURL(url); }
}
async function inspectFile(file){
  const bytes=new Uint8Array(await file.arrayBuffer()); let detail={format:file.type||'Imagen',found:[],segments:0,orientation:1};
  try{
    if((file.type==='image/jpeg'||/\.jpe?g$/i.test(file.name))) detail=analyzeJpeg(bytes);
    else if(file.type==='image/png'||/\.png$/i.test(file.name)) detail=analyzePng(bytes);
    else if(file.type==='image/webp'||/\.webp$/i.test(file.name)) detail=analyzeWebp(bytes);
    else detail={format:/\.hei[cf]$/i.test(file.name)?'HEIC/HEIF':'Imagen',found:['unknown'],segments:0,orientation:1};
  }catch(_){ detail.found=['unknown']; }
  const dim=await imageDimensions(file);
  return {...detail,...dim,file};
}
function renderStats(el,items){ el.innerHTML=items.map(([v,l])=>`<div class="stat"><strong>${v}</strong><span>${l}</span></div>`).join(''); }
function readableTags(found){ return found.filter(x=>x!=='unknown'&&x!=='orientation').map(x=>META_LABELS[x]||x); }
function renderAnalysis(items){
  analysisList.innerHTML=''; let filesWithMetadata=0,totalTags=0;
  items.forEach(info=>{
    const node=analysisTpl.content.cloneNode(true), file=info.file, tags=readableTags(info.found);
    const img=node.querySelector('.thumb'); img.src=makeUrl(file);
    node.querySelector('.name').textContent=file.name; node.querySelector('.fileType').textContent=info.format;
    node.querySelector('.dimensions').textContent=info.width&&info.height?`${info.width} × ${info.height} px`:'Dimensiones no disponibles';
    const chips=node.querySelector('.chips');
    if(tags.length){ filesWithMetadata++; totalTags+=tags.length; chips.innerHTML=tags.map(t=>`<span class="chip">${t}</span>`).join(''); }
    else if(info.found.includes('unknown')) chips.innerHTML='<span class="chip">Se limpiará recodificando</span>';
    else chips.innerHTML='<span class="chip safe">Sin metadatos detectados</span>';
    const state=node.querySelector('.privacyState'); state.textContent=tags.length?`${tags.length} tipo${tags.length===1?'':'s'} detectado${tags.length===1?'':'s'}`:'Sin datos sensibles detectados'; state.className=`privacyState ${tags.length?'found':'ok'}`;
    node.querySelector('.fileSize').textContent=humanBytes(file.size); analysisList.appendChild(node);
  });
  renderStats(analysisStats,[[items.length,'Imágenes'],[filesWithMetadata,'Con metadatos'],[totalTags,'Tipos detectados']]);
  riskBadge.textContent=filesWithMetadata?`${filesWithMetadata} por limpiar`:'Sin datos detectados'; riskBadge.className=`riskBadge ${filesWithMetadata?'risk':'clean'}`;
  analysisSection.hidden=false;
}

analyzeBtn.addEventListener('click',async()=>{
  if(!selectedFiles.length) return;
  analyzeBtn.disabled=true; cleanBtn.disabled=true; statusEl.className='status'; analyses=[];
  for(let i=0;i<selectedFiles.length;i++){
    const f=selectedFiles[i]; statusEl.textContent=`Analizando ${i+1} de ${selectedFiles.length}: ${f.name}`;
    analyses.push(await inspectFile(f));
  }
  renderAnalysis(analyses); statusEl.className='status success'; statusEl.textContent='Análisis terminado. Puedes limpiar las imágenes cuando quieras.'; analyzeBtn.disabled=false; cleanBtn.disabled=false;
  analysisSection.scrollIntoView({behavior:'smooth',block:'start'});
});

function stripJpeg(bytes,deep=false){
  if(bytes[0]!==0xFF||bytes[1]!==0xD8) throw new Error('JPEG inválido'); const parts=[bytes.slice(0,2)]; let p=2;
  while(p<bytes.length){
    if(bytes[p]!==0xFF){parts.push(bytes.slice(p));break;} let mpos=p; while(bytes[p]===0xFF)p++; const marker=bytes[p++];
    if(marker===0xDA){parts.push(bytes.slice(mpos));break;} if(marker===0xD9){parts.push(bytes.slice(mpos,p));break;}
    if(marker===0x01||(marker>=0xD0&&marker<=0xD7)){parts.push(bytes.slice(mpos,p));continue;}
    if(p+1>=bytes.length) throw new Error('JPEG truncado'); const len=(bytes[p]<<8)|bytes[p+1],end=p+len; if(end>bytes.length||len<2) throw new Error('Segmento JPEG inválido');
    const payload=p+2, head=ascii(bytes,payload,Math.min(80,end-payload));
    let drop=marker===0xE1||marker===0xEB||marker===0xED||marker===0xFE;
    if(deep && marker===0xE2 && (head.startsWith('ICC_PROFILE')||head.includes('ICC'))) drop=true;
    if(!drop) parts.push(bytes.slice(mpos,end)); p=end;
  } return concatArrays(parts);
}
function stripPng(bytes,deep=false){
  const sig=[137,80,78,71,13,10,26,10]; if(!sig.every((v,i)=>bytes[i]===v)) throw new Error('PNG inválido');
  const parts=[bytes.slice(0,8)],drop=new Set(['eXIf','tEXt','zTXt','iTXt','tIME','pHYs','caBX','c2pa']); if(deep) drop.add('iCCP'); let p=8;
  while(p+12<=bytes.length){ const len=((bytes[p]<<24)>>>0)+(bytes[p+1]<<16)+(bytes[p+2]<<8)+bytes[p+3],type=ascii(bytes,p+4,4),end=p+12+len; if(end>bytes.length) throw new Error('Chunk PNG inválido'); if(!drop.has(type))parts.push(bytes.slice(p,end)); p=end; if(type==='IEND')break; }
  return concatArrays(parts);
}
function writeU32LE(arr,off,n){arr[off]=n&255;arr[off+1]=(n>>>8)&255;arr[off+2]=(n>>>16)&255;arr[off+3]=(n>>>24)&255;}
function stripWebp(bytes,deep=false){
  const is=(s,o)=>[...s].every((c,i)=>bytes[o+i]===c.charCodeAt(0)); if(bytes.length<12||!is('RIFF',0)||!is('WEBP',8))throw new Error('WebP inválido');
  const chunks=[]; let p=12;
  while(p+8<=bytes.length){ const type=ascii(bytes,p,4),size=(bytes[p+4]|(bytes[p+5]<<8)|(bytes[p+6]<<16)|(bytes[p+7]<<24))>>>0,padded=size+(size%2),end=p+8+padded; if(end>bytes.length)throw new Error('Chunk WebP inválido');
    const shouldDrop=type==='EXIF'||type==='XMP '||type==='C2PA'||(deep&&type==='ICCP'); if(!shouldDrop){ let chunk=bytes.slice(p,end); if(type==='VP8X'&&size>=10){chunk=chunk.slice();chunk[8]=chunk[8]&~0x2C;} chunks.push(chunk);} p=end; }
  const body=concatArrays(chunks),out=new Uint8Array(12+body.length); out.set([82,73,70,70],0);writeU32LE(out,4,4+body.length);out.set([87,69,66,80],8);out.set(body,12);return out;
}
async function losslessStrip(file){
  const bytes=new Uint8Array(await file.arrayBuffer()),deep=deepCleanEl.checked; let out,mime=file.type;
  if(mime==='image/jpeg'||/\.jpe?g$/i.test(file.name)){out=stripJpeg(bytes,deep);mime='image/jpeg';}
  else if(mime==='image/png'||/\.png$/i.test(file.name)){out=stripPng(bytes,deep);mime='image/png';}
  else if(mime==='image/webp'||/\.webp$/i.test(file.name)){out=stripWebp(bytes,deep);mime='image/webp';}
  else return null;
  return new File([out],cleanName(file.name,extensionFor(mime)),{type:mime,lastModified:Date.now()});
}
async function recode(file,forcedMime=null){
  const inputUrl=URL.createObjectURL(file);
  try{ const img=new Image();img.decoding='async';img.src=inputUrl;await img.decode(); const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const ctx=canvas.getContext('2d',{alpha:true});
    const mime=forcedMime||(file.type==='image/png'?'image/png':file.type==='image/webp'?'image/webp':'image/jpeg'); if(mime==='image/jpeg'){ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);}ctx.drawImage(img,0,0); const quality=Number(qualityEl.value)/100;
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('No se pudo codificar la imagen.')),mime,quality)); return new File([blob],cleanName(file.name,extensionFor(mime)),{type:mime,lastModified:Date.now()});
  }finally{URL.revokeObjectURL(inputUrl);}
}
async function cleanFile(file,analysis=null){
  if(formatEl.value==='auto'){
    const orientation=analysis?.orientation||1;
    if(orientation!==1 && (file.type==='image/jpeg'||/\.jpe?g$/i.test(file.name))){
      return{file:await recode(file,'image/jpeg'),mode:'Orientación normalizada'};
    }
    const raw=await losslessStrip(file);if(raw)return{file:raw,mode:'Sin recomprimir'};
    return{file:await recode(file,'image/jpeg'),mode:'Convertida a JPEG'};
  }
  return{file:await recode(file,formatEl.value),mode:'Re-codificada'};
}
function removedFor(originalAnalysis){
  if(!originalAnalysis) return 'Metadatos compatibles eliminados.'; const tags=readableTags(originalAnalysis.found).filter(t=>deepCleanEl.checked||t!=='Perfil ICC'); return tags.length?`Eliminado: ${tags.join(' · ')}`:'No se detectaron metadatos conocidos; se generó una copia limpia.';
}
function renderResult(original,result,analysis){
  const node=resultTpl.content.cloneNode(true),file=result.file,urlBefore=makeUrl(original),urlAfter=makeUrl(file); node.querySelector('.before').src=urlBefore;node.querySelector('.after').src=urlAfter;node.querySelector('.name').textContent=file.name;
  const delta=file.size-original.size,pct=original.size?Math.abs(delta/original.size*100):0; node.querySelector('.meta').textContent=`${result.mode} · ${humanBytes(original.size)} → ${humanBytes(file.size)}${pct>=0.1?` · ${delta<=0?'−':'+'}${pct.toFixed(1)}%`:''}`;node.querySelector('.removed').textContent=removedFor(analysis);
  const share=node.querySelector('.share'),download=node.querySelector('.download'); download.href=urlAfter;download.download=file.name;share.addEventListener('click',async()=>{if(navigator.share&&navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:'Imagen limpia'});}catch(_){}}else download.click();});grid.appendChild(node);
}
cleanBtn.addEventListener('click',async()=>{
  if(!selectedFiles.length)return; analyzeBtn.disabled=true;cleanBtn.disabled=true;grid.innerHTML='';cleaned=[];statusEl.className='status';let ok=0,failures=[];
  if(!analyses.length){for(const f of selectedFiles) analyses.push(await inspectFile(f));renderAnalysis(analyses);}
  for(let i=0;i<selectedFiles.length;i++){const f=selectedFiles[i];statusEl.textContent=`Limpiando ${i+1} de ${selectedFiles.length}: ${f.name}`;try{const analysis=analyses.find(a=>a.file===f);const result=await cleanFile(f,analysis);cleaned.push(result.file);renderResult(f,result,analysis);ok++;}catch(err){console.error(err);failures.push(f.name);}}
  resultSection.hidden=!cleaned.length;shareAllBtn.hidden=!(cleaned.length>1&&navigator.share&&navigator.canShare?.({files:cleaned})); const before=totalBytes(selectedFiles),after=totalBytes(cleaned),saved=Math.max(0,before-after);renderStats(resultStats,[[ok,'Procesadas'],[humanBytes(after),'Peso final'],[humanBytes(saved),'Ahorro']]);
  statusEl.className=failures.length?'status error':'status success';statusEl.textContent=failures.length?`${ok} listas. No se pudieron procesar: ${failures.join(', ')}.`:`${ok} imagen${ok===1?'':'es'} limpia${ok===1?'':'s'}. Todo se procesó localmente.`;analyzeBtn.disabled=false;cleanBtn.disabled=false;if(cleaned.length)resultSection.scrollIntoView({behavior:'smooth',block:'start'});
});
shareAllBtn.addEventListener('click',async()=>{if(cleaned.length&&navigator.share&&navigator.canShare?.({files:cleaned})){try{await navigator.share({files:cleaned,title:'Imágenes limpias'});}catch(_){}}});
if('serviceWorker'in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));}
