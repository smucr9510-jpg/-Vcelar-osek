/* Včelař – Osek | prognóza pastvy: LPIS + ZABAGED + NDVI + počasí */
(() => {
  'use strict';

  const SITE = { lat: 49.7804535, lon: 13.5998565 };
  const GEOJSON = './crops/plodiny_lpis_2026_osek_5km.geojson';
  const ZABAGED = 'https://ags.cuzk.gov.cz/arcgis/rest/services/ZABAGED_POLOHOPIS/MapServer';
  const CACHE = 'vcelarOsek.forecast.v5';
  const DB_NAME = 'vcelarOsekDB';
  const DB_STORE = 'appData';
  const DB_KEY = 'vcelarOsek.data.v2';
  const RINGS = [1, 2, 3, 5];
  const MONTHS = ['leden','únor','březen','duben','květen','červen','červenec','srpen','září','říjen','listopad','prosinec'];

  const RULES = [
    { re:/řepka jarní/i, label:'Řepka jarní', from:5, to:6, score:3.0, kind:'nektar i pyl' },
    { re:/řepka/i, label:'Řepka ozimá', from:4, to:5, score:3.0, kind:'nektar i pyl' },
    { re:/vojtěška/i, label:'Vojtěška', from:6, to:9, score:2.6, kind:'nektar i pyl' },
    { re:/jetel/i, label:'Jetel', from:5, to:8, score:2.5, kind:'nektar i pyl' },
    { re:/svazenka/i, label:'Svazenka', from:5, to:9, score:3.0, kind:'nektar i pyl' },
    { re:/hořčice|ředkev/i, label:'Hořčice a ředkev', from:5, to:9, score:2.0, kind:'nektar i pyl' },
    { re:/sója/i, label:'Sója', from:7, to:8, score:1.8, kind:'nektar' },
    { re:/hrách/i, label:'Hrách', from:5, to:7, score:0.9, kind:'nektar i pyl' },
    { re:/bílkovinn|luskoobiln/i, label:'Bílkovinné směsi', from:6, to:8, score:1.4, kind:'proměnlivý zdroj' },
    { re:/nektarodárn/i, label:'Nektarodárná směs', from:5, to:9, score:2.2, kind:'nektar i pyl' },
    { re:/topol/i, label:'Topol', from:3, to:4, score:0.25, kind:'především pyl' },
    { re:/konopí/i, label:'Konopí', from:7, to:9, score:0.25, kind:'především pyl' },
    { re:/kukuřice/i, label:'Kukuřice', from:7, to:8, score:0.25, kind:'především pyl' },
    { re:/pšenice|ječmen|oves|tritikale/i, label:'Obilniny', from:5, to:7, score:0.4, kind:'velmi slabý zdroj' },
    { re:/brambor/i, label:'Brambory', from:6, to:8, score:0.8, kind:'slabý a proměnlivý zdroj' },
    { re:/travní porost|trávy|trav čeledi/i, label:'Travní porosty', from:5, to:9, score:0.8, kind:'především pyl' }
  ];

  const NATURAL = [
    { key:'orchards', label:'Ovocné sady a zahrady', from:4, to:5, score:2.2, kind:'nektar i pyl', layerIds:[135] },
    { key:'forestTrees', label:'Lesní porosty se stromy', from:3, to:7, score:1.1, kind:'smíšený zdroj – druhově neurčeno', layerIds:[142] },
    { key:'forestShrubs', label:'Lesní křoviny a okraje', from:4, to:7, score:1.5, kind:'nektar i pyl – druhově neurčeno', layerIds:[140] },
    { key:'parks', label:'Parky a udržovaná zeleň', from:4, to:9, score:0.7, kind:'proměnlivý zdroj', layerIds:[134] }
  ];

  const $ = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  const monthName = m => MONTHS[m - 1];
  const active = (r, m) => r.from <= r.to ? m >= r.from && m <= r.to : m >= r.from || m <= r.to;
  const round = n => Number.isFinite(n) ? n.toFixed(1) : '0.0';

  function dist(a,b,c,d) {
    const r=x=>x*Math.PI/180;
    const h=Math.sin(r(c-a)/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(r(d-b)/2)**2;
    return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
  }
  function rule(name) { return RULES.find(x => x.re.test(name)) || null; }

  function geometryPoints(g) {
    const out=[];
    const walk=x=>{
      if(!Array.isArray(x)) return;
      if(typeof x[0]==='number'&&typeof x[1]==='number') out.push(x);
      else x.forEach(walk);
    };
    if(g?.type==='GeometryCollection') (g.geometries||[]).forEach(x=>walk(x.coordinates));
    else walk(g?.coordinates);
    return out;
  }
  function centerOfPoints(points) {
    if(!points.length) return null;
    const xs=points.map(p=>p[0]), ys=points.map(p=>p[1]);
    return [(Math.min(...ys)+Math.max(...ys))/2,(Math.min(...xs)+Math.max(...xs))/2];
  }
  function centerOfArcGeometry(g) {
    if(!g) return null;
    if(Number.isFinite(g.x)&&Number.isFinite(g.y)) return [g.y,g.x];
    if(Array.isArray(g.rings)) {
      const pts=[];
      g.rings.forEach(ring=>ring.forEach(p=>{if(Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1]))pts.push(p)}));
      return centerOfPoints(pts);
    }
    if(Array.isArray(g.paths)) {
      const pts=[];
      g.paths.forEach(path=>path.forEach(p=>{if(Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1]))pts.push(p)}));
      return centerOfPoints(pts);
    }
    return null;
  }
  function arcAreaM2(feature) {
    const a=Number(feature?.attributes?.Shape_Area ?? feature?.attributes?.shape_area);
    if(Number.isFinite(a)&&a>0) return a;
    const rings=feature?.geometry?.rings;
    if(!Array.isArray(rings)||!rings.length) return 0;
    const ring=rings[0]; let sum=0;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++) sum+=(ring[j][0]*ring[i][1]-ring[i][0]*ring[j][1]);
    return Math.abs(sum/2);
  }

  async function readStoredParcels() {
    if(!('indexedDB' in window)) return [];
    try {
      const idb=await new Promise((resolve,reject)=>{
        const r=indexedDB.open(DB_NAME,1);
        r.onsuccess=()=>resolve(r.result);
        r.onerror=()=>reject(r.error);
      });
      const data=await new Promise((resolve,reject)=>{
        const tx=idb.transaction(DB_STORE,'readonly');
        const r=tx.objectStore(DB_STORE).get(DB_KEY);
        r.onsuccess=()=>resolve(r.result||null);
        r.onerror=()=>reject(r.error);
      });
      idb.close();
      return Array.isArray(data?.parcels)?data.parcels:[];
    } catch(e) { console.warn('Lokální LPIS:',e); return []; }
  }

  async function getParcels() {
    try {
      const r=await fetch(GEOJSON,{cache:'no-store'});
      if(!r.ok) throw Error('Lokální export plodin není dostupný');
      const j=await r.json();
      return (j.features||[]).flatMap(f=>{
        const p=f.properties||{}, name=String(p.plodina||'Plodina neuvedena').trim();
        const center=centerOfPoints(geometryPoints(f.geometry)), rr=rule(name);
        if(!center) return [];
        const distance=dist(SITE.lat,SITE.lon,center[0],center[1]);
        const area=Number(p.deklarovana_vymera_ha||p.dpb_vymera_ha||0);
        return distance<=5.15?[{name,distance,area,rule:rr,source:'LPIS'}]:[];
      });
    } catch(error) {
      console.warn('LPIS export:',error);
      const local=await readStoredParcels();
      return local.flatMap(p=>{
        const center=centerOfPoints(geometryPoints(p.geometry));
        if(!center) return [];
        const distance=dist(SITE.lat,SITE.lon,center[0],center[1]);
        const name=String(p.crop||p.attributes?.plodina||p.culture||'Plodina neuvedena');
        const area=Number(p.area||p.attributes?.vymera_ha||0);
        return distance<=5.15?[{name,distance,area,rule:rule(name),source:'Lokální evidence LPIS'}]:[];
      });
    }
  }

  function envelope() {
    const dy=5.25/111.32, dx=5.25/(111.32*Math.cos(SITE.lat*Math.PI/180));
    return {xmin:SITE.lon-dx,ymin:SITE.lat-dy,xmax:SITE.lon+dx,ymax:SITE.lat+dy};
  }
  async function getZabagedLayer(id) {
    const e=envelope(), u=new URL(`${ZABAGED}/${id}/query`);
    const params={
      f:'json',where:'1=1',outFields:'*',returnGeometry:'true',
      geometry:JSON.stringify(e),geometryType:'esriGeometryEnvelope',
      inSR:'4326',spatialRel:'esriSpatialRelIntersects',outSR:'4326',
      resultRecordCount:'2000'
    };
    Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));
    const r=await fetch(u,{cache:'no-store'});
    if(!r.ok) throw Error('ZABAGED vrstva '+id+': HTTP '+r.status);
    const j=await r.json();
    if(j.error) throw Error(j.error.message||'Chyba ZABAGED');
    return Array.isArray(j.features)?j.features:[];
  }
  async function getLandscape() {
    const definitions=[
      {id:135,key:'orchards',label:'Ovocné sady a zahrady',source:'ZABAGED',kind:'nektar i pyl',from:4,to:5,score:2.2},
      {id:142,key:'forestTrees',label:'Lesní porosty se stromy',source:'ZABAGED',kind:'smíšený zdroj – druhově neurčeno',from:3,to:7,score:1.1},
      {id:140,key:'forestShrubs',label:'Lesní křoviny a okraje',source:'ZABAGED',kind:'nektar i pyl – druhově neurčeno',from:4,to:7,score:1.5},
      {id:134,key:'parks',label:'Parky a udržovaná zeleň',source:'ZABAGED',kind:'proměnlivý zdroj',from:4,to:9,score:0.7}
    ];
    const results=await Promise.allSettled(definitions.map(d=>getZabagedLayer(d.id)));
    const features=[];
    results.forEach((result,index)=>{
      const d=definitions[index];
      if(result.status!=='fulfilled') {
        console.warn('ZABAGED vrstva nedostupná:',d.id,result.reason);
        return;
      }
      result.value.forEach(f=>{
        const center=centerOfArcGeometry(f.geometry);
        if(!center) return;
        const distance=dist(SITE.lat,SITE.lon,center[0],center[1]);
        if(distance>5.15) return;
        const area=arcAreaM2(f)/10000;
        const attrs=f.attributes||{};
        const subtype=String(attrs.TYP_PUDY_P||attrs.typ_pudy_p||'').trim();
        const label=d.id===135&&subtype?`Ovocné sady a zahrady – ${subtype.toLowerCase()}`:d.label;
        features.push({key:d.key,label,distance,area,kind:d.kind,from:d.from,to:d.to,score:d.score,source:'ZABAGED ČÚZK',id:String(attrs.FID_ZBG||attrs.fid_zbg||attrs.OBJECTID||''),detail:subtype});
      });
    });
    return {features,layerStatus:definitions.map((d,i)=>({name:d.label,ok:results[i].status==='fulfilled',count:results[i].status==='fulfilled'?results[i].value.length:0}))};
  }

  async function getWeather() {
    const u=new URL('https://api.open-meteo.com/v1/forecast');
    u.search=new URLSearchParams({
      latitude:SITE.lat,longitude:SITE.lon,
      daily:'temperature_2m_max,precipitation_sum,wind_speed_10m_max',
      forecast_days:'7',timezone:'Europe/Prague'
    });
    const r=await fetch(u);
    if(!r.ok) throw Error('Počasí není dostupné');
    return r.json();
  }
  async function getNdvi() {
    const r=await fetch('./data/ndvi-latest.json',{cache:'no-store'});
    if(!r.ok) throw Error('NDVI není dostupné');
    const j=await r.json();
    if(j.status!=='OK'||!j.rings) throw Error('Neplatný formát NDVI');
    return j;
  }
  function cached() { try{return JSON.parse(localStorage.getItem(CACHE)||'null')}catch(_){return null;} }
  function save(x) { try{localStorage.setItem(CACHE,JSON.stringify(x));}catch(e){console.warn('Prognózu se nepodařilo uložit do cache:',e);} }

  function monthlyModel(parcels,landscape,radius) {
    const cropRows=parcels.filter(p=>p.distance<=radius&&p.rule&&p.area>0);
    const cropMap=new Map();
    cropRows.forEach(p=>{
      const k=p.rule.label;
      if(!cropMap.has(k)) cropMap.set(k,{name:k,area:0,parcels:0,nearest:p.distance,rule:p.rule});
      const c=cropMap.get(k); c.area+=p.area; c.parcels++; c.nearest=Math.min(c.nearest,p.distance);
    });
    const crops=[...cropMap.values()];
    const naturalRows=(landscape?.features||[]).filter(p=>p.distance<=radius&&p.area>0);
    const naturalMap=new Map();
    naturalRows.forEach(p=>{
      const k=p.key;
      if(!naturalMap.has(k)) naturalMap.set(k,{name:p.label,area:0,objects:0,nearest:p.distance,from:p.from,to:p.to,score:p.score,kind:p.kind});
      const n=naturalMap.get(k); n.area+=p.area; n.objects++; n.nearest=Math.min(n.nearest,p.distance);
    });
    const natural=[...naturalMap.values()];
    const months=MONTHS.map((_,i)=>{
      const m=i+1;
      const activeCrops=crops.filter(c=>active(c.rule,m));
      const activeNatural=natural.filter(n=>active(n,m));
      const cropArea=activeCrops.reduce((s,c)=>s+c.area,0);
      const naturalArea=activeNatural.reduce((s,n)=>s+n.area,0);
      const cropWeighted=activeCrops.reduce((s,c)=>s+c.area*c.rule.score,0);
      const naturalWeighted=activeNatural.reduce((s,n)=>s+n.area*n.score,0);
      const totalArea=cropArea+naturalArea;
      const weighted=cropWeighted+naturalWeighted;
      return {month:m,cropArea,naturalArea,totalArea,score:totalArea?weighted/totalArea:0,crops:activeCrops,natural:activeNatural};
    });
    const now=new Date().getMonth()+1,cur=months[now-1];
    const next=Array.from({length:11},(_,i)=>months[(now+i)%12]).find(m=>m.totalArea>0);
    const peak=months.reduce((a,b)=>b.score>a.score?b:a,months[0]);
    const level=s=>!s?'Bez evidovaných zdrojů':s>=2.5?'Vysoký':s>=1.8?'Střední':s>=1?'Nižší':'Velmi nízký';
    return {
      cropArea:cropRows.reduce((s,p)=>s+p.area,0),
      naturalArea:naturalRows.reduce((s,p)=>s+p.area,0),
      cropCount:cropRows.length,naturalCount:naturalRows.length,
      current:cur,peak,next,level
    };
  }

  function ndviInfo(data,radius) {
    const a=data?.rings?.[String(radius)]||[];
    const vals=a.map(x=>({date:x.interval?.to,mean:x.outputs?.ndvi?.bands?.B0?.stats?.mean}))
      .filter(x=>x.date&&Number.isFinite(x.mean));
    if(!vals.length)return null;
    const last=vals[vals.length-1],prev=vals.length>1?vals[vals.length-2]:null;
    return {...last,change:prev?last.mean-prev.mean:null};
  }
  function flightStatus(w) {
    const d=w?.daily;
    if(!d?.time?.length)return'Počasí není dostupné';
    const t=d.temperature_2m_max?.[0],rain=d.precipitation_sum?.[0],wind=d.wind_speed_10m_max?.[0];
    if(t==null||rain==null||wind==null)return'Neúplné údaje';
    if(t<10)return'Chladno – omezený let';
    if(rain>=2)return'Déšť může omezit let';
    if(wind>=30)return'Silný vítr';
    if(t>=15&&rain<1&&wind<20)return'Příznivé podmínky pro let';
    return'Proměnlivé podmínky';
  }

  function render(target,data,offline) {
    target.replaceChildren();
    const panel=$('div',undefined,'panel');
    panel.append(
      $('h2','🐝 Sezónní prognóza pastvy a snůšky'),
      $('p','Stanoviště Osek · LPIS + ZABAGED ČÚZK · okruhy 1–5 km','muted'),
      $('p',offline?'Poslední uložená data – offline.':'Aktualizováno: '+new Date(data.updated).toLocaleString('cs-CZ'),'muted')
    );
    panel.append($('h3','🍯 Měsíční potenciál plodin a krajinné vegetace'));
    RINGS.forEach(radius=>{
      const m=monthlyModel(data.parcels,data.landscape,radius),box=$('div',undefined,'notice');
      box.append(
        $('b','Okruh do '+radius+' km'),
        $('div','Aktuální měsíc ('+monthName(m.current.month)+'): '+m.level(m.current.score)),
        $('div','Aktivní zdroje nyní: '+round(m.current.cropArea)+' ha plodin a '+round(m.current.naturalArea)+' ha sadů, lesů a zeleně.'),
        $('div','Sezónní maximum: '+monthName(m.peak.month)+' · '+m.level(m.peak.score)+' · '+round(m.peak.totalArea)+' ha souhrnné plochy zdrojů.')
      );
      if(m.next){
        const crop=m.next.crops.slice().sort((a,b)=>b.area-a.area)[0];
        const natural=m.next.natural.slice().sort((a,b)=>b.area-a.area)[0];
        const name=crop&&(!natural||crop.area>=natural.area)?crop.name:natural?.name;
        box.append($('div','Nejbližší očekávané období: '+(name||'kvetení vegetace')+' · '+monthName(m.next.month)));
      }
      panel.append(box);
    });
    panel.append($('p','Skóre je orientační relativní model ploch a obecných období kvetení. Není měřením nektaru ani předpovědí kilogramů medu. Lesní porosty, křoviny a zahrady nemají v ZABAGED vždy uvedené konkrétní druhy stromů; jejich druhové složení a skutečné kvetení proto nelze z mapy potvrdit.','muted'));

    panel.append($('h3','🌳 Lesy, sady, zahrady a zeleň – ZABAGED'));
    const layerStatus=data.landscape?.layerStatus||[];
    layerStatus.forEach(x=>panel.append($('div',(x.ok?'✓ ':'⚠ ')+x.name+' · '+(x.ok?x.count+' objektů načteno':'vrstva nedostupná'),'item')));
    RINGS.forEach(radius=>{
      const list=(data.landscape?.features||[]).filter(x=>x.distance<=radius);
      const area=list.reduce((s,x)=>s+x.area,0);
      const counts=new Map();
      list.forEach(x=>counts.set(x.key,(counts.get(x.key)||0)+1));
      const detail=[...counts.entries()].map(([k,v])=>v+' objektů').join(', ')||'bez objektů';
      panel.append($('div','Do '+radius+' km · '+detail+' · '+round(area)+' ha celkem','item'));
    });
    panel.append($('p','Zdroj: ZABAGED® – polohopis, ČÚZK. Plochy jsou orientačně přiřazeny podle středu jejich ohraničujícího obdélníku; malé objekty poblíž hranice okruhu se mohou zařadit nepřesně.','muted'));

    panel.append($('h3','🛰️ Sentinel‑2 – vývoj vegetace'));
    RINGS.forEach(radius=>{
      const n=ndviInfo(data.ndvi,radius);
      panel.append($('div',n?'Okruh '+radius+' km · NDVI '+n.mean.toFixed(3)+(n.change==null?'':' · změna '+(n.change>0?'+':'')+n.change.toFixed(3))+' · '+new Date(n.date).toLocaleDateString('cs-CZ'):'Okruh '+radius+' km · NDVI není dostupné','item'));
    });
    panel.append($('p','NDVI ukazuje zelenost vegetace v celém okruhu. Je doplňkovým ukazatelem stavu porostů, nikoli přímým ukazatelem kvetení nebo nektaru.','muted'));

    panel.append($('h3','🌦️ Podmínky letu včel – následujících 7 dní'),$('p',flightStatus(data.weather),'notice'));
    const d=data.weather?.daily;
    if(d?.time)(d.time||[]).forEach((date,i)=>panel.append($('div',new Date(date).toLocaleDateString('cs-CZ')+' · '+(d.temperature_2m_max?.[i]??'–')+' °C · déšť '+(d.precipitation_sum?.[i]??'–')+' mm · vítr '+(d.wind_speed_10m_max?.[i]??'–')+' km/h','item')));

    panel.append($('h3','Přehled evidovaných plodin podle vzdálenosti'));
    RINGS.forEach(radius=>{
      const a=data.parcels.filter(p=>p.distance<=radius),area=a.reduce((s,p)=>s+p.area,0);
      panel.append($('div','Do '+radius+' km · '+a.length+' záznamů plodin · '+round(area)+' ha','item'));
    });
    const btn=$('button','Aktualizovat prognózu','btn primary');
    btn.type='button';btn.addEventListener('click',()=>update(target));
    panel.append(btn);
    target.append(panel);
  }

  async function update(target) {
    target.replaceChildren($('div','Načítám LPIS, ZABAGED, počasí a Sentinel‑2…','panel'));
    try {
      const [parcels,landscape,weather,ndvi]=await Promise.all([
        getParcels(),
        getLandscape().catch(e=>{console.warn('ZABAGED:',e);return{features:[],layerStatus:[]};}),
        getWeather(),
        getNdvi().catch(e=>{console.warn('NDVI:',e);return null;})
      ]);
      const data={updated:new Date().toISOString(),parcels,landscape,weather,ndvi};
      save(data);render(target,data,false);
    } catch(e) {
      console.warn('Prognóza pastvy:',e);
      const old=cached();
      if(old)render(target,old,true);
      else target.replaceChildren($('div','Prognóza není dostupná. Zkontrolujte připojení a zkuste aktualizaci.','notice warn'));
    }
  }

  function start() {
    const forage=document.getElementById('forage');
    if(!forage||document.getElementById('forecastPanel'))return;
    const target=$('div');target.id='forecastPanel';forage.insertBefore(target,forage.firstChild);
    const old=cached();
    if(old)render(target,old,true);
    else target.append($('div','Prognóza se načte při připojení k internetu.','notice'));
    update(target);
  }
  window.VcelarForecast={update,getCache:cached};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);
  else start();
})();
