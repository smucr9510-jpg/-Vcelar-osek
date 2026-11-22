'use strict';
/* VÄelaÅ â Osek | bezpeÄnÃ© uklÃ¡dÃ¡nÃ­ do IndexedDB */
const SITE={name:'TORENO, s.r.o., Osek 489',lat:49.7804535,lon:13.5998565};
const KEY='vcelarOsek.data.v2',DB_NAME='vcelarOsekDB',DB_STORE='appData';
const BROOD_ANALYSIS_URL='https://vcelar-osek-analyza.smucr9510.workers.dev/analyze';
let checkPhotoAssessment=null;
let broodLocalAssessment=null, broodArea=null, broodImgData=null, broodShowMask=false, broodLastImage=null;
const $=id=>document.getElementById(id);
const today=()=>new Date().toISOString().slice(0,10);
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const seed=()=>({colonies:[1,2,3,4].map(n=>({id:'seed'+n,name:'Ãl '+n,type:'Adamec 11 rÃ¡mkÅ¯',date:'',state:'AktivnÃ­',queenColor:'',strain:'',strainOther:'',notes:''})),checks:[],forage:[],parcels:[],harvests:[],updated:new Date().toISOString()});
let db,saveQueue=Promise.resolve();
let renderAll=()=>{};
let parcelFormHome=null,parcelFormNext=null;
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(DB_STORE))r.result.createObjectStore(DB_STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||Error('Nelze otevÅÃ­t IndexedDB'))})}
async function readDB(){
 const idb=await openDB();
 let data=await new Promise((resolve,reject)=>{const tx=idb.transaction(DB_STORE,'readonly'),r=tx.objectStore(DB_STORE).get(KEY);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error)});
 if(data&&Array.isArray(data.colonies)){idb.close();return data}
 try{const legacy=JSON.parse(localStorage.getItem(KEY)||'null');if(legacy&&Array.isArray(legacy.colonies))data=legacy}catch{}
 if(!data)data=seed();
 await new Promise((resolve,reject)=>{const tx=idb.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(data,KEY);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Migrace dat selhala'))});
 idb.close();return data
}
function writeDB(snapshot){
 saveQueue=saveQueue.then(async()=>{const idb=await openDB();await new Promise((resolve,reject)=>{const tx=idb.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(snapshot,KEY);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('UloÅ¾enÃ­ selhalo'))});idb.close()});
 return saveQueue
}
function save(){db.updated=new Date().toISOString();const snapshot=structuredClone(db);writeDB(snapshot).catch(e=>{console.error(e);alert('UloÅ¾enÃ­ do telefonu se nezdaÅilo: '+(e.message||e)+'. Data nemaÅ¾te; exportujte zÃ¡lohu.')});renderAll()}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function page(id){document.querySelectorAll('.page').forEach(x=>x.classList.toggle('hidden',x.id!==id));document.querySelectorAll('#nav button').forEach(x=>x.classList.toggle('active',x.dataset.page===id));if(id==='checks')fillColonySelect()}
function fillColonySelect(){const s=$('checkColony'),old=s.value;s.innerHTML=db.colonies.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');if(old)s.value=old}
async function readCheckPhoto(file){
 if(!file)return '';
 if(!file.type.startsWith('image/'))throw Error('Vyberte prosÃ­m obrÃ¡zek.');
 return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>{const img=new Image();img.onload=()=>{const scale=Math.min(1,1400/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/jpeg',.78))};img.onerror=()=>reject(Error('Fotografii se nepodaÅilo naÄÃ­st.'));img.src=reader.result};reader.onerror=()=>reject(Error('Fotografii se nepodaÅilo naÄÃ­st.'));reader.readAsDataURL(file)})
}
async function analyzeCheckPhoto(){
 const file=$('checkPhoto').files[0];
 if(!file){alert('Nejprve vyberte fotografii plodu.');return}
 if(!navigator.onLine){$('checkPhotoAnalysisStatus').textContent='AnalÃ½za vyÅ¾aduje pÅipojenÃ­ k internetu. Fotografie zÅ¯stÃ¡vÃ¡ v telefonu.';return}
 const button=$('analyzeCheckPhoto');button.disabled=true;button.textContent='Vyhodnocujiâ¦';$('checkPhotoAnalysisStatus').textContent='OdesÃ­lÃ¡m zmenÅ¡enou fotografii k orientaÄnÃ­mu posouzenÃ­â¦';
 try{
  const image=await readCheckPhoto(file);
  const response=await fetch(BROOD_ANALYSIS_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image})});
  let data;try{data=await response.json()}catch{throw Error('Server nevrÃ¡til Äitelnou odpovÄÄ.')}
  if(!response.ok||!data.ok)throw Error(data.error||('Server odpovÄdÄl HTTP '+response.status));
  const root=data.assessment??data.result??data.analysis??data;
const a=(root&&typeof root==='object'&&!Array.isArray(root))?root:{};
const pick=(...keys)=>{for(const key of keys){const v=a[key];if(v!==undefined&&v!==null&&v!=='')return v}return null};
const normalizeText=v=>String(v??'').trim();
const normalizePattern=v=>{
 const s=normalizeText(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 if(['nizka','low','good','regular','normal','minimalni','minimal','excellent','very good'].includes(s))return 'nÃ­zkÃ¡';
 if(['stredni','medium','moderate','average','fair'].includes(s))return 'stÅednÃ­';
 if(['vysoka','high','poor','irregular','spatna','severe','bad','very poor'].includes(s))return 'vysokÃ¡';
 return 'nelze_posoudit';
};
const value=normalizePattern(pick('mezerovitost','level','brood_pattern','broodPattern','pattern','brood_gappiness','gappiness','brood_quality'));
const certainty=normalizeText(pick('jistota','confidence','certainty','confidence_level'))||'neuvedena';
const toArray=v=>Array.isArray(v)?v.map(x=>typeof x==='string'?x:JSON.stringify(x)):typeof v==='string'&&v.trim()?[v]:[];
const observations=toArray(pick('pozorovani','observations','findings','visible_signs'));
const limits=toArray(pick('omezeni','limitations','uncertainties','caveats'));
const recommendation=normalizeText(pick('doporuceni','recommendation','advice','next_steps','summary'));
const optionMap={'nÃ­zkÃ¡':'NÃ­zkÃ¡','stÅednÃ­':'StÅednÃ­','vysokÃ¡':'VysokÃ¡'};
checkPhotoAssessment={mezerovitost:value,jistota:certainty,pozorovani:observations,omezeni:limits,doporuceni:recommendation,raw:a};
const select=$('checkBroodPattern');
if(optionMap[value])select.value=optionMap[value];
const resultLabel=value==='nelze_posoudit'?'Nelze posoudit':optionMap[value];
const disclaimer=normalizeText(data.disclaimer||a.disclaimer)||'AutomatickÃ© posouzenÃ­ fotografie je pouze orientaÄnÃ­. VÃ½sledek ovÄÅte fyzickou kontrolou plÃ¡stu.';
$('checkPhotoAnalysisStatus').innerHTML=`<b>OrientaÄnÃ­ vÃ½sledek: ${esc(resultLabel)}</b><br>Jistota: ${esc(certainty)}<br>${observations.map(esc).join('<br>')}${limits.length?'<br><br>OmezenÃ­: '+limits.map(esc).join('; '):''}${recommendation?'<br><br>'+esc(recommendation):''}<br><small>${esc(disclaimer)}</small>`;
if(value==='nelze_posoudit'&&observations.length===0&&limits.length===0&&!recommendation){
 const rawLevel=pick('level','mezerovitost','brood_pattern','broodPattern','pattern','brood_gappiness','gappiness','brood_quality');
 const rawSummary=pick('summary','doporuceni','recommendation','advice','next_steps');
 $('checkPhotoAnalysisStatus').innerHTML+=`<br><small>Diagnostika serveru: pole ${esc(Object.keys(a).join(', ')||'Å¾Ã¡dnÃ¡')}. Hodnota level: ${esc(rawLevel===null?'prÃ¡zdnÃ¡':typeof rawLevel==='object'?JSON.stringify(rawLevel):String(rawLevel))}. Summary: ${esc(rawSummary===null?'prÃ¡zdnÃ©':typeof rawSummary==='object'?JSON.stringify(rawSummary):String(rawSummary))}.</small>`;
}}catch(e){checkPhotoAssessment=null;$('checkPhotoAnalysisStatus').textContent='AnalÃ½za se nezdaÅila: '+(e.message||e)}
 finally{button.disabled=false;button.textContent='Vyhodnotit fotografii'}
}

// ---- Mezerovitost plodu: offline analÃ½za v telefonu (jen plodovÃ¡ plocha) ----
function broodClassify(pct){
  if(pct===null||pct===undefined||isNaN(pct)) return '';
  if(pct<8) return 'NÃ­zkÃ¡';
  if(pct<15) return 'NÃ­zkÃ¡';
  if(pct<25) return 'StÅednÃ­';
  return 'VysokÃ¡';
}
function broodAdvice(pct){
  if(pct<8) return 'VÃ½bornÃ¡ â kompaktnÃ­ plod, mladÃ¡ kvalitnÃ­ matka.';
  if(pct<15) return 'DobrÃ¡ â bÄÅ¾nÃ¡ mezerovitost, nenÃ­ tÅeba zÃ¡sah.';
  if(pct<25) return 'MezerovitÃ¡ â sleduj, zapiÅ¡, kontrola znovu za 14 dnÃ­.';
  if(pct<40) return 'SilnÄ mezerovitÃ¡ â podezÅenÃ­ na starou/Å¡patnou matku, nemoc, hlad. DÅ¯kladnÃ¡ kontrola.';
  return 'KritickÃ¡ â okamÅ¾itÃ¡ dÅ¯kladnÃ¡ kontrola plÃ¡stu, matky a zdravotnÃ­ho stavu.';
}
function drawBroodCanvas(){
  const cv=$('broodCanvas'); if(!cv||!broodLastImage) return;
  const ctx=cv.getContext('2d'); cv.width=broodLastImage.width; cv.height=broodLastImage.height;
  ctx.drawImage(broodLastImage,0,0);
  if(broodShowMask && broodLocalAssessment){
    const img=ctx.getImageData(0,0,cv.width,cv.height), d=img.data, th=Number($('broodThreshold').value);
    const r=broodArea||{x:0,y:0,w:cv.width,h:cv.height};
    for(let y=Math.round(r.y);y<Math.round(r.y+r.h);y++) for(let x=Math.round(r.x);x<Math.round(r.x+r.w);x++){
      const i=(y*cv.width+x)*4, gray=(d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114);
      // tmavÃ¡ = mezera (ÄervenÃ¡), svÄtlÃ¡ = zavÃ­ÄkovanÃ½ plod (zelenÃ¡), velmi svÄtlÃ¡ lesklÃ¡ = otevÅenÃ½ plod (Å¾lutÃ¡)
      if(gray<th){ d[i]=220; d[i+1]=60; d[i+1]=60; d[i]=220; d[i+2]=60; }
      else if(gray>205){ d[i]=240; d[i+1]=210; d[i+2]=40; }
      else { d[i]=70; d[i+1]=180; d[i+2]=90; }
      d[i+3]=150;
    }
    ctx.putImageData(img,0,0);
  }
  if(broodArea){ ctx.strokeStyle='#ffbd16'; ctx.lineWidth=3; ctx.setLineDash([10,6]); ctx.strokeRect(broodArea.x,broodArea.y,broodArea.w,broodArea.h); ctx.setLineDash([]); ctx.fillStyle='#ffbd16'; ctx.font='bold 15px system-ui'; ctx.fillText('PlodovÃ¡ plocha', broodArea.x+6, broodArea.y+20); }
}
function analyzeBroodLocal(){
  if(!broodLastImage){ alert('Nejprve vyberte fotografii plodu.'); return; }
  const cv=document.createElement('canvas'); cv.width=broodLastImage.width; cv.height=broodLastImage.height;
  const ctx=cv.getContext('2d'); ctx.drawImage(broodLastImage,0,0);
  const th=Number($('broodThreshold').value);
  const r=broodArea||{x:0,y:0,w:cv.width,h:cv.height};
  const img=ctx.getImageData(Math.round(r.x),Math.round(r.y),Math.round(r.w),Math.round(r.h)), d=img.data;
  let capped=0, gap=0, open=0;
  for(let i=0;i<d.length;i+=4){ const gray=d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114; if(gray<th) gap++; else if(gray>205) open++; else capped++; }
  const denom=capped+gap;
  const pct=denom? (gap/denom*100):0;
  const cls=broodClassify(pct);
  broodLocalAssessment={mezerovitost_pct:Math.round(pct*10)/10, mezerovitost:cls, zavickovany_pct:Math.round(capped/Math.max(1,capped+gap+open)*1000)/10, otevreny_pct:Math.round(open/Math.max(1,capped+gap+open)*1000)/10, jistota: broodArea?'vÃ½bÄr plodovÃ© plochy':'celÃ¡ fotka â mÃ©nÄ pÅesnÃ©', doporuceni: broodAdvice(pct), zdroj:'offline-v-telefonu'};
  $('checkBroodPercent').value=broodLocalAssessment.mezerovitost_pct;
  $('checkBroodPattern').value=cls;
  // slouÄit s online posouzenÃ­m, offline mÃ¡ pÅednost v % a klasifikaci
  checkPhotoAssessment={...(checkPhotoAssessment||{}), ...broodLocalAssessment};
  $('broodLocalStatus').innerHTML=`<b>Mezerovitost: ${broodLocalAssessment.mezerovitost_pct} % â ${cls}</b><br>${broodAdvice(pct)}<br><small>${broodArea?'PoÄÃ­tÃ¡no jen v oznaÄenÃ© plodovÃ© ploÅ¡e.':'Bez vÃ½bÄru plodovÃ© plochy je vÃ½sledek mÃ©nÄ pÅesnÃ½ â oznaÄ obdÃ©lnÃ­k na fotce.'} OtevÅenÃ½ plod se do mezerovitosti nepoÄÃ­tÃ¡.</small>`;
  $('broodLocalBars').innerHTML=`<div class="small">ZavÃ­ÄkovanÃ½ plod ${broodLocalAssessment.zavickovany_pct} %</div><div class="broodbar"><span style="width:${broodLocalAssessment.zavickovany_pct}%;background:#4caf50"></span></div><div class="small">Mezery ${broodLocalAssessment.mezerovitost_pct} %</div><div class="broodbar"><span style="width:${broodLocalAssessment.mezerovitost_pct}%;background:#e53935"></span></div><div class="small">OtevÅenÃ½ plod ${broodLocalAssessment.otevreny_pct} %</div><div class="broodbar"><span style="width:${broodLocalAssessment.otevreny_pct}%;background:#ffca28"></span></div>`;
  drawBroodCanvas();
}
function setupBroodCanvas(){
  const cv=$('broodCanvas'); if(!cv) return;
  let start=null;
  const pos=e=>{ const r=cv.getBoundingClientRect(); const t=e.touches?e.touches[0]:e; return {x:(t.clientX-r.left)*cv.width/r.width, y:(t.clientY-r.top)*cv.height/r.height}; };
  const down=e=>{ e.preventDefault(); start=pos(e); };
  const move=e=>{ if(!start) return; e.preventDefault(); const p=pos(e); broodArea={x:Math.min(start.x,p.x), y:Math.min(start.y,p.y), w:Math.abs(p.x-start.x), h:Math.abs(p.y-start.y)}; drawBroodCanvas(); };
  const up=()=>{ start=null; if(broodArea && (broodArea.w<20||broodArea.h<20)) broodArea=null; drawBroodCanvas(); };
  cv.addEventListener('mousedown',down); cv.addEventListener('mousemove',move); window.addEventListener('mouseup',up);
  cv.addEventListener('touchstart',down,{passive:false}); cv.addEventListener('touchmove',move,{passive:false}); cv.addEventListener('touchend',up);
}

function renderColonies(){$('colonyList').innerHTML=db.colonies.map(c=>`<div class="item"><div><b>${esc(c.name)}</b><div class="muted">${esc(c.type||'Typ neuveden')} Â· ${esc(c.state)}</div><div class="small">Matka: ${esc(c.queenColor||'barva neuvedena')} Â· Kmen: ${esc(c.strain==='JinÃ½ / vlastnÃ­'?(c.strainOther||'vlastnÃ­'):c.strain||'neuveden')}</div><div class="small">${esc(c.notes)}</div></div><button class="btn" type="button" data-edit-col="${esc(c.id)}">Upravit</button></div>`).join('')||'<div class="empty">ZatÃ­m Å¾Ã¡dnÃ¡ vÄelstva.</div>';fillColonySelect()}
function renderChecks(){$('checkList').innerHTML=db.checks.map(c=>{const n=db.colonies.find(x=>x.id===c.colony)?.name||'VÄelstvo';const facts=[c.queenSeen?`Matka: ${c.queenSeen}`:'',c.laying?`Klade: ${c.laying}`:'',c.broodPattern?`Mezerovitost: ${c.broodPattern}`:'',c.broodFrames!==undefined&&c.broodFrames!==''?`Plod: ${c.broodFrames} rÃ¡mkÅ¯`:'',c.storesFrames!==undefined&&c.storesFrames!==''?`ZÃ¡soby: ${c.storesFrames} rÃ¡mkÅ¯`:''].filter(Boolean);return `<div class="item"><div style="min-width:0"><b>${esc(c.date)} Â· ${esc(n)}</b><div><span class="tag">${esc(c.type)}</span></div>${facts.length?`<div class="small">${facts.map(esc).join(' Â· ')}</div>`:''}<div>${esc(c.action)}</div><div class="muted">${esc(c.varroa)} ${esc(c.notes)}</div>${c.photo?`<img src="${c.photo}" alt="Fotografie plodu pÅi kontrole" style="display:block;max-width:220px;max-height:180px;object-fit:contain;border-radius:10px;margin-top:8px">`:''}${c.photoAssessment?`<div class="small"><b>PosouzenÃ­ fotografie:</b> ${c.photoAssessment.mezerovitost_pct!==undefined?esc(c.photoAssessment.mezerovitost_pct)+' % Â· ':''}${esc(c.photoAssessment.mezerovitost||'nelze_posoudit')} Â· jistota: ${esc(c.photoAssessment.jistota||'nÃ­zkÃ¡')}${c.photoAssessment.zdroj?(' Â· '+esc(c.photoAssessment.zdroj)):''}</div>`:''}</div><button class="btn danger" data-del-check="${esc(c.id)}">Smazat</button></div>`}).join('')||'<div class="empty">ZatÃ­m Å¾Ã¡dnÃ© kontroly.</div>'}
function renderForage(){$('forageList').innerHTML=db.forage.map(f=>`<div class="item"><div><b>${esc(f.date)} Â· ${esc(f.plant)}</b><div><span class="tag">${esc(f.radius)}</span><span class="tag">${esc(f.phase)}</span><span class="tag">SnÅ¯Å¡ka: ${esc(f.flow)}</span></div><div class="muted">${esc(f.weather)} ${esc(f.notes)}</div></div><button class="btn danger" data-del-for="${esc(f.id)}">Smazat</button></div>`).join('')||'<div class="empty">ZatÃ­m bez pozorovÃ¡nÃ­ pastvy.</div>'}
function renderDistanceStatus(){
 const el=$('distanceRepairStatus');if(!el)return;
 const report=db.distanceRepairReport;
 const missing=db.parcels.filter(p=>p&&String(p.dist??'').trim()===''&&p.geometry).length;
 const noGeometry=db.parcels.filter(p=>p&&String(p.dist??'').trim()===''&&!p.geometry).length;
 let msg='';
 if(report&&report.previousRunUnknown){msg='PÅi tÃ©to kontrole nebylo nutnÃ© doplnit dalÅ¡Ã­ vzdÃ¡lenosti. PÅesnÃ½ poÄet doplnÄnÃ½ pÅi prvnÃ­m spuÅ¡tÄnÃ­ pÅedchozÃ­ verze se bohuÅ¾el neuloÅ¾il. Bez geometrie pÅi tÃ©to kontrole: '+report.withoutGeometry+'; neplatnÃ¡ geometrie: '+report.invalidGeometry+'.'}
 else if(report){msg='PÅi poslednÃ­m spuÅ¡tÄnÃ­ novÄ doplnÄna vzdÃ¡lenost u '+report.updated+' pozemkÅ¯ ('+new Date(report.at).toLocaleString('cs-CZ')+'). Bez geometrie pÅi kontrole: '+report.withoutGeometry+'; neplatnÃ¡ geometrie: '+report.invalidGeometry+'.'}
 else{msg='Kontrola vzdÃ¡lenostÃ­ probÄhla. PÅesnÃ½ poÄet doplnÄnÃ½ pÅi pÅedchozÃ­m spuÅ¡tÄnÃ­ se bohuÅ¾el neuloÅ¾il.'}
 msg+=' NynÃ­ chybÃ­ vzdÃ¡lenost u '+missing+' pozemkÅ¯ s geometriÃ­ a u '+noGeometry+' pozemkÅ¯ bez geometrie.';
 el.textContent=msg;
}
function storedDistanceKm(value){
 const n=Number(String(value??'').trim().replace(',','.'));
 if(!Number.isFinite(n)||n<0)return null;
 // LPIS records and new manual records are in km; older manual records may be metres.
 return n>50?n/1000:n;
}
function formatParcelDistance(value){
 const km=storedDistanceKm(value);if(km===null)return '';
 const metres=km*1000;
 return metres<1000?Math.round(metres)+' m':km.toLocaleString('cs-CZ',{maximumFractionDigits:2})+' km';
}
function renderParcels(){
 const q=$('parcelSearch').value.toLowerCase();
 // Return the form to its original location before rebuilding the list.
 const form=$('parcelForm');
 if(form&&parcelFormHome&&form.parentNode!==parcelFormHome){
  if(parcelFormNext&&parcelFormNext.parentNode===parcelFormHome)parcelFormHome.insertBefore(form,parcelFormNext);
  else parcelFormHome.appendChild(form);
  form.classList.add('hidden');
 }
 const rows=db.parcels.filter(p=>JSON.stringify(p).toLowerCase().includes(q));
 $('parcelList').innerHTML=rows.map(p=>`<div class="parcel-entry" data-parcel-entry="${esc(p.id)}"><div class="item"><div><b>${esc(p.code||'Pozemek bez ID')}</b><div class="muted">${esc(p.crop||p.culture||'Plodina neznÃ¡mÃ¡')} Â· ${p.area?esc(p.area)+' ha':'vÃ½mÄra neuvedena'} Â· ${p.dist!==undefined&&p.dist!==null&&String(p.dist)!==''?esc(formatParcelDistance(p.dist)+' od stanoviÅ¡tÄ'):''}</div><span class="tag">${esc(p.status)}</span></div><button class="btn" type="button" data-edit-parcel="${esc(p.id)}">Karta</button></div></div>`).join('')||'<div class="empty">Evidence je prÃ¡zdnÃ¡. Pozemek pÅidejte ruÄnÄ nebo naÄtÄte z LPIS.</div>';
 renderDistanceStatus();
 document.dispatchEvent(new CustomEvent('vcelar:parcels-updated',{detail:{parcels:db.parcels}}));
}
function renderHome(){$('sColonies').textContent=db.colonies.length;$('sChecks').textContent=db.checks.length;$('sParcels').textContent=db.parcels.length;$('sForage').textContent=db.forage.length;const all=[...db.checks.map(x=>({...x,label:'Kontrola Â· '+(db.colonies.find(c=>c.id===x.colony)?.name||'VÄelstvo'),detail:x.type})),...db.forage.map(x=>({...x,label:'Pastva Â· '+x.plant,detail:x.flow})),...(db.harvests||[]).map(x=>({...x,label:'MedobranÃ­ Â· '+(db.colonies.find(c=>c.id===x.colony)?.name||'VÄelstvo'),detail:(x.kg||0)+' kg Â· '+(x.type||'')}))].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,5);$('recent').innerHTML=all.map(x=>`<div class="item"><div><b>${esc(x.date)} Â· ${esc(x.label)}</b><div class="muted">${esc(x.detail)}</div></div></div>`).join('')||'<div class="empty">ZatÃ­m bez zÃ¡znamÅ¯.</div>'}
function fillHarvestColonies(){const s=$('harvestColony');if(!s)return;const old=s.value;s.innerHTML=db.colonies.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');if(old)s.value=old}
function clearHarvest(){['harvestId','harvestKg','harvestFrames','harvestMoisture','harvestSugar','harvestNotes'].forEach(id=>$(id).value='');$('harvestDate').value=today();$('harvestType').value='KvÄtovÃ½';$('harvestPhoto').value='';$('harvestPhotoPreview').innerHTML='';$('cancelHarvest').classList.add('hidden');$('saveHarvest').textContent='UloÅ¾it medobranÃ­'}
function renderHarvest(){if(!$('harvestList'))return;fillHarvestColonies();const year=$('harvestYearFilter').value;const records=(db.harvests||[]).filter(x=>!year||(x.date||'').startsWith(year)).sort((a,b)=>(b.date||'').localeCompare(a.date||''));const years=[...new Set((db.harvests||[]).map(x=>(x.date||'').slice(0,4)).filter(Boolean))].sort().reverse();$('harvestYearFilter').innerHTML='<option value="">VÅ¡echny roky</option>'+years.map(y=>`<option value="${esc(y)}">${esc(y)}</option>`).join('');$('harvestYearFilter').value=year||'';const total=records.reduce((n,x)=>n+(Number(x.kg)||0),0);$('harvestTotalKg').textContent=total.toLocaleString('cs-CZ',{maximumFractionDigits:2})+' kg';$('harvestCount').textContent=records.length;$('harvestFramesTotal').textContent=records.reduce((n,x)=>n+(Number(x.frames)||0),0);$('harvestByColony').innerHTML=db.colonies.map(c=>{const kg=records.filter(x=>x.colony===c.id).reduce((n,x)=>n+(Number(x.kg)||0),0);return `<div class="item"><b>${esc(c.name)}</b><span>${kg.toLocaleString('cs-CZ',{maximumFractionDigits:2})} kg</span></div>`}).join('');$('harvestList').innerHTML=records.map(x=>{const c=db.colonies.find(z=>z.id===x.colony);return `<div class="item"><div style="min-width:0"><b>${esc(x.date)} Â· ${esc(c?.name||'VÄelstvo')}</b><div><span class="tag">${esc(x.type)}</span><span class="tag">${esc(x.kg)} kg</span>${x.frames?`<span class="tag">${esc(x.frames)} rÃ¡mkÅ¯</span>`:''}${x.moisture?`<span class="tag">${esc(x.moisture)} % vody</span>`:''}${x.sugar?`<span class="tag">${esc(x.sugar)} % cukernatost</span>`:''}</div>${x.notes?`<div class="muted">${esc(x.notes)}</div>`:''}${x.photo?`<img src="${x.photo}" alt="Fotografie medobranÃ­" style="display:block;max-width:180px;max-height:130px;object-fit:cover;border-radius:10px;margin-top:8px">`:''}</div><div class="actions"><button class="btn" data-edit-harvest="${esc(x.id)}">Upravit</button><button class="btn danger" data-del-harvest="${esc(x.id)}">Smazat</button></div></div>`}).join('')||'<div class="empty">ZatÃ­m nenÃ­ uloÅ¾enÃ© Å¾Ã¡dnÃ© medobranÃ­.</div>'}
renderAll=()=>{renderColonies();renderChecks();renderForage();renderParcels();renderHarvest();renderHome()};
function ensureDistanceStatus(){
 const section=$('parcels');if(!section||$('distanceRepairStatus'))return;
 const panel=section.querySelector('.panel'),heading=panel?.querySelector('h2');if(!panel||!heading)return;
 const box=document.createElement('div');box.id='distanceRepairStatus';box.className='notice';box.style.margin='10px 0 14px';box.style.border='1px solid #d6a43b';box.setAttribute('role','status');heading.insertAdjacentElement('afterend',box);
}
function clearColony(){['colId','colName','colType','colDate','colNotes','colStrainOther'].forEach(x=>$(x).value='');$('colState').value='AktivnÃ­';$('colQueenColor').value='';$('colStrain').value='';$('colStrainOtherWrap').classList.add('hidden')}
function resetParcelFields(){
 $('pId').value='';
 ['pCode','pDist','pArea','pCulture','pCrop','pFrom','pTo','pVerified','pNotes'].forEach(x=>$(x).value='');
 $('pStatus').value='NeznÃ¡mÃ©';$('pBee').value='NeurÄeno';
 $('deleteParcel').classList.add('hidden');$('parcelHeading').textContent='Karta pozemku';
}
function closeParcelCard(){
 const form=$('parcelForm');
 if(form&&parcelFormHome&&form.parentNode!==parcelFormHome){
  if(parcelFormNext&&parcelFormNext.parentNode===parcelFormHome)parcelFormHome.insertBefore(form,parcelFormNext);
  else parcelFormHome.appendChild(form);
 }
 if(form)form.classList.add('hidden');
 resetParcelFields();
}
function showParcelCard(slot){
 const form=$('parcelForm');
 if(!slot)return;
 slot.appendChild(form);form.classList.remove('hidden');
 form.scrollIntoView({behavior:'smooth',block:'start'});
}
function newParcelCard(){
 resetParcelFields();
 let slot=document.getElementById('parcelNewCardSlot');
 if(!slot){slot=document.createElement('div');slot.id='parcelNewCardSlot';slot.className='parcel-card-slot';$('parcelList').appendChild(slot)}
 showParcelCard(slot);
 $('pCode').focus({preventScroll:true});
}
function clearParcel(){closeParcelCard()}
function editParcel(id){
 const p=db.parcels.find(x=>x.id===id);if(!p)return;
 resetParcelFields();
 $('pId').value=p.id;
 const fields={code:'pCode',area:'pArea',culture:'pCulture',crop:'pCrop',status:'pStatus',from:'pFrom',to:'pTo',bee:'pBee',verified:'pVerified',notes:'pNotes'};
 Object.entries(fields).forEach(([k,v])=>$(v).value=p[k]??'');
 const km=storedDistanceKm(p.dist);$('pDist').value=km===null?'':String(Math.round(km*1000*100)/100);
 $('deleteParcel').classList.remove('hidden');
 $('parcelHeading').textContent='Upravit pozemek '+(p.code||'');
 const entry=[...document.querySelectorAll('[data-parcel-entry]')].find(el=>el.dataset.parcelEntry===String(id));
 if(entry){
  let slot=entry.querySelector('.parcel-card-slot');
  if(!slot){slot=document.createElement('div');slot.className='parcel-card-slot';entry.appendChild(slot)}
  showParcelCard(slot);
 }
}
function wfsStatus(msg,bad=false){$('wfsStatus').className='notice'+(bad?' bad':'');$('wfsStatus').textContent=msg}
function endpoint(){return $('wfsUrl').value.trim().replace(/\?+$/,'')}
function geometryCenter(g){const pts=[];const walk=v=>{if(!Array.isArray(v))return;if(v.length>=2&&typeof v[0]==='number'&&typeof v[1]==='number'){pts.push(v);return}v.forEach(walk)};if(g?.type==='GeometryCollection')(g.geometries||[]).forEach(x=>walk(x.coordinates));else walk(g?.coordinates);if(!pts.length)return null;const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);return [(Math.min(...ys)+Math.max(...ys))/2,(Math.min(...xs)+Math.max(...xs))/2]}
function distance(a,b,c,d){const r=x=>x*Math.PI/180,h=Math.sin(r(c-a)/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(r(d-b)/2)**2;return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h))}
function fillMissingParcelDistances(){
 let updated=0,withoutGeometry=0,invalidGeometry=0;
 for(const parcel of db.parcels){if(!parcel||String(parcel.dist??'').trim()!=='')continue;if(!parcel.geometry){withoutGeometry++;continue}
  const center=geometryCenter(parcel.geometry);
  if(!center||!Number.isFinite(center[0])||!Number.isFinite(center[1])||Math.abs(center[0])>90||Math.abs(center[1])>180){invalidGeometry++;continue}
  const km=distance(SITE.lat,SITE.lon,center[0],center[1]);if(!Number.isFinite(km)){invalidGeometry++;continue}parcel.dist=km.toFixed(2);updated++
 }
 return {updated,withoutGeometry,invalidGeometry};
}
async function init(){
 db=await readDB();
 if(!Array.isArray(db.harvests)){db.harvests=[];await writeDB(structuredClone(db));}
 const distanceRepair=fillMissingParcelDistances();
 if(distanceRepair.updated){db.distanceRepairReport={...distanceRepair,at:new Date().toISOString()};db.updated=new Date().toISOString();await writeDB(structuredClone(db))}
 else if(!db.distanceRepairReport){db.distanceRepairReport={...distanceRepair,at:new Date().toISOString(),previousRunUnknown:true};db.updated=new Date().toISOString();await writeDB(structuredClone(db))}
 $('nav').addEventListener('click',e=>{const b=e.target.closest('button[data-page]');if(b)page(b.dataset.page)});
 $('newColony').onclick=()=>{clearColony();$('colonyForm').scrollIntoView({behavior:'smooth',block:'start'});$('colName').focus({preventScroll:true})};
 $('cancelColony').onclick=clearColony;
 $('colonyList').addEventListener('click',e=>{
  const b=e.target.closest('button[data-edit-col]');if(!b)return;
  const c=db.colonies.find(x=>x.id===b.dataset.editCol);if(!c)return;
  $('colId').value=c.id;$('colName').value=c.name||'';$('colType').value=c.type||'';$('colDate').value=c.date||'';$('colState').value=c.state||'AktivnÃ­';$('colQueenColor').value=c.queenColor||'';$('colStrain').value=c.strain||'';$('colStrainOther').value=c.strainOther||'';$('colStrainOtherWrap').classList.toggle('hidden',$('colStrain').value!=='JinÃ½ / vlastnÃ­');$('colNotes').value=c.notes||'';
  page('colonies');
  requestAnimationFrame(()=>{$('colonyForm').scrollIntoView({behavior:'smooth',block:'start'});$('colName').focus({preventScroll:true})});
 });
 $('colStrain').addEventListener('change',()=>{$('colStrainOtherWrap').classList.toggle('hidden',$('colStrain').value!=='JinÃ½ / vlastnÃ­')});
 $('saveColony').onclick=()=>{
  const c={id:$('colId').value||uid(),name:$('colName').value.trim()||'NovÃ© vÄelstvo',type:$('colType').value,date:$('colDate').value,state:$('colState').value,queenColor:$('colQueenColor').value,strain:$('colStrain').value,strainOther:$('colStrainOther').value.trim(),notes:$('colNotes').value};
  const i=db.colonies.findIndex(x=>x.id===c.id);if(i<0)db.colonies.push(c);else db.colonies[i]={...db.colonies[i],...c};clearColony();save();
 };
 $('checkDate').value=today();$('forDate').value=today();$('harvestDate').value=today();fillHarvestColonies();
 $('checkPhoto').addEventListener('change',async()=>{const file=$('checkPhoto').files[0];$('checkPhotoPreview').innerHTML='';$('checkPhotoAnalysisStatus').textContent='';$('broodLocalStatus').textContent='';$('broodLocalBars').innerHTML='';checkPhotoAssessment=null;broodLocalAssessment=null;broodArea=null;broodLastImage=null;$('checkBroodPattern').value='';if($('checkBroodPercent'))$('checkBroodPercent').value='';$('broodCanvas').style.display='none';if(!file)return;try{const data=await readCheckPhoto(file);$('checkPhotoPreview').innerHTML=`<img src="${data}" alt="NÃ¡hled fotografie plodu" style="max-width:220px;max-height:180px;object-fit:contain;border-radius:10px">`;const img=new Image();img.onload=()=>{broodLastImage=img;$('broodCanvas').style.display='block';drawBroodCanvas();};img.src=data;}catch(e){alert(e.message);$('checkPhoto').value=''}});
  setupBroodCanvas();
  $('broodThreshold').addEventListener('input',()=>{$('broodThresholdVal').textContent=$('broodThreshold').value; if(broodLocalAssessment) analyzeBroodLocal(); else drawBroodCanvas();});
  $('analyzeBroodLocal').onclick=analyzeBroodLocal;
  $('toggleBroodMask').onclick=()=>{broodShowMask=!broodShowMask;$('toggleBroodMask').textContent=broodShowMask?'SkrÃ½t masku':'Zobrazit masku';drawBroodCanvas();};
  $('clearBroodArea').onclick=()=>{broodArea=null;drawBroodCanvas();};
 $('analyzeCheckPhoto').onclick=analyzeCheckPhoto;
 $('saveCheck').onclick=async()=>{if(!db.colonies.length){alert('Nejprve pÅidejte vÄelstvo.');return}let photo='';try{photo=await readCheckPhoto($('checkPhoto').files[0])}catch(e){alert(e.message);return}db.checks.unshift({id:uid(),date:$('checkDate').value||today(),colony:$('checkColony').value,type:$('checkType').value,varroa:$('checkVarroa').value,action:$('checkAction').value,notes:$('checkNotes').value,queenSeen:$('checkQueenSeen').value,laying:$('checkLaying').value,broodPattern:$('checkBroodPattern').value,broodPercent:$('checkBroodPercent')?$('checkBroodPercent').value:'',broodFrames:$('checkBroodFrames').value===''?'':Number($('checkBroodFrames').value),storesFrames:$('checkStoresFrames').value===''?'':Number($('checkStoresFrames').value),photo,photoAssessment:checkPhotoAssessment});['checkVarroa','checkAction','checkNotes','checkBroodFrames','checkStoresFrames'].forEach(x=>$(x).value='');['checkQueenSeen','checkLaying','checkBroodPattern'].forEach(x=>$(x).value='');if($('checkBroodPercent'))$('checkBroodPercent').value='';broodLocalAssessment=null;broodArea=null;broodLastImage=null;if($('broodCanvas'))$('broodCanvas').style.display='none';if($('broodLocalStatus'))$('broodLocalStatus').textContent='';if($('broodLocalBars'))$('broodLocalBars').innerHTML='';$('checkPhoto').value='';$('checkPhotoPreview').innerHTML='';$('checkPhotoAnalysisStatus').textContent='';checkPhotoAssessment=null;save()};
 $('checkList').onclick=e=>{const b=e.target.closest('[data-del-check]');if(b&&confirm('Smazat tento zÃ¡znam kontroly?')){db.checks=db.checks.filter(x=>x.id!==b.dataset.delCheck);save()}};
 $('saveForage').onclick=()=>{if(!$('forPlant').value.trim()){alert('VyplÅte rostlinu nebo plodinu.');return}db.forage.unshift({id:uid(),date:$('forDate').value||today(),radius:$('forRadius').value,plant:$('forPlant').value,phase:$('forPhase').value,flow:$('forFlow').value,weather:$('forWeather').value,notes:$('forNotes').value});['forPlant','forWeather','forNotes'].forEach(x=>$(x).value='');save()};
 $('forageList').onclick=e=>{const b=e.target.closest('[data-del-for]');if(b&&confirm('Smazat pozorovÃ¡nÃ­?')){db.forage=db.forage.filter(x=>x.id!==b.dataset.delFor);save()}};
 $('saveHarvest').onclick=async()=>{if(!db.colonies.length){alert('Nejprve pÅidejte vÄelstvo.');return}const kg=Number($('harvestKg').value);if(!Number.isFinite(kg)||kg<=0){alert('Zadejte mnoÅ¾stvÃ­ medu v kg vÄtÅ¡Ã­ neÅ¾ nula.');return}let photo='';const file=$('harvestPhoto').files[0];if(file){if(!file.type.startsWith('image/')){alert('Vyberte prosÃ­m obrÃ¡zek.');return}try{photo=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>{const img=new Image();img.onload=()=>{const scale=Math.min(1,1200/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/jpeg',.76))};img.onerror=reject;img.src=reader.result};reader.onerror=reject;reader.readAsDataURL(file)})}catch(e){alert('Fotografii se nepodaÅilo naÄÃ­st.');return}}const id=$('harvestId').value||uid(),old=(db.harvests||[]).find(x=>x.id===id);const rec={id,date:$('harvestDate').value||today(),colony:$('harvestColony').value,type:$('harvestType').value,kg,frames:Number($('harvestFrames').value)||0,moisture:$('harvestMoisture').value,sugar:$('harvestSugar').value,notes:$('harvestNotes').value.trim(),photo:photo||old?.photo||''};if(!Array.isArray(db.harvests))db.harvests=[];const i=db.harvests.findIndex(x=>x.id===id);if(i<0)db.harvests.unshift(rec);else db.harvests[i]=rec;clearHarvest();save()};
 $('cancelHarvest').onclick=clearHarvest;$('harvestYearFilter').onchange=renderHarvest;
 $('harvestList').onclick=e=>{const edit=e.target.closest('[data-edit-harvest]'),del=e.target.closest('[data-del-harvest]');if(edit){const x=db.harvests.find(z=>z.id===edit.dataset.editHarvest);if(!x)return;$('harvestId').value=x.id;$('harvestDate').value=x.date||today();$('harvestColony').value=x.colony;$('harvestType').value=x.type||'KvÄtovÃ½';$('harvestKg').value=x.kg??'';$('harvestFrames').value=x.frames??'';$('harvestMoisture').value=x.moisture??'';$('harvestSugar').value=x.sugar??'';$('harvestNotes').value=x.notes||'';$('harvestPhoto').value='';$('harvestPhotoPreview').innerHTML=x.photo?`<img src="${x.photo}" alt="AktuÃ¡lnÃ­ fotografie" style="max-width:180px;max-height:130px;border-radius:10px"><div class="muted">PonechÃ¡ se, pokud nevyberete novou fotografii.</div>`:'';$('cancelHarvest').classList.remove('hidden');$('saveHarvest').textContent='UloÅ¾it zmÄny';$('harvestForm').scrollIntoView({behavior:'smooth',block:'start'})}if(del&&confirm('Opravdu smazat toto medobranÃ­?')){db.harvests=db.harvests.filter(x=>x.id!==del.dataset.delHarvest);save()}};
 parcelFormHome=$('parcelForm').parentNode;parcelFormNext=$('parcelForm').nextSibling;$('parcelForm').classList.add('hidden');
 $('newParcel').onclick=newParcelCard;$('clearParcel').onclick=clearParcel;
 $('saveParcel').onclick=()=>{
  const rawMetres=Number(String($('pDist').value||'').trim().replace(',','.'));
  const distKm=$('pDist').value.trim()===''?'':(Number.isFinite(rawMetres)&&rawMetres>=0?(rawMetres/1000).toFixed(3):'');
  const p={id:$('pId').value||uid(),code:$('pCode').value.trim(),dist:distKm,area:$('pArea').value,culture:$('pCulture').value,crop:$('pCrop').value,status:$('pStatus').value,from:$('pFrom').value,to:$('pTo').value,bee:$('pBee').value,verified:$('pVerified').value,notes:$('pNotes').value};
  if(!p.code&&!p.crop){alert('VyplÅte alespoÅ LPIS ID nebo plodinu.');return}
  if($('pDist').value.trim()!==''&&distKm===''){alert('Zadejte platnou vzdÃ¡lenost v metrech.');return}
  const i=db.parcels.findIndex(x=>x.id===p.id);if(i<0)db.parcels.push(p);else db.parcels[i]={...db.parcels[i],...p};
  closeParcelCard();save();
 };
 $('deleteParcel').onclick=()=>{const id=$('pId').value;if(id&&confirm('Opravdu smazat pozemek?')){db.parcels=db.parcels.filter(x=>x.id!==id);closeParcelCard();save()}};
 $('parcelSearch').oninput=renderParcels;$('parcelList').onclick=e=>{const b=e.target.closest('[data-edit-parcel]');if(b)editParcel(b.dataset.editParcel)};
 $('openCaps').onclick=()=>window.open(endpoint()+'?service=WFS&request=GetCapabilities','_blank');
 $('getCaps').onclick=async()=>{if(!navigator.onLine){wfsStatus('Jste offline. Pro naÄtenÃ­ LPIS se pÅipojte k internetu.',true);return}wfsStatus('NaÄÃ­tÃ¡m seznam vrstevâ¦');try{const u=new URL(endpoint());u.searchParams.set('service','WFS');u.searchParams.set('request','GetCapabilities');const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const xml=new DOMParser().parseFromString(await r.text(),'text/xml');if(xml.querySelector('parsererror'))throw Error('NeplatnÃ© XML');const names=[...xml.getElementsByTagNameNS('*','FeatureType')].map(n=>({name:n.getElementsByTagNameNS('*','Name')[0]?.textContent,title:n.getElementsByTagNameNS('*','Title')[0]?.textContent})).filter(x=>x.name);$('wfsLayer').innerHTML=names.map(x=>`<option value="${esc(x.name)}">${esc(x.title||x.name)} (${esc(x.name)})</option>`).join('');if(!names.length)throw Error('SluÅ¾ba nevrÃ¡tila Å¾Ã¡dnÃ© vrstvy');wfsStatus('SpojenÃ­ navÃ¡zÃ¡no. DostupnÃ½ch vrstev: '+names.length+'. Vyberte vrstvu.')}catch(e){wfsStatus('LPIS se nepodaÅilo naÄÃ­st: '+e.message,true)}};
 $('getFeatures').onclick=async()=>{const layer=$('wfsLayer').value;if(!layer){wfsStatus('NejdÅÃ­ve naÄtÄte a vyberte vrstvu.',true);return}if(!navigator.onLine){wfsStatus('Jste offline. Import LPIS nenÃ­ dostupnÃ½.',true);return}try{const lat=SITE.lat,lon=SITE.lon,dy=5000/111320,dx=5000/(111320*Math.cos(lat*Math.PI/180)),base=new URL(endpoint()),wanted=Math.max(1,Math.min(1000,Number($('wfsLimit').value)||300)),batchSize=50;Object.entries({service:'WFS',version:'1.0.0',request:'GetFeature',typeName:layer,outputFormat:'application/json',srsName:'EPSG:4326',bbox:[lon-dx,lat-dy,lon+dx,lat+dy].join(',')+',EPSG:4326'}).forEach(([k,v])=>base.searchParams.set(k,v));let offset=0,features=[],previous='';wfsStatus('NaÄÃ­tÃ¡m LPIS po malÃ½ch dÃ¡vkÃ¡châ¦');while(offset<wanted){const u=new URL(base),limit=Math.min(batchSize,wanted-offset);u.searchParams.set('maxFeatures',String(limit));u.searchParams.set('startIndex',String(offset));const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const data=await r.json();if(!Array.isArray(data.features))throw Error('SluÅ¾ba nevrÃ¡tila GeoJSON');if(!data.features.length)break;const sig=JSON.stringify(data.features.slice(0,2).map(f=>f.id||f.properties));if(offset&&sig===previous)throw Error('LPIS opakuje stejnou dÃ¡vku; import zastaven');previous=sig;features.push(...data.features.slice(0,wanted-features.length));offset+=data.features.length;wfsStatus('NaÄteno '+features.length+' / '+wanted+' prvkÅ¯â¦');if(data.features.length<limit)break}
 let added=0,inside=0,duplicates=0,outside=0,without=0;for(const f of features){const center=geometryCenter(f.geometry);if(!center){without++;continue}const km=distance(SITE.lat,SITE.lon,center[0],center[1]);if(km>5){outside++;continue}inside++;const a=f.properties||{},code=a.idDpb||a.ID_DPB||a.zkracenyKod||a.KOD_DPB||a.kod||a.KOD||f.id||a.id||a.ID||'',sourceKey=String(code||JSON.stringify(f.geometry||{}));const old=db.parcels.find(p=>p.sourceKey===sourceKey);if(old){duplicates++;if(f.geometry&&!old.geometry){old.geometry=f.geometry;old.attributes=a}continue}let area=a.vymera??a.VYMERA??a.vymeraHa??a.VYMERA_HA??'';if(typeof area==='string')area=area.trim().replace(',','.');let num=Number(area);if(Number.isFinite(num)&&num>10000)num/=10000;const culture=a.kultura||a.KULTURA||a.druhPozemku||a.DRUH_POZEMKU||'';db.parcels.push({id:uid(),code:String(code||'LPIS '+(db.parcels.length+1)),dist:km.toFixed(2),area:Number.isFinite(num)&&num>0?String(num):'',culture:String(culture),crop:'',status:'LPIS â hranice',from:'',to:'',bee:'NeurÄeno',verified:'',notes:'Import z veÅejnÃ© LPIS WFS. Plodina a kvetenÃ­ nejsou potvrzeny.',geometry:f.geometry,sourceKey,attributes:a});added++}
 if(added||duplicates)save();wfsStatus('LPIS naÄteno: '+features.length+' prvkÅ¯. V okruhu 5 km: '+inside+', novÄ uloÅ¾eno: '+added+', jiÅ¾ evidovÃ¡no: '+duplicates+', mimo okruh: '+outside+', bez geometrie: '+without+'.');}catch(e){wfsStatus('NaÄtenÃ­ LPIS selhalo: '+e.message+'. JiÅ¾ uloÅ¾enÃ¡ data zÅ¯stÃ¡vajÃ­ zachovÃ¡na.',true)}};
 $('export').onclick=async()=>{try{await saveQueue;const json=JSON.stringify({app:'VÄelaÅ â Osek',version:2,exported:new Date().toISOString(),site:SITE,data:db},null,2),name='vcelar-osek-zaloha-'+today()+'.json',blob=new Blob([json],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);$('backupStatus').textContent='ZÃ¡loha pÅipravena ke staÅ¾enÃ­: '+name}catch(e){$('backupStatus').textContent='Export se nepodaÅil: '+e.message}};
 $('importFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const obj=JSON.parse(await f.text()),d=obj.data||obj;if(!Array.isArray(d.colonies)||!Array.isArray(d.checks)||!Array.isArray(d.parcels)||!Array.isArray(d.forage))throw Error('Soubor nemÃ¡ sprÃ¡vnou strukturu');if(!Array.isArray(d.harvests))d.harvests=[];if(!confirm('Import nahradÃ­ souÄasnÃ¡ data v tomto telefonu. PokraÄovat?'))return;db=d;await writeDB(structuredClone(db));renderAll();$('backupStatus').textContent='ZÃ¡loha byla ÃºspÄÅ¡nÄ importovÃ¡na.'}catch(err){$('backupStatus').textContent='Import se nezdaÅil: '+err.message}e.target.value=''};
 $('resetData').onclick=()=>{alert('MazÃ¡nÃ­ dat je v tÃ©to verzi z bezpeÄnostnÃ­ch dÅ¯vodÅ¯ vypnutÃ©.');};
 function net(){const on=navigator.onLine;$('net').textContent=on?'Aplikace pÅipravena Â· online':'Offline reÅ¾im Â· data v telefonu';$('net').classList.toggle('no',!on)}window.addEventListener('online',net);window.addEventListener('offline',net);net();
 if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
 ensureDistanceStatus();renderAll();
}
init().catch(e=>{console.error(e);alert('Aplikaci se nepodaÅilo spustit: '+(e.message||e))});
