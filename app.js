'use strict';
/* Včelař – Osek | bezpečné ukládání do IndexedDB */
const SITE={name:'TORENO, s.r.o., Osek 489',lat:49.7804535,lon:13.5998565};
const KEY='vcelarOsek.data.v2',DB_NAME='vcelarOsekDB',DB_STORE='appData';
const $=id=>document.getElementById(id);
const today=()=>new Date().toISOString().slice(0,10);
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const seed=()=>({colonies:[1,2,3,4].map(n=>({id:'seed'+n,name:'Úl '+n,type:'Adamec 11 rámků',date:'',state:'Aktivní',queenColor:'',strain:'',strainOther:'',notes:''})),checks:[],forage:[],parcels:[],harvests:[],updated:new Date().toISOString()});
let db,saveQueue=Promise.resolve();
let renderAll=()=>{};
let parcelFormHome=null,parcelFormNext=null;
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(DB_STORE))r.result.createObjectStore(DB_STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||Error('Nelze otevřít IndexedDB'))})}
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
 saveQueue=saveQueue.then(async()=>{const idb=await openDB();await new Promise((resolve,reject)=>{const tx=idb.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(snapshot,KEY);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Uložení selhalo'))});idb.close()});
 return saveQueue
}
function save(){db.updated=new Date().toISOString();const snapshot=structuredClone(db);writeDB(snapshot).catch(e=>{console.error(e);alert('Uložení do telefonu se nezdařilo: '+(e.message||e)+'. Data nemažte; exportujte zálohu.')});renderAll()}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function page(id){document.querySelectorAll('.page').forEach(x=>x.classList.toggle('hidden',x.id!==id));document.querySelectorAll('#nav button').forEach(x=>x.classList.toggle('active',x.dataset.page===id));if(id==='checks')fillColonySelect()}
function fillColonySelect(){const s=$('checkColony'),old=s.value;s.innerHTML=db.colonies.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');if(old)s.value=old}
function renderColonies(){$('colonyList').innerHTML=db.colonies.map(c=>`<div class="item"><div><b>${esc(c.name)}</b><div class="muted">${esc(c.type||'Typ neuveden')} · ${esc(c.state)}</div><div class="small">Matka: ${esc(c.queenColor||'barva neuvedena')} · Kmen: ${esc(c.strain==='Jiný / vlastní'?(c.strainOther||'vlastní'):c.strain||'neuveden')}</div><div class="small">${esc(c.notes)}</div></div><button class="btn" type="button" data-edit-col="${esc(c.id)}">Upravit</button></div>`).join('')||'<div class="empty">Zatím žádná včelstva.</div>';fillColonySelect()}
function renderChecks(){$('checkList').innerHTML=db.checks.map(c=>{const n=db.colonies.find(x=>x.id===c.colony)?.name||'Včelstvo';return `<div class="item"><div><b>${esc(c.date)} · ${esc(n)}</b><div><span class="tag">${esc(c.type)}</span></div><div>${esc(c.action)}</div><div class="muted">${esc(c.varroa)} ${esc(c.notes)}</div></div><button class="btn danger" data-del-check="${esc(c.id)}">Smazat</button></div>`}).join('')||'<div class="empty">Zatím žádné kontroly.</div>'}
function renderForage(){$('forageList').innerHTML=db.forage.map(f=>`<div class="item"><div><b>${esc(f.date)} · ${esc(f.plant)}</b><div><span class="tag">${esc(f.radius)}</span><span class="tag">${esc(f.phase)}</span><span class="tag">Snůška: ${esc(f.flow)}</span></div><div class="muted">${esc(f.weather)} ${esc(f.notes)}</div></div><button class="btn danger" data-del-for="${esc(f.id)}">Smazat</button></div>`).join('')||'<div class="empty">Zatím bez pozorování pastvy.</div>'}
function renderDistanceStatus(){
 const el=$('distanceRepairStatus');if(!el)return;
 const report=db.distanceRepairReport;
 const missing=db.parcels.filter(p=>p&&String(p.dist??'').trim()===''&&p.geometry).length;
 const noGeometry=db.parcels.filter(p=>p&&String(p.dist??'').trim()===''&&!p.geometry).length;
 let msg='';
 if(report&&report.previousRunUnknown){msg='Při této kontrole nebylo nutné doplnit další vzdálenosti. Přesný počet doplněný při prvním spuštění předchozí verze se bohužel neuložil. Bez geometrie při této kontrole: '+report.withoutGeometry+'; neplatná geometrie: '+report.invalidGeometry+'.'}
 else if(report){msg='Při posledním spuštění nově doplněna vzdálenost u '+report.updated+' pozemků ('+new Date(report.at).toLocaleString('cs-CZ')+'). Bez geometrie při kontrole: '+report.withoutGeometry+'; neplatná geometrie: '+report.invalidGeometry+'.'}
 else{msg='Kontrola vzdáleností proběhla. Přesný počet doplněný při předchozím spuštění se bohužel neuložil.'}
 msg+=' Nyní chybí vzdálenost u '+missing+' pozemků s geometrií a u '+noGeometry+' pozemků bez geometrie.';
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
 $('parcelList').innerHTML=rows.map(p=>`<div class="parcel-entry" data-parcel-entry="${esc(p.id)}"><div class="item"><div><b>${esc(p.code||'Pozemek bez ID')}</b><div class="muted">${esc(p.crop||p.culture||'Plodina neznámá')} · ${p.area?esc(p.area)+' ha':'výměra neuvedena'} · ${p.dist!==undefined&&p.dist!==null&&String(p.dist)!==''?esc(formatParcelDistance(p.dist)+' od stanoviště'):''}</div><span class="tag">${esc(p.status)}</span></div><button class="btn" type="button" data-edit-parcel="${esc(p.id)}">Karta</button></div></div>`).join('')||'<div class="empty">Evidence je prázdná. Pozemek přidejte ručně nebo načtěte z LPIS.</div>';
 renderDistanceStatus();
 document.dispatchEvent(new CustomEvent('vcelar:parcels-updated',{detail:{parcels:db.parcels}}));
}
function renderHome(){$('sColonies').textContent=db.colonies.length;$('sChecks').textContent=db.checks.length;$('sParcels').textContent=db.parcels.length;$('sForage').textContent=db.forage.length;const all=[...db.checks.map(x=>({...x,label:'Kontrola · '+(db.colonies.find(c=>c.id===x.colony)?.name||'Včelstvo'),detail:x.type})),...db.forage.map(x=>({...x,label:'Pastva · '+x.plant,detail:x.flow})),...(db.harvests||[]).map(x=>({...x,label:'Medobraní · '+(db.colonies.find(c=>c.id===x.colony)?.name||'Včelstvo'),detail:(x.kg||0)+' kg · '+(x.type||'')}))].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,5);$('recent').innerHTML=all.map(x=>`<div class="item"><div><b>${esc(x.date)} · ${esc(x.label)}</b><div class="muted">${esc(x.detail)}</div></div></div>`).join('')||'<div class="empty">Zatím bez záznamů.</div>'}
function fillHarvestColonies(){const s=$('harvestColony');if(!s)return;const old=s.value;s.innerHTML=db.colonies.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');if(old)s.value=old}
function clearHarvest(){['harvestId','harvestKg','harvestFrames','harvestMoisture','harvestSugar','harvestNotes'].forEach(id=>$(id).value='');$('harvestDate').value=today();$('harvestType').value='Květový';$('harvestPhoto').value='';$('harvestPhotoPreview').innerHTML='';$('cancelHarvest').classList.add('hidden');$('saveHarvest').textContent='Uložit medobraní'}
function renderHarvest(){if(!$('harvestList'))return;fillHarvestColonies();const year=$('harvestYearFilter').value;const records=(db.harvests||[]).filter(x=>!year||(x.date||'').startsWith(year)).sort((a,b)=>(b.date||'').localeCompare(a.date||''));const years=[...new Set((db.harvests||[]).map(x=>(x.date||'').slice(0,4)).filter(Boolean))].sort().reverse();$('harvestYearFilter').innerHTML='<option value="">Všechny roky</option>'+years.map(y=>`<option value="${esc(y)}">${esc(y)}</option>`).join('');$('harvestYearFilter').value=year||'';const total=records.reduce((n,x)=>n+(Number(x.kg)||0),0);$('harvestTotalKg').textContent=total.toLocaleString('cs-CZ',{maximumFractionDigits:2})+' kg';$('harvestCount').textContent=records.length;$('harvestFramesTotal').textContent=records.reduce((n,x)=>n+(Number(x.frames)||0),0);$('harvestByColony').innerHTML=db.colonies.map(c=>{const kg=records.filter(x=>x.colony===c.id).reduce((n,x)=>n+(Number(x.kg)||0),0);return `<div class="item"><b>${esc(c.name)}</b><span>${kg.toLocaleString('cs-CZ',{maximumFractionDigits:2})} kg</span></div>`}).join('');$('harvestList').innerHTML=records.map(x=>{const c=db.colonies.find(z=>z.id===x.colony);return `<div class="item"><div style="min-width:0"><b>${esc(x.date)} · ${esc(c?.name||'Včelstvo')}</b><div><span class="tag">${esc(x.type)}</span><span class="tag">${esc(x.kg)} kg</span>${x.frames?`<span class="tag">${esc(x.frames)} rámků</span>`:''}${x.moisture?`<span class="tag">${esc(x.moisture)} % vody</span>`:''}${x.sugar?`<span class="tag">${esc(x.sugar)} % cukernatost</span>`:''}</div>${x.notes?`<div class="muted">${esc(x.notes)}</div>`:''}${x.photo?`<img src="${x.photo}" alt="Fotografie medobraní" style="display:block;max-width:180px;max-height:130px;object-fit:cover;border-radius:10px;margin-top:8px">`:''}</div><div class="actions"><button class="btn" data-edit-harvest="${esc(x.id)}">Upravit</button><button class="btn danger" data-del-harvest="${esc(x.id)}">Smazat</button></div></div>`}).join('')||'<div class="empty">Zatím není uložené žádné medobraní.</div>'}
renderAll=()=>{renderColonies();renderChecks();renderForage();renderParcels();renderHarvest();renderHome()};
function ensureDistanceStatus(){
 const section=$('parcels');if(!section||$('distanceRepairStatus'))return;
 const panel=section.querySelector('.panel'),heading=panel?.querySelector('h2');if(!panel||!heading)return;
 const box=document.createElement('div');box.id='distanceRepairStatus';box.className='notice';box.style.margin='10px 0 14px';box.style.border='1px solid #d6a43b';box.setAttribute('role','status');heading.insertAdjacentElement('afterend',box);
}
function clearColony(){['colId','colName','colType','colDate','colNotes','colStrainOther'].forEach(x=>$(x).value='');$('colState').value='Aktivní';$('colQueenColor').value='';$('colStrain').value='';$('colStrainOtherWrap').classList.add('hidden')}
function resetParcelFields(){
 $('pId').value='';
 ['pCode','pDist','pArea','pCulture','pCrop','pFrom','pTo','pVerified','pNotes'].forEach(x=>$(x).value='');
 $('pStatus').value='Neznámé';$('pBee').value='Neurčeno';
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
  const km=distance(SITE.lat,SITE.lon,center[0],center[1]);if(!Number.isFinite(km)){invalidGeometry++;continue}parcel.dist=km.toFixed(2);updated++;
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
  $('colId').value=c.id;$('colName').value=c.name||'';$('colType').value=c.type||'';$('colDate').value=c.date||'';$('colState').value=c.state||'Aktivní';$('colQueenColor').value=c.queenColor||'';$('colStrain').value=c.strain||'';$('colStrainOther').value=c.strainOther||'';$('colStrainOtherWrap').classList.toggle('hidden',$('colStrain').value!=='Jiný / vlastní');$('colNotes').value=c.notes||'';
  page('colonies');
  requestAnimationFrame(()=>{$('colonyForm').scrollIntoView({behavior:'smooth',block:'start'});$('colName').focus({preventScroll:true})});
 });
 $('colStrain').addEventListener('change',()=>{$('colStrainOtherWrap').classList.toggle('hidden',$('colStrain').value!=='Jiný / vlastní')});
 $('saveColony').onclick=()=>{
  const c={id:$('colId').value||uid(),name:$('colName').value.trim()||'Nové včelstvo',type:$('colType').value,date:$('colDate').value,state:$('colState').value,queenColor:$('colQueenColor').value,strain:$('colStrain').value,strainOther:$('colStrainOther').value.trim(),notes:$('colNotes').value};
  const i=db.colonies.findIndex(x=>x.id===c.id);if(i<0)db.colonies.push(c);else db.colonies[i]={...db.colonies[i],...c};clearColony();save();
 };
 $('checkDate').value=today();$('forDate').value=today();$('harvestDate').value=today();fillHarvestColonies();
 $('saveCheck').onclick=()=>{if(!db.colonies.length){alert('Nejprve přidejte včelstvo.');return}db.checks.unshift({id:uid(),date:$('checkDate').value||today(),colony:$('checkColony').value,type:$('checkType').value,varroa:$('checkVarroa').value,action:$('checkAction').value,notes:$('checkNotes').value});['checkVarroa','checkAction','checkNotes'].forEach(x=>$(x).value='');save()};
 $('checkList').onclick=e=>{const b=e.target.closest('[data-del-check]');if(b&&confirm('Smazat tento záznam kontroly?')){db.checks=db.checks.filter(x=>x.id!==b.dataset.delCheck);save()}};
 $('saveForage').onclick=()=>{if(!$('forPlant').value.trim()){alert('Vyplňte rostlinu nebo plodinu.');return}db.forage.unshift({id:uid(),date:$('forDate').value||today(),radius:$('forRadius').value,plant:$('forPlant').value,phase:$('forPhase').value,flow:$('forFlow').value,weather:$('forWeather').value,notes:$('forNotes').value});['forPlant','forWeather','forNotes'].forEach(x=>$(x).value='');save()};
 $('forageList').onclick=e=>{const b=e.target.closest('[data-del-for]');if(b&&confirm('Smazat pozorování?')){db.forage=db.forage.filter(x=>x.id!==b.dataset.delFor);save()}};
 $('saveHarvest').onclick=async()=>{if(!db.colonies.length){alert('Nejprve přidejte včelstvo.');return}const kg=Number($('harvestKg').value);if(!Number.isFinite(kg)||kg<=0){alert('Zadejte množství medu v kg větší než nula.');return}let photo='';const file=$('harvestPhoto').files[0];if(file){if(!file.type.startsWith('image/')){alert('Vyberte prosím obrázek.');return}try{photo=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>{const img=new Image();img.onload=()=>{const scale=Math.min(1,1200/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/jpeg',.76))};img.onerror=reject;img.src=reader.result};reader.onerror=reject;reader.readAsDataURL(file)})}catch(e){alert('Fotografii se nepodařilo načíst.');return}}const id=$('harvestId').value||uid(),old=(db.harvests||[]).find(x=>x.id===id);const rec={id,date:$('harvestDate').value||today(),colony:$('harvestColony').value,type:$('harvestType').value,kg,frames:Number($('harvestFrames').value)||0,moisture:$('harvestMoisture').value,sugar:$('harvestSugar').value,notes:$('harvestNotes').value.trim(),photo:photo||old?.photo||''};if(!Array.isArray(db.harvests))db.harvests=[];const i=db.harvests.findIndex(x=>x.id===id);if(i<0)db.harvests.unshift(rec);else db.harvests[i]=rec;clearHarvest();save()};
 $('cancelHarvest').onclick=clearHarvest;$('harvestYearFilter').onchange=renderHarvest;
 $('harvestList').onclick=e=>{const edit=e.target.closest('[data-edit-harvest]'),del=e.target.closest('[data-del-harvest]');if(edit){const x=db.harvests.find(z=>z.id===edit.dataset.editHarvest);if(!x)return;$('harvestId').value=x.id;$('harvestDate').value=x.date||today();$('harvestColony').value=x.colony;$('harvestType').value=x.type||'Květový';$('harvestKg').value=x.kg??'';$('harvestFrames').value=x.frames??'';$('harvestMoisture').value=x.moisture??'';$('harvestSugar').value=x.sugar??'';$('harvestNotes').value=x.notes||'';$('harvestPhoto').value='';$('harvestPhotoPreview').innerHTML=x.photo?`<img src="${x.photo}" alt="Aktuální fotografie" style="max-width:180px;max-height:130px;border-radius:10px"><div class="muted">Ponechá se, pokud nevyberete novou fotografii.</div>`:'';$('cancelHarvest').classList.remove('hidden');$('saveHarvest').textContent='Uložit změny';$('harvestForm').scrollIntoView({behavior:'smooth',block:'start'})}if(del&&confirm('Opravdu smazat toto medobraní?')){db.harvests=db.harvests.filter(x=>x.id!==del.dataset.delHarvest);save()}};
 parcelFormHome=$('parcelForm').parentNode;parcelFormNext=$('parcelForm').nextSibling;$('parcelForm').classList.add('hidden');
 $('newParcel').onclick=newParcelCard;$('clearParcel').onclick=clearParcel;
 $('saveParcel').onclick=()=>{
  const rawMetres=Number(String($('pDist').value||'').trim().replace(',','.'));
  const distKm=$('pDist').value.trim()===''?'':(Number.isFinite(rawMetres)&&rawMetres>=0?(rawMetres/1000).toFixed(3):'');
  const p={id:$('pId').value||uid(),code:$('pCode').value.trim(),dist:distKm,area:$('pArea').value,culture:$('pCulture').value,crop:$('pCrop').value,status:$('pStatus').value,from:$('pFrom').value,to:$('pTo').value,bee:$('pBee').value,verified:$('pVerified').value,notes:$('pNotes').value};
  if(!p.code&&!p.crop){alert('Vyplňte alespoň LPIS ID nebo plodinu.');return}
  if($('pDist').value.trim()!==''&&distKm===''){alert('Zadejte platnou vzdálenost v metrech.');return}
  const i=db.parcels.findIndex(x=>x.id===p.id);if(i<0)db.parcels.push(p);else db.parcels[i]={...db.parcels[i],...p};
  closeParcelCard();save();
 };
 $('deleteParcel').onclick=()=>{const id=$('pId').value;if(id&&confirm('Opravdu smazat pozemek?')){db.parcels=db.parcels.filter(x=>x.id!==id);closeParcelCard();save()}};
 $('parcelSearch').oninput=renderParcels;$('parcelList').onclick=e=>{const b=e.target.closest('[data-edit-parcel]');if(b)editParcel(b.dataset.editParcel)};
 $('openCaps').onclick=()=>window.open(endpoint()+'?service=WFS&request=GetCapabilities','_blank');
 $('getCaps').onclick=async()=>{if(!navigator.onLine){wfsStatus('Jste offline. Pro načtení LPIS se připojte k internetu.',true);return}wfsStatus('Načítám seznam vrstev…');try{const u=new URL(endpoint());u.searchParams.set('service','WFS');u.searchParams.set('request','GetCapabilities');const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const xml=new DOMParser().parseFromString(await r.text(),'text/xml');if(xml.querySelector('parsererror'))throw Error('Neplatné XML');const names=[...xml.getElementsByTagNameNS('*','FeatureType')].map(n=>({name:n.getElementsByTagNameNS('*','Name')[0]?.textContent,title:n.getElementsByTagNameNS('*','Title')[0]?.textContent})).filter(x=>x.name);$('wfsLayer').innerHTML=names.map(x=>`<option value="${esc(x.name)}">${esc(x.title||x.name)} (${esc(x.name)})</option>`).join('');if(!names.length)throw Error('Služba nevrátila žádné vrstvy');wfsStatus('Spojení navázáno. Dostupných vrstev: '+names.length+'. Vyberte vrstvu.')}catch(e){wfsStatus('LPIS se nepodařilo načíst: '+e.message,true)}};
 $('getFeatures').onclick=async()=>{const layer=$('wfsLayer').value;if(!layer){wfsStatus('Nejdříve načtěte a vyberte vrstvu.',true);return}if(!navigator.onLine){wfsStatus('Jste offline. Import LPIS není dostupný.',true);return}try{const lat=SITE.lat,lon=SITE.lon,dy=5000/111320,dx=5000/(111320*Math.cos(lat*Math.PI/180)),base=new URL(endpoint()),wanted=Math.max(1,Math.min(1000,Number($('wfsLimit').value)||300)),batchSize=50;Object.entries({service:'WFS',version:'1.0.0',request:'GetFeature',typeName:layer,outputFormat:'application/json',srsName:'EPSG:4326',bbox:[lon-dx,lat-dy,lon+dx,lat+dy].join(',')+',EPSG:4326'}).forEach(([k,v])=>base.searchParams.set(k,v));let offset=0,features=[],previous='';wfsStatus('Načítám LPIS po malých dávkách…');while(offset<wanted){const u=new URL(base),limit=Math.min(batchSize,wanted-offset);u.searchParams.set('maxFeatures',String(limit));u.searchParams.set('startIndex',String(offset));const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const data=await r.json();if(!Array.isArray(data.features))throw Error('Služba nevrátila GeoJSON');if(!data.features.length)break;const sig=JSON.stringify(data.features.slice(0,2).map(f=>f.id||f.properties));if(offset&&sig===previous)throw Error('LPIS opakuje stejnou dávku; import zastaven');previous=sig;features.push(...data.features.slice(0,wanted-features.length));offset+=data.features.length;wfsStatus('Načteno '+features.length+' / '+wanted+' prvků…');if(data.features.length<limit)break}
 let added=0,inside=0,duplicates=0,outside=0,without=0;for(const f of features){const center=geometryCenter(f.geometry);if(!center){without++;continue}const km=distance(SITE.lat,SITE.lon,center[0],center[1]);if(km>5){outside++;continue}inside++;const a=f.properties||{},code=a.idDpb||a.ID_DPB||a.zkracenyKod||a.KOD_DPB||a.kod||a.KOD||f.id||a.id||a.ID||'',sourceKey=String(code||JSON.stringify(f.geometry||{}));const old=db.parcels.find(p=>p.sourceKey===sourceKey);if(old){duplicates++;if(f.geometry&&!old.geometry){old.geometry=f.geometry;old.attributes=a}continue}let area=a.vymera??a.VYMERA??a.vymeraHa??a.VYMERA_HA??'';if(typeof area==='string')area=area.trim().replace(',','.');let num=Number(area);if(Number.isFinite(num)&&num>10000)num/=10000;const culture=a.kultura||a.KULTURA||a.druhPozemku||a.DRUH_POZEMKU||'';db.parcels.push({id:uid(),code:String(code||'LPIS '+(db.parcels.length+1)),dist:km.toFixed(2),area:Number.isFinite(num)&&num>0?String(num):'',culture:String(culture),crop:'',status:'LPIS – hranice',from:'',to:'',bee:'Neurčeno',verified:'',notes:'Import z veřejné LPIS WFS. Plodina a kvetení nejsou potvrzeny.',geometry:f.geometry,sourceKey,attributes:a});added++}
 if(added||duplicates)save();wfsStatus('LPIS načteno: '+features.length+' prvků. V okruhu 5 km: '+inside+', nově uloženo: '+added+', již evidováno: '+duplicates+', mimo okruh: '+outside+', bez geometrie: '+without+'.');}catch(e){wfsStatus('Načtení LPIS selhalo: '+e.message+'. Již uložená data zůstávají zachována.',true)}};
 $('export').onclick=async()=>{try{await saveQueue;const json=JSON.stringify({app:'Včelař – Osek',version:2,exported:new Date().toISOString(),site:SITE,data:db},null,2),name='vcelar-osek-zaloha-'+today()+'.json',blob=new Blob([json],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);$('backupStatus').textContent='Záloha připravena ke stažení: '+name}catch(e){$('backupStatus').textContent='Export se nepodařil: '+e.message}};
 $('importFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const obj=JSON.parse(await f.text()),d=obj.data||obj;if(!Array.isArray(d.colonies)||!Array.isArray(d.checks)||!Array.isArray(d.parcels)||!Array.isArray(d.forage))throw Error('Soubor nemá správnou strukturu');if(!Array.isArray(d.harvests))d.harvests=[];if(!confirm('Import nahradí současná data v tomto telefonu. Pokračovat?'))return;db=d;await writeDB(structuredClone(db));renderAll();$('backupStatus').textContent='Záloha byla úspěšně importována.'}catch(err){$('backupStatus').textContent='Import se nezdařil: '+err.message}e.target.value=''};
 $('resetData').onclick=()=>{alert('Mazání dat je v této verzi z bezpečnostních důvodů vypnuté.');};
 function net(){const on=navigator.onLine;$('net').textContent=on?'Aplikace připravena · online':'Offline režim · data v telefonu';$('net').classList.toggle('no',!on)}window.addEventListener('online',net);window.addEventListener('offline',net);net();
 if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
 ensureDistanceStatus();renderAll();
}
init().catch(e=>{console.error(e);alert('Aplikaci se nepodařilo spustit: '+(e.message||e))});
