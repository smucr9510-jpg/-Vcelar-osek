'use strict';
const SITE={name:'TORENO, s.r.o., Osek 489',lat:49.7804535,lon:13.5998565};
const KEY='vcelarOsek.data.v2';
const $=id=>document.getElementById(id);const today=()=>new Date().toISOString().slice(0,10);const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const seed=()=>({colonies:[1,2,3,4].map(n=>({id:'seed'+n,name:'Úl '+n,type:'Adamec 11 rámků',date:'',state:'Aktivní',notes:''})),checks:[],forage:[],parcels:[],updated:new Date().toISOString()});
let db;try{db=JSON.parse(localStorage.getItem(KEY)||'null')}catch{db=null}if(!db||!Array.isArray(db.colonies))db=seed();
function save(){db.updated=new Date().toISOString();try{localStorage.setItem(KEY,JSON.stringify(db))}catch(e){alert('Nepodařilo se uložit data. Zkontrolujte volné místo v telefonu.');}renderAll()}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function page(id){document.querySelectorAll('.page').forEach(x=>x.classList.toggle('hidden',x.id!==id));document.querySelectorAll('#nav button').forEach(x=>x.classList.toggle('active',x.dataset.page===id));if(id==='checks')fillColonySelect()}
$('nav').addEventListener('click',e=>{let b=e.target.closest('button[data-page]');if(b)page(b.dataset.page)});
function renderColonies(){ $('colonyList').innerHTML=db.colonies.map(c=>`<div class="item"><div><b>${esc(c.name)}</b><div class="muted">${esc(c.type||'Typ neuveden')} · ${esc(c.state)}</div><div class="small">${esc(c.notes)}</div></div><button class="btn" data-edit-col="${esc(c.id)}">Upravit</button></div>`).join('')||'<div class="empty">Zatím žádná včelstva.</div>';fillColonySelect() }
function fillColonySelect(){let s=$('checkColony'),old=s.value;s.innerHTML=db.colonies.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');if(old)s.value=old}
function clearColony(){['colId','colName','colType','colDate','colNotes'].forEach(x=>$(x).value='');$('colState').value='Aktivní'}
$('newColony').onclick=clearColony;$('cancelColony').onclick=clearColony;
$('colonyList').onclick=e=>{let b=e.target.closest('[data-edit-col]');if(!b)return;let c=db.colonies.find(x=>x.id===b.dataset.editCol);if(!c)return;$('colId').value=c.id;$('colName').value=c.name;$('colType').value=c.type;$('colDate').value=c.date;$('colState').value=c.state;$('colNotes').value=c.notes;page('colonies');$('colName').focus()};
$('saveColony').onclick=()=>{let c={id:$('colId').value||uid(),name:$('colName').value.trim()||'Nové včelstvo',type:$('colType').value,date:$('colDate').value,state:$('colState').value,notes:$('colNotes').value};let i=db.colonies.findIndex(x=>x.id===c.id);if(i<0)db.colonies.push(c);else db.colonies[i]=c;clearColony();save()};
$('checkDate').value=today();$('forDate').value=today();
$('saveCheck').onclick=()=>{if(!db.colonies.length){alert('Nejprve přidejte včelstvo.');return}db.checks.unshift({id:uid(),date:$('checkDate').value||today(),colony:$('checkColony').value,type:$('checkType').value,varroa:$('checkVarroa').value,action:$('checkAction').value,notes:$('checkNotes').value});['checkVarroa','checkAction','checkNotes'].forEach(x=>$(x).value='');save()};
function renderChecks(){$('checkList').innerHTML=db.checks.map(c=>{let n=db.colonies.find(x=>x.id===c.colony)?.name||'Včelstvo';return `<div class="item"><div><b>${esc(c.date)} · ${esc(n)}</b><div><span class="tag">${esc(c.type)}</span></div><div>${esc(c.action)}</div><div class="muted">${esc(c.varroa)} ${esc(c.notes)}</div></div><button class="btn danger" data-del-check="${esc(c.id)}">Smazat</button></div>`}).join('')||'<div class="empty">Zatím žádné kontroly.</div>'}
$('checkList').onclick=e=>{let b=e.target.closest('[data-del-check]');if(b&&confirm('Smazat tento záznam kontroly?')){db.checks=db.checks.filter(x=>x.id!==b.dataset.delCheck);save()}};
$('saveForage').onclick=()=>{if(!$('forPlant').value.trim()){alert('Vyplňte rostlinu nebo plodinu.');return}db.forage.unshift({id:uid(),date:$('forDate').value||today(),radius:$('forRadius').value,plant:$('forPlant').value,phase:$('forPhase').value,flow:$('forFlow').value,weather:$('forWeather').value,notes:$('forNotes').value});['forPlant','forWeather','forNotes'].forEach(x=>$(x).value='');save()};
function renderForage(){$('forageList').innerHTML=db.forage.map(f=>`<div class="item"><div><b>${esc(f.date)} · ${esc(f.plant)}</b><div><span class="tag">${esc(f.radius)}</span><span class="tag">${esc(f.phase)}</span><span class="tag">Snůška: ${esc(f.flow)}</span></div><div class="muted">${esc(f.weather)} ${esc(f.notes)}</div></div><button class="btn danger" data-del-for="${esc(f.id)}">Smazat</button></div>`).join('')||'<div class="empty">Zatím bez pozorování pastvy.</div>'}
$('forageList').onclick=e=>{let b=e.target.closest('[data-del-for]');if(b&&confirm('Smazat pozorování?')){db.forage=db.forage.filter(x=>x.id!==b.dataset.delFor);save()}};
function clearParcel(){['pId','pCode','pDist','pArea','pCulture','pCrop','pFrom','pTo','pVerified','pNotes'].forEach(x=>$(x).value='');$('pStatus').value='Neznámé';$('pBee').value='Neurčeno';$('deleteParcel').classList.add('hidden');$('parcelHeading').textContent='Karta pozemku'}
function editParcel(id){let p=db.parcels.find(x=>x.id===id);if(!p)return;clearParcel();$('pId').value=p.id;let map={code:'pCode',dist:'pDist',area:'pArea',culture:'pCulture',crop:'pCrop',status:'pStatus',from:'pFrom',to:'pTo',bee:'pBee',verified:'pVerified',notes:'pNotes'};Object.entries(map).forEach(([k,v])=>$(v).value=p[k]??'');$('deleteParcel').classList.remove('hidden');$('parcelHeading').textContent='Upravit pozemek '+(p.code||'')}
$('newParcel').onclick=clearParcel;$('clearParcel').onclick=clearParcel;
$('saveParcel').onclick=()=>{let p={id:$('pId').value||uid(),code:$('pCode').value.trim(),dist:$('pDist').value,area:$('pArea').value,culture:$('pCulture').value,crop:$('pCrop').value,status:$('pStatus').value,from:$('pFrom').value,to:$('pTo').value,bee:$('pBee').value,verified:$('pVerified').value,notes:$('pNotes').value};if(!p.code&&!p.crop){alert('Vyplňte alespoň LPIS ID nebo plodinu.');return}let i=db.parcels.findIndex(x=>x.id===p.id);if(i<0)db.parcels.push(p);else db.parcels[i]={...db.parcels[i],...p};clearParcel();save()};
$('deleteParcel').onclick=()=>{let id=$('pId').value;if(id&&confirm('Opravdu smazat pozemek?')){db.parcels=db.parcels.filter(x=>x.id!==id);clearParcel();save()}};
function renderParcels(){let q=$('parcelSearch').value.toLowerCase();let rows=db.parcels.filter(p=>JSON.stringify(p).toLowerCase().includes(q));$('parcelList').innerHTML=rows.map(p=>`<div class="item"><div><b>${esc(p.code||'Pozemek bez ID')}</b><div class="muted">${esc(p.crop||p.culture||'Plodina neznámá')} · ${p.area?esc(p.area)+' ha':'výměra neuvedena'}</div><span class="tag">${esc(p.status)}</span></div><button class="btn" data-edit-parcel="${esc(p.id)}">Karta</button></div>`).join('')||'<div class="empty">Evidence je prázdná. Pozemek přidejte ručně nebo načtěte z LPIS.</div>'}
$('parcelSearch').oninput=renderParcels;$('parcelList').onclick=e=>{let b=e.target.closest('[data-edit-parcel]');if(b)editParcel(b.dataset.editParcel)};
function renderHome(){$('sColonies').textContent=db.colonies.length;$('sChecks').textContent=db.checks.length;$('sParcels').textContent=db.parcels.length;$('sForage').textContent=db.forage.length;let all=[...db.checks.map(x=>({...x,label:'Kontrola · '+(db.colonies.find(c=>c.id===x.colony)?.name||'Včelstvo'),detail:x.type})),...db.forage.map(x=>({...x,label:'Pastva · '+x.plant,detail:x.flow}))].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,5);$('recent').innerHTML=all.map(x=>`<div class="item"><div><b>${esc(x.date)} · ${esc(x.label)}</b><div class="muted">${esc(x.detail)}</div></div></div>`).join('')||'<div class="empty">Zatím bez záznamů.</div>'}
function renderAll(){renderColonies();renderChecks();renderForage();renderParcels();renderHome()}
function wfsStatus(msg,bad=false){$('wfsStatus').className='notice'+(bad?' bad':'');$('wfsStatus').textContent=msg}
function endpoint(){return $('wfsUrl').value.trim().replace(/\?+$/,'')}
$('openCaps').onclick=()=>window.open(endpoint()+'?service=WFS&request=GetCapabilities','_blank');
$('getCaps').onclick=async()=>{if(!navigator.onLine){wfsStatus('Jste offline. Již uložené pozemky fungují; pro načtení LPIS se připojte k internetu.',true);return}wfsStatus('Načítám seznam vrstev…');try{let u=new URL(endpoint());u.searchParams.set('service','WFS');u.searchParams.set('request','GetCapabilities');let r=await fetch(u,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);let xml=new DOMParser().parseFromString(await r.text(),'text/xml');if(xml.querySelector('parsererror'))throw Error('Neplatná XML odpověď');let names=[...xml.getElementsByTagNameNS('*','FeatureType')].map(n=>({name:n.getElementsByTagNameNS('*','Name')[0]?.textContent,title:n.getElementsByTagNameNS('*','Title')[0]?.textContent})).filter(x=>x.name);$('wfsLayer').innerHTML=names.map(x=>`<option value="${esc(x.name)}">${esc(x.title||x.name)} (${esc(x.name)})</option>`).join('');if(!names.length)throw Error('Služba nevrátila žádné vrstvy');wfsStatus('Spojení navázáno. Dostupných vrstev: '+names.length+'. Vyberte vrstvu a načtěte prvky.')}catch(e){wfsStatus('LPIS se nepodařilo načíst: '+e.message+'. Může jít o omezení CORS služby. Zkuste otevřít GetCapabilities v samostatné kartě; pro spolehlivé napojení bude potřeba proxy server.',

$('getFeatures').onclick=async()=>{
  const layer=$('wfsLayer').value;
  if(!layer){
    wfsStatus('Nejdříve načtěte a vyberte vrstvu.',true);
    return;
  }
  if(!navigator.onLine){
    wfsStatus('Jste offline. Import LPIS není dostupný.',true);
    return;
  }

  try{
    const distance=(lat1,lon1,lat2,lon2)=>{
      const rad=x=>x*Math.PI/180;
      const h=
        Math.sin(rad(lat2-lat1)/2)**2+
        Math.cos(rad(lat1))*Math.cos(rad(lat2))*
        Math.sin(rad(lon2-lon1)/2)**2;
      return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
    };

    const collectCoordinates=(geometry,out=[])=>{
      if(!geometry)return out;
      if(geometry.type==='GeometryCollection'){
        (geometry.geometries||[]).forEach(g=>collectCoordinates(g,out));
        return out;
      }
      const walk=value=>{
        if(!Array.isArray(value))return;
        if(value.length>=2&&
           typeof value[0]==='number'&&
           typeof value[1]==='number'){
          out.push(value);
          return;
        }
        value.forEach(walk);
      };
      walk(geometry.coordinates);
      return out;
    };

    const geometryCenter=geometry=>{
      const points=collectCoordinates(geometry);
      if(!points.length)return null;
      const minLon=Math.min(...points.map(p=>p[0]));
      const maxLon=Math.max(...points.map(p=>p[0]));
      const minLat=Math.min(...points.map(p=>p[1]));
      const maxLat=Math.max(...points.map(p=>p[1]));
      return [(minLat+maxLat)/2,(minLon+maxLon)/2];
    };

    const lat=SITE.lat;
    const lon=SITE.lon;
    const dy=5000/111320;
    const dx=5000/(111320*Math.cos(lat*Math.PI/180));

    const u=new URL(endpoint());
    const params={
      service:'WFS',
      version:'1.0.0',
      request:'GetFeature',
      typeName:layer,
      outputFormat:'application/json',
      srsName:'EPSG:4326',
      bbox:[
        lon-dx,
        lat-dy,
        lon+dx,
        lat+dy
      ].join(',')+',EPSG:4326',
      maxFeatures:$('wfsLimit').value
    };

    Object.entries(params).forEach(([k,v])=>{
      u.searchParams.set(k,v);
    });

    wfsStatus('Načítám pozemky LPIS v okolí stanoviště…');

    const response=await fetch(u,{cache:'no-store'});
    if(!response.ok)throw Error('HTTP '+response.status);

    const result=await response.json();
    if(!Array.isArray(result.features)){
      throw Error('Služba nevrátila seznam pozemků ve formátu GeoJSON.');
    }

    let added=0;
    let inside=0;
    let duplicates=0;
    let outside=0;
    let withoutGeometry=0;

    for(const feature of result.features){
      const geometry=feature.geometry;
      const center=geometryCenter(geometry);

      if(!center){
        withoutGeometry++;
        continue;
      }

      const km=distance(
        SITE.lat,
        SITE.lon,
        center[0],
        center[1]
      );

      if(km>5){
        outside++;
        continue;
      }

      inside++;

      const a=feature.properties||{};

      const parcelCode=
        a.idDpb||
        a.ID_DPB||
        a.zkracenyKod||
        a.KOD_DPB||
        a.kod||
        a.KOD||
        feature.id||
        a.id||
        a.ID||
        '';

      const sourceKey=String(
        parcelCode||JSON.stringify(geometry)
      );

      if(db.parcels.some(p=>p.sourceKey===sourceKey)){
        duplicates++;
        continue;
      }

      let area=
        a.vymera??
        a.VYMERA??
        a.vymeraHa??
        a.VYMERA_HA??
        '';

      let numericArea=Number(area);

      if(Number.isFinite(numericArea)&&numericArea>10000){
        numericArea=numericArea/10000;
      }

      const culture=
        a.kultura||
        a.KULTURA||
        a.druhPozemku||
        a.DRUH_POZEMKU||
        '';

      db.parcels.push({
        id:uid(),
        code:String(parcelCode||'LPIS '+(db.parcels.length+1)),
        dist:km.toFixed(2),
        area:Number.isFinite(numericArea)&&numericArea>0
          ?String(numericArea)
          :'',
        culture:String(culture),
        crop:'',
        status:'LPIS – hranice',
        from:'',
        to:'',
        bee:'Neurčeno',
        verified:'',
        notes:'Import z veřejné LPIS WFS. Vzdálenost je orientační podle středu ohraničujícího obdélníku geometrie. Plodina a kvetení nejsou potvrzeny.',
        geometry:geometry,
        sourceKey:sourceKey,
        attributes:a
      });

      added++;
    }

    if(added>0)save();

    wfsStatus(
      'LPIS načteno: '+result.features.length+
      ' prvků. V okruhu 5 km: '+inside+
      ', nově uloženo: '+added+
      ', duplicit: '+duplicates+
      ', mimo okruh: '+outside+
      ', bez geometrie: '+withoutGeometry+
      '. Vzdálenost je orientační.'
    );

  }catch(e){
    wfsStatus(
      'Načtení LPIS selhalo: '+e.message+
      '. Zkontrolujte připojení, WFS službu nebo její CORS nastavení. Již uložená data zůstávají zachována.',
      true
    );
  }
};                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         

$('getFeatures').onclick=async()=>{
  const layer=$('wfsLayer').value;
  if(!layer){
    wfsStatus('Nejdříve načtěte a vyberte vrstvu.',true);
    return;
  }
  if(!navigator.onLine){
    wfsStatus('Jste offline. Import LPIS není dostupný.',true);
    return;
  }

  try{
    const distance=(lat1,lon1,lat2,lon2)=>{
      const rad=x=>x*Math.PI/180;
      const h=
        Math.sin(rad(lat2-lat1)/2)**2+
        Math.cos(rad(lat1))*Math.cos(rad(lat2))*
        Math.sin(rad(lon2-lon1)/2)**2;
      return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
    };

    const collectCoordinates=(geometry,out=[])=>{
      if(!geometry)return out;
      if(geometry.type==='GeometryCollection'){
        (geometry.geometries||[]).forEach(g=>collectCoordinates(g,out));
        return out;
      }
      const walk=value=>{
        if(!Array.isArray(value))return;
        if(value.length>=2&&
           typeof value[0]==='number'&&
           typeof value[1]==='number'){
          out.push(value);
          return;
        }
        value.forEach(walk);
      };
      walk(geometry.coordinates);
      return out;
    };

    const geometryCenter=geometry=>{
      const points=collectCoordinates(geometry);
      if(!points.length)return null;
      const minLon=Math.min(...points.map(p=>p[0]));
      const maxLon=Math.max(...points.map(p=>p[0]));
      const minLat=Math.min(...points.map(p=>p[1]));
      const maxLat=Math.max(...points.map(p=>p[1]));
      return [(minLat+maxLat)/2,(minLon+maxLon)/2];
    };

    const lat=SITE.lat;
    const lon=SITE.lon;
    const dy=5000/111320;
    const dx=5000/(111320*Math.cos(lat*Math.PI/180));

    const u=new URL(endpoint());
    const params={
      service:'WFS',
      version:'1.0.0',
      request:'GetFeature',
      typeName:layer,
      outputFormat:'application/json',
      srsName:'EPSG:4326',
      bbox:[
        lon-dx,
        lat-dy,
        lon+dx,
        lat+dy
      ].join(',')+',EPSG:4326',
      maxFeatures:$('wfsLimit').value
    };

    Object.entries(params).forEach(([k,v])=>{
      u.searchParams.set(k,v);
    });

    wfsStatus('Načítám pozemky LPIS v okolí stanoviště…');

    const response=await fetch(u,{cache:'no-store'});
    if(!response.ok)throw Error('HTTP '+response.status);

    const result=await response.json();
    if(!Array.isArray(result.features)){
      throw Error('Služba nevrátila seznam pozemků ve formátu GeoJSON.');
    }

    let added=0;
    let inside=0;
    let duplicates=0;
    let outside=0;
    let withoutGeometry=0;

    for(const feature of result.features){
      const geometry=feature.geometry;
      const center=geometryCenter(geometry);

      if(!center){
        withoutGeometry++;
        continue;
      }

      const km=distance(
        SITE.lat,
        SITE.lon,
        center[0],
        center[1]
      );

      if(km>5){
        outside++;
        continue;
      }

      inside++;

      const a=feature.properties||{};

      const parcelCode=
        a.idDpb||
        a.ID_DPB||
        a.zkracenyKod||
        a.KOD_DPB||
        a.kod||
        a.KOD||
        feature.id||
        a.id||
        a.ID||
        '';

      const sourceKey=String(
        parcelCode||JSON.stringify(geometry)
      );

      if(db.parcels.some(p=>p.sourceKey===sourceKey)){
        duplicates++;
        continue;
      }

      let area=
        a.vymera??
        a.VYMERA??
        a.vymeraHa??
        a.VYMERA_HA??
        '';

      let numericArea=Number(area);

      if(Number.isFinite(numericArea)&&numericArea>10000){
        numericArea=numericArea/10000;
      }

      const culture=
        a.kultura||
        a.KULTURA||
        a.druhPozemku||
        a.DRUH_POZEMKU||
        '';

      db.parcels.push({
        id:uid(),
        code:String(parcelCode||'LPIS '+(db.parcels.length+1)),
        dist:km.toFixed(2),
        area:Number.isFinite(numericArea)&&numericArea>0
          ?String(numericArea)
          :'',
        culture:String(culture),
        crop:'',
        status:'LPIS – hranice',
        from:'',
        to:'',
        bee:'Neurčeno',
        verified:'',
        notes:'Import z veřejné LPIS WFS. Vzdálenost je orientační podle středu ohraničujícího obdélníku geometrie. Plodina a kvetení nejsou potvrzeny.',
        geometry:geometry,
        sourceKey:sourceKey,
        attributes:a
      });

      added++;
    }

    if(added>0)save();

    wfsStatus(
      'LPIS načteno: '+result.features.length+
      ' prvků. V okruhu 5 km: '+inside+
      ', nově uloženo: '+added+
      ', duplicit: '+duplicates+
      ', mimo okruh: '+outside+
      ', bez geometrie: '+withoutGeometry+
      '. Vzdálenost je orientační.'
    );

  }catch(e){
    wfsStatus(
      'Načtení LPIS selhalo: '+e.message+
      '. Zkontrolujte připojení, WFS službu nebo její CORS nastavení. Již uložená data zůstávají zachována.',
      true
    );
  }
};
$('export').onclick=async()=>{const json=JSON.stringify({app:'Včelař – Osek',version:2,exported:new Date().toISOString(),site:SITE,data:db},null,2);const name='vcelar-osek-zaloha-'+today()+'.json';try{const blob=new Blob([json],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);$('backupStatus').textContent='Záloha se připravuje ke stažení: '+name;}catch(e){$('backupStatus').textContent='Export se nepodařil: '+e.message;}};
$('importFile').onchange=async e=>{let f=e.target.files[0];if(!f)return;try{let obj=JSON.parse(await f.text()),d=obj.data||obj;if(!Array.isArray(d.colonies)||!Array.isArray(d.checks)||!Array.isArray(d.parcels)||!Array.isArray(d.forage))throw Error('Soubor nemá správnou strukturu zálohy.');if(!confirm('Import nahradí současná data v tomto telefonu. Pokračovat?'))return;db=d;save();$('backupStatus').textContent='Záloha byla úspěšně importována.'}catch(err){$('backupStatus').textContent='Import se nezdařil: '+err.message}e.target.value=''};
$('resetData').onclick=()=>{if(confirm('Opravdu trvale vymazat všechna data aplikace v tomto zařízení? Doporučujeme nejprve exportovat zálohu.')){db=seed();save();$('backupStatus').textContent='Data byla vymazána a obnovena výchozí čtyři včelstva.'}};
function net(){let on=navigator.onLine;$('net').textContent=on?'Aplikace připravena · online':'Offline režim · data v telefonu';$('net').classList.toggle('no',!on)}window.addEventListener('online',net);window.addEventListener('offline',net);net();
if('serviceWorker'in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}))}renderAll();
