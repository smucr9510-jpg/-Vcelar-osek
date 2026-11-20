/* Včelař – Osek | prognóza pastvy: LPIS + ZABAGED + NDVI + počasí + fenologie
   Verze: 20 | GPZ deklarace párované výhradně podle ID DPB.
   Odhad pastvy je orientační model, nikoli měření nektaru nebo kg medu. */
(() => {
  'use strict';

  const SITE = { lat: 49.7804535, lon: 13.5998565 };
  const GEOJSON = './crops/plodiny_lpis_2026_osek_5km.geojson';
  const ZABAGED = 'https://ags.cuzk.gov.cz/arcgis/rest/services/ZABAGED_POLOHOPIS/MapServer';
  const CACHE = 'vcelarOsek.forecast.v15';
  const CLIMATE_CACHE = 'vcelarOsek.phenologyClimate.v1';
  const CLIMATE_URL = 'https://archive-api.open-meteo.com/v1/archive';
  const DB_NAME = 'vcelarOsekDB', DB_STORE = 'appData', DB_KEY = 'vcelarOsek.data.v2';
  const RINGS = [1, 2, 3, 5];
  const MONTHS = ['leden','únor','březen','duben','květen','červen','červenec','srpen','září','říjen','listopad','prosinec'];

  const RULES = [
    {re:/řepka jarní/i,label:'Řepka jarní',from:5,to:6,score:3,kind:'nektar i pyl'},
    {re:/řepka/i,label:'Řepka ozimá',from:4,to:5,score:3,kind:'nektar i pyl'},
    {re:/vojtěška/i,label:'Vojtěška',from:6,to:9,score:2.6,kind:'nektar i pyl'},
    {re:/jetel/i,label:'Jetel',from:5,to:8,score:2.5,kind:'nektar i pyl'},
    {re:/svazenka/i,label:'Svazenka',from:5,to:9,score:3,kind:'nektar i pyl'},
    {re:/hořčice|ředkev/i,label:'Hořčice a ředkev',from:5,to:9,score:2,kind:'nektar i pyl'},
    {re:/sója/i,label:'Sója',from:7,to:8,score:1.8,kind:'nektar'},
    {re:/hrách/i,label:'Hrách',from:5,to:7,score:.9,kind:'nektar i pyl'},
    {re:/bílkovinn|luskoobiln/i,label:'Bílkovinné směsi',from:6,to:8,score:1.4,kind:'proměnlivý zdroj'},
    {re:/nektarodárn/i,label:'Nektarodárná směs',from:5,to:9,score:2.2,kind:'nektar i pyl'},
    {re:/topol/i,label:'Topol',from:3,to:4,score:.25,kind:'především pyl'},
    {re:/konopí/i,label:'Konopí',from:7,to:9,score:.25,kind:'především pyl'},
    {re:/kukuřice/i,label:'Kukuřice',from:7,to:8,score:.25,kind:'především pyl'},
    {re:/pšenice|ječmen|oves|tritikale/i,label:'Obilniny',from:5,to:7,score:.4,kind:'velmi slabý zdroj'},
    {re:/brambor/i,label:'Brambory',from:6,to:8,score:.8,kind:'slabý a proměnlivý zdroj'},
    {re:/travní porost|trávy|trav čeledi/i,label:'Travní porosty',from:5,to:9,score:.8,kind:'především pyl'}
  ];
  const BLOOMS = [
    {name:'Líska',from:2,to:3,kind:'Především pyl',group:'Keře a lesní okraje',note:'Časný pylový zdroj'},
    {name:'Olše',from:2,to:3,kind:'Především pyl',group:'Lesní dřeviny',note:'Časný pylový zdroj'},
    {name:'Vrby včetně jívy',from:3,to:4,kind:'Nektar i pyl',group:'Lesní okraje a břehy',note:'Významný časný zdroj potravy'},
    {name:'Topoly',from:3,to:4,kind:'Především pyl',group:'Lesní dřeviny',note:'Pylový zdroj'},
    {name:'Javory',from:4,to:5,kind:'Nektar i pyl',group:'Lesní a parkové dřeviny',note:'Kvetení podle druhu'},
    {name:'Třešeň a višeň',from:4,to:5,kind:'Nektar i pyl',group:'Ovocné stromy',note:'Krátké, na počasí citlivé kvetení'},
    {name:'Švestka a slivoň',from:4,to:5,kind:'Nektar i pyl',group:'Ovocné stromy',note:'Termín se liší podle odrůdy'},
    {name:'Hrušeň',from:4,to:5,kind:'Nektar i pyl',group:'Ovocné stromy',note:'Krátké jarní období'},
    {name:'Jabloň',from:4,to:5,kind:'Nektar i pyl',group:'Ovocné stromy',note:'Termín se liší podle odrůdy'},
    {name:'Hloh',from:5,to:6,kind:'Nektar i pyl',group:'Keře a okraje',note:'Meze, remízky a okraje porostů'},
    {name:'Jírovec',from:5,to:6,kind:'Nektar i pyl',group:'Parkové dřeviny',note:'Výskyt není z mapy potvrzen'},
    {name:'Akát',from:5,to:6,kind:'Významný nektarový zdroj',group:'Krajinné dřeviny',note:'Kvetení ovlivňuje chlad a déšť'},
    {name:'Maliník',from:5,to:7,kind:'Nektar i pyl',group:'Lesní paseky a okraje',note:'Důležitý zdroj na pasekách'},
    {name:'Ostružiník',from:6,to:8,kind:'Nektar i pyl',group:'Lesní okraje a křoviny',note:'Dlouhé proměnlivé období kvetení'},
    {name:'Lípy',from:6,to:7,kind:'Významný nektarový i pylový zdroj',group:'Lesní a parkové dřeviny',note:'Jednotlivé druhy kvetou postupně'},
    {name:'Vřes',from:8,to:9,kind:'Pozdní nektar i pyl',group:'Vřesoviště a suchá stanoviště',note:'Jen tam, kde se skutečně vyskytuje'}
  ];
  const NATURAL = [
    {id:135,key:'orchards',label:'Ovocné sady a zahrady',from:4,to:5,score:2.2},
    {id:142,key:'forestTrees',label:'Lesní porosty se stromy',from:3,to:7,score:1.1},
    {id:140,key:'forestShrubs',label:'Lesní křoviny a okraje',from:4,to:7,score:1.5},
    {id:134,key:'parks',label:'Parky a udržovaná zeleň',from:4,to:9,score:.7}
  ];

  const $=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const round=n=>Number.isFinite(n)?n.toFixed(1):'0.0';
  const active=(x,m)=>x.from<=x.to?m>=x.from&&m<=x.to:m>=x.from||m<=x.to;
  const monthName=m=>MONTHS[m-1];
  const dist=(a,b,c,d)=>{const r=x=>x*Math.PI/180,h=Math.sin(r(c-a)/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(r(d-b)/2)**2;return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));};
  // Střed geometrie GeoJSON pro Polygon, MultiPolygon i Feature.
  function geoCenter(input){
    const geometry=input?.type==='Feature'?input.geometry:input;
    const coordinates=geometry?.coordinates;
    if(!coordinates)return null;
    let lon=0,lat=0,count=0;
    const walk=value=>{
      if(!Array.isArray(value))return;
      if(value.length>=2&&typeof value[0]==='number'&&typeof value[1]==='number'){
        lon+=value[0];lat+=value[1];count++;
      }else value.forEach(walk);
    };
    walk(coordinates);
    return count?[lat/count,lon/count]:null;
  }
  const rule=name=>RULES.find(x=>x.re.test(name))||null;
  // Plodinu čteme z deklarací GPZ i z kompatibilních polí exportu.
  // Kultura DPB (např. orná půda/TTP) se nikdy nepovažuje za plodinu.
  function cropNames(p){
    const a=p?.attributes||{};
    const declarations=Array.isArray(p?.cropDeclarations)?p.cropDeclarations:[];
    const fromDeclarations=declarations
      .map(x=>String(x?.plant||x?.PLOD_NAZE||'').trim())
      .filter(Boolean);
    if(fromDeclarations.length)return [...new Set(fromDeclarations)];
    const value=p?.crop||p?.plodina||a.PLOD_NAZE||a.plodina||a.PLODINA||a.crop||a.CROP||a.nazevPlodiny||a.NAZEV_PLODINY||'';
    return String(value).split(/[;,|]/).map(x=>x.trim()).filter(Boolean);
  }
  function cultureName(p){
    const a=p?.attributes||{};
    return String(p?.culture||p?.kultura||a.kultura||a.KULTURA||a.KULTURAKOD||'').trim();
  }
  function numericArea(value){
    if(typeof value==='number')return Number.isFinite(value)?value:0;
    const n=Number(String(value??'').trim().replace(/\s/g,'').replace(',','.'));
    return Number.isFinite(n)?n:0;
  }
  function parcelArea(p){
    const a=p?.attributes||{};
    return numericArea(p?.area)||numericArea(p?.vymera)||numericArea(a.vymera)||numericArea(a.VYMERA_HA)||numericArea(a.DPB_VYMERA)||0;
  }
  function declarationArea(declaration,p){
    return numericArea(declaration?.area)||numericArea(declaration?.DEKL_VYM)||parcelArea(p);
  }
  function localParcelFeatures(p,declarationsOverride){
    const c=geoCenter(p?.geometry);
    if(!c)return[];
    const distance=dist(SITE.lat,SITE.lon,c[0],c[1]);
    if(distance>5.15)return[];
    const declarations=Array.isArray(declarationsOverride)?declarationsOverride:(Array.isArray(p?.cropDeclarations)?p.cropDeclarations:[]);
    const culture=cultureName(p);
    if(declarations.length){
      return declarations.flatMap(declaration=>{
        const name=String(declaration?.plant||declaration?.PLOD_NAZE||'').trim();
        if(!name)return[];
        return[{name,culture,distance,area:declarationArea(declaration,p),dpbId:declarationDpbId(declaration)||dpbIdOf(p),declarationKey:declarationSignature(declaration),rule:rule(name),geometry:p.geometry,source:'Veřejný export MZe/SZIF – GPZ',year:declaration.year||p.cropDataYear||null}];
      });
    }
    const names=cropNames(p);
    if(names.length)return names.map(name=>({name,culture,distance,area:parcelArea(p),dpbId:dpbIdOf(p),declarationKey:[dpbIdOf(p),name,p.cropDataYear||''].join('|'),rule:rule(name),geometry:p.geometry,source:p.cropSource||'LPIS / deklarace plodiny',year:p.cropDataYear||null}));
    return[{name:'Konkrétní plodina nezjištěna',culture,distance,area:parcelArea(p),rule:null,geometry:p.geometry,source:'LPIS – bez deklarace plodiny',year:null}];
  }
  async function readLocalParcels(){
    if(!('indexedDB'in window))return[];
    try{const db=await new Promise((ok,no)=>{const r=indexedDB.open(DB_NAME,1);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
      const data=await new Promise((ok,no)=>{const r=db.transaction(DB_STORE,'readonly').objectStore(DB_STORE).get(DB_KEY);r.onsuccess=()=>ok(r.result||null);r.onerror=()=>no(r.error);});db.close();return Array.isArray(data?.parcels)?data.parcels:[];
    }catch(e){console.warn('Lokální LPIS:',e);return[];}
  }
  // Identita DPB: nikdy nepoužívat zkrácený kód dílu (např. 5901/9).
  function dpbIdOf(p){
    const a=p?.attributes||{};
    const raw=[
      p?.sourceKey,p?.dpbId,p?.dpbID,p?.ID_DPB,p?.IdDiluPudnihoBloku,
      a.IdDiluPudnihoBloku,a.idDiluPudnihoBloku,a.idDpb,a.ID_DPB,a.ID_DILU_PUDNIHO_BLOKU
    ];
    for(const value of raw){
      const id=String(value??'').replace(/^lpis:/i,'').trim();
      if(/^\\d+$/.test(id))return id;
    }
    return '';
  }
  function declarationDpbId(d){
    const raw=[d?.dpbId,d?.dpbID,d?.ID_DPB,d?.IdDiluPudnihoBloku,d?.idDiluPudnihoBloku,d?.idDpb];
    for(const value of raw){
      const id=String(value??'').replace(/^lpis:/i,'').trim();
      if(/^\\d+$/.test(id))return id;
    }
    return '';
  }
  function declarationSignature(d){
    return [declarationDpbId(d),d?.plant||d?.PLOD_NAZE||'',d?.year||'',numericArea(d?.area)||numericArea(d?.DEKL_VYM)||'',d?.reportDate||d?.datum||'',d?.code||'',d?.sowDate||'',d?.eco||''].join('|');
  }
  async function getParcels(){
    // Lokální databázi čteme pouze režimem readonly; nic v ní neměníme.
    const local=await readLocalParcels();
    const localByDpb=new Map();
    const declarationsByDpb=new Map();
    const declarationKeys=new Set();
    local.forEach(p=>{
      const id=dpbIdOf(p);
      if(id&&!localByDpb.has(id))localByDpb.set(id,p);
      (Array.isArray(p?.cropDeclarations)?p.cropDeclarations:[]).forEach(d=>{
        const dpb=declarationDpbId(d);
        if(!dpb)return;
        const signature=declarationSignature(d);
        const uniqueKey=dpb+'|'+signature;
        if(declarationKeys.has(uniqueKey))return;
        declarationKeys.add(uniqueKey);
        if(!declarationsByDpb.has(dpb))declarationsByDpb.set(dpb,[]);
        declarationsByDpb.get(dpb).push(d);
      });
    });
    const matchedDpb=new Set();
    try{
      const r=await fetch(GEOJSON,{cache:'no-store'});
      if(!r.ok)throw Error('LPIS export není dostupný');
      const j=await r.json();
      const output=(j.features||[]).flatMap(f=>{
        const p=f.properties||{},c=geoCenter(f.geometry);
        if(!c)return[];
        const distance=dist(SITE.lat,SITE.lon,c[0],c[1]);
        if(distance>5.15)return[];
        const featureId=dpbIdOf(p);
        const localParcel=featureId?localByDpb.get(featureId)||null:null;
        const declarations=featureId?(declarationsByDpb.get(featureId)||[]):[];
        if(featureId&&declarations.length)matchedDpb.add(featureId);
        const culture=cultureName(localParcel||p);
        if(declarations.length){
          return declarations.flatMap(declaration=>{
            const name=String(declaration?.plant||declaration?.PLOD_NAZE||'').trim();
            if(!name)return[];
            return [{
              name,culture,distance,
              area:declarationArea(declaration,localParcel||p),
              dpbId:featureId||declarationDpbId(declaration),
              declarationKey:declarationSignature(declaration),
              rule:rule(name),geometry:f.geometry,
              source:'Veřejný export MZe/SZIF – GPZ',
              year:declaration.year||localParcel?.cropDataYear||null
            }];
          });
        }
        const names=cropNames(p);
        if(names.length){
          const area=parcelArea(p)||(localParcel?parcelArea(localParcel):0);
          return names.map(name=>({
            name,culture,distance,area,dpbId:featureId,
            declarationKey:[featureId,name,p.rok||p.ROK||''].join('|'),
            rule:rule(name),geometry:f.geometry,
            source:'Veřejný export MZe/SZIF',year:p.rok||p.ROK||null
          }));
        }
        return [{
          name:'Konkrétní plodina nezjištěna',culture,distance,
          area:parcelArea(p)||(localParcel?parcelArea(localParcel):0),
          rule:null,geometry:f.geometry,source:'LPIS – bez deklarace plodiny',year:null
        }];
      });
      // Nezobrazené DPB doplníme z lokální geometrie, stále jen podle plného ID DPB.
      local.forEach(p=>{
        const id=dpbIdOf(p);
        if(!id||matchedDpb.has(id))return;
        const declarations=declarationsByDpb.get(id)||[];
        if(!declarations.length)return;
        output.push(...localParcelFeatures(p,declarations));
        matchedDpb.add(id);
      });
      return output;
    }catch(e){
      console.warn('LPIS export:',e);
      return local.flatMap(p=>{
        const id=dpbIdOf(p);
        const declarations=id?(declarationsByDpb.get(id)||[]):[];
        return localParcelFeatures(p,declarations);
      });
    }
  }
  function envelope(){const dy=5.25/111.32,dx=5.25/(111.32*Math.cos(SITE.lat*Math.PI/180));return{xmin:SITE.lon-dx,ymin:SITE.lat-dy,xmax:SITE.lon+dx,ymax:SITE.lat+dy};}
  async function getLayer(id){const u=new URL(`${ZABAGED}/${id}/query`),p={f:'json',where:'1=1',outFields:'*',returnGeometry:'true',geometry:JSON.stringify(envelope()),geometryType:'esriGeometryEnvelope',inSR:'4326',spatialRel:'esriSpatialRelIntersects',outSR:'4326',resultRecordCount:'2000'};Object.entries(p).forEach(([k,v])=>u.searchParams.set(k,v));const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const j=await r.json();if(j.error)throw Error(j.error.message||'Chyba ZABAGED');return j.features||[];}
  async function getLandscape(){const results=await Promise.allSettled(NATURAL.map(x=>getLayer(x.id))),features=[];results.forEach((res,i)=>{const d=NATURAL[i];if(res.status!=='fulfilled'){console.warn('ZABAGED:',d.id,res.reason);return;}res.value.forEach(f=>{const c=arcCenter(f.geometry);if(!c)return;const distance=dist(SITE.lat,SITE.lon,c[0],c[1]);if(distance>5.15)return;features.push({key:d.key,label:d.label,distance,area:arcArea(f)/10000,from:d.from,to:d.to,score:d.score});});});return{features,layerStatus:NATURAL.map((d,i)=>({name:d.label,ok:results[i].status==='fulfilled',count:results[i].status==='fulfilled'?results[i].value.length:0}))};}

  // Open-Meteo poskytuje denní výhled až na 16 dní; zde používáme 14 dní.
  async function getWeather(){
    const u=new URL('https://api.open-meteo.com/v1/forecast');
    u.search=new URLSearchParams({latitude:SITE.lat,longitude:SITE.lon,daily:'temperature_2m_mean,temperature_2m_max,precipitation_sum,wind_speed_10m_max',past_days:'30',forecast_days:'14',timezone:'Europe/Prague'});
    const r=await fetch(u);if(!r.ok)throw Error('Počasí není dostupné');return r.json();
  }
  function climateCached(){try{const x=JSON.parse(localStorage.getItem(CLIMATE_CACHE)||'null');return x&&Date.now()-x.savedAt<30*86400000?x.data:null;}catch(_){return null;}}
  async function getClimateNormals(){
    const old=climateCached();if(old)return old;
    const u=new URL(CLIMATE_URL);u.search=new URLSearchParams({latitude:SITE.lat,longitude:SITE.lon,start_date:'1991-01-01',end_date:'2020-12-31',daily:'temperature_2m_mean',timezone:'Europe/Prague'});
    const r=await fetch(u);if(!r.ok)throw Error('Klimatický normál není dostupný');const j=await r.json();
    if(!j.daily?.time||!j.daily?.temperature_2m_mean)throw Error('Klimatický normál nemá denní teploty');
    const sums={},counts={};j.daily.time.forEach((date,i)=>{const t=j.daily.temperature_2m_mean[i];if(!Number.isFinite(t))return;const k=date.slice(5);sums[k]=(sums[k]||0)+Math.max(0,t-5);counts[k]=(counts[k]||0)+1;});
    const normals={};Object.keys(sums).forEach(k=>normals[k]=sums[k]/counts[k]);
    try{localStorage.setItem(CLIMATE_CACHE,JSON.stringify({savedAt:Date.now(),data:normals}));}catch(e){console.warn('Uložení klimatického normálu:',e);}return normals;
  }
  async function getPhenologySignal(weather){
    const d=weather?.daily;if(!d?.time||!d?.temperature_2m_mean)throw Error('Chybí denní průměrné teploty');
    const month=new Date().getMonth()+1;if(month<2||month>7)return{available:true,shift:0,delta:0,normal:false,note:'Teplotní posun se vyhodnocuje v předjarním a jarním období (únor–červenec).'};
    const normals=await getClimateNormals(),cutoff=new Date();cutoff.setDate(cutoff.getDate()-1);
    const cutoffISO=`${cutoff.getFullYear()}-${String(cutoff.getMonth()+1).padStart(2,'0')}-${String(cutoff.getDate()).padStart(2,'0')}`;
    const rows=d.time.map((date,i)=>({date,temp:d.temperature_2m_mean[i]})).filter(x=>x.date&&x.date<=cutoffISO&&Number.isFinite(x.temp)).slice(-30);
    if(rows.length<20)throw Error('Není dostatek posledních denních teplot');
    let delta=0,normalDaily=0,used=0;rows.forEach(x=>{const n=normals[x.date.slice(5)];if(!Number.isFinite(n))return;delta+=Math.max(0,x.temp-5)-n;normalDaily+=n;used++;});
    if(used<20)throw Error('Klimatický normál nemá dostatečné pokrytí');
    const shift=Math.max(-10,Math.min(10,Math.round(delta/Math.max(.75,normalDaily/used))));
    return{available:true,shift,delta:Number(delta.toFixed(1)),normal:true,days:used,note:shift>0?'Teplotní průběh ukazuje na možný dřívější nástup kvetení.':shift<0?'Teplotní průběh ukazuje na možné opoždění kvetení.':'Teplotní průběh je blízko dlouhodobému normálu.'};
  }
  async function getNdvi(){const r=await fetch('./data/ndvi-latest.json',{cache:'no-store'});if(!r.ok)throw Error('NDVI není dostupné');const j=await r.json();if(j.status!=='OK'||!j.rings)throw Error('Neplatný formát NDVI');return j;}
  function cached(){try{return JSON.parse(localStorage.getItem(CACHE)||'null');}catch(_){return null;}}
  function save(x){try{localStorage.setItem(CACHE,JSON.stringify(x));}catch(e){console.warn('Cache prognózy:',e);}}

  function monthlyModel(parcels,landscape,radius){
    const crops=parcels.filter(p=>p.distance<=radius&&p.rule&&p.area>0),cropMap=new Map();
    crops.forEach(p=>{const k=p.rule.label;if(!cropMap.has(k))cropMap.set(k,{name:k,area:0,rule:p.rule});cropMap.get(k).area+=p.area;});
    const natural=(landscape?.features||[]).filter(p=>p.distance<=radius&&p.area>0),natMap=new Map();
    natural.forEach(p=>{if(!natMap.has(p.key))natMap.set(p.key,{name:p.label,area:0,from:p.from,to:p.to,score:p.score});natMap.get(p.key).area+=p.area;});
    const months=MONTHS.map((_,i)=>{const m=i+1,cc=[...cropMap.values()].filter(x=>active(x.rule,m)),nn=[...natMap.values()].filter(x=>active(x,m)),ca=cc.reduce((s,x)=>s+x.area,0),na=nn.reduce((s,x)=>s+x.area,0),weighted=cc.reduce((s,x)=>s+x.area*x.rule.score,0)+nn.reduce((s,x)=>s+x.area*x.score,0),total=ca+na;return{month:m,cropArea:ca,naturalArea:na,totalArea:total,score:total?weighted/total:0,crops:cc,natural:nn};});
    const now=new Date().getMonth()+1,peak=months.reduce((a,b)=>b.score>a.score?b:a,months[0]),next=Array.from({length:11},(_,i)=>months[(now+i)%12]).find(x=>x.totalArea>0);
    return{current:months[now-1],peak,next,level:s=>!s?'Bez evidovaných zdrojů':s>=2.5?'Vysoký':s>=1.8?'Střední':s>=1?'Nižší':'Velmi nízký'};
  }
  function shiftedBloom(x,shift){
    const now=new Date();let year=now.getFullYear(),start=new Date(year,x.from-1,1),end=new Date(year,x.to,0);
    start.setDate(start.getDate()+shift);end.setDate(end.getDate()+shift);
    if(end<now){year++;start=new Date(year,x.from-1,1);end=new Date(year,x.to,0);start.setDate(start.getDate()+shift);end.setDate(end.getDate()+shift);}
    return{...x,start,end};
  }
  function dateLabel(d){return d.toLocaleDateString('cs-CZ',{day:'numeric',month:'long'});}
  function bloomCalendar(signal){
    const now=new Date(),limit=new Date(now);limit.setDate(limit.getDate()+90);const shift=signal?.available?signal.shift:0;
    const all=BLOOMS.map(x=>shiftedBloom(x,shift));return{current:all.filter(x=>now>=x.start&&now<=x.end),next:all.filter(x=>x.start>now&&x.start<=limit),all,shift};
  }
  function ndviInfo(data,r){const a=data?.rings?.[String(r)]||[],v=a.map(x=>({date:x.interval?.to,mean:x.outputs?.ndvi?.bands?.B0?.stats?.mean})).filter(x=>x.date&&Number.isFinite(x.mean));if(!v.length)return null;const last=v[v.length-1],prev=v.length>1?v[v.length-2]:null;return{...last,change:prev?last.mean-prev.mean:null};}
  function futureWeatherIndices(d){
    if(!d?.time?.length)return[];const now=new Date(),parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now),p=Object.fromEntries(parts.map(x=>[x.type,x.value])),today=`${p.year}-${p.month}-${p.day}`;
    return d.time.map((date,i)=>({date,i})).filter(x=>x.date>=today).map(x=>x.i).slice(0,14);
  }
  function flightInfo(w,i){
    const d=w?.daily;if(!d?.time?.length||i==null)return{label:'Předpověď není dostupná',score:0};
    const t=d.temperature_2m_max?.[i],rain=d.precipitation_sum?.[i],wind=d.wind_speed_10m_max?.[i];
    if(t==null||rain==null||wind==null)return{label:'Neúplné údaje',score:0};
    let score=100;if(t<10)score-=55;else if(t<13)score-=30;else if(t<15)score-=15;
    if(rain>=5)score-=55;else if(rain>=2)score-=35;else if(rain>=1)score-=15;
    if(wind>=35)score-=40;else if(wind>=25)score-=25;else if(wind>=20)score-=10;
    score=Math.max(0,Math.min(100,score));
    const label=score>=75?'Příznivé podmínky pro let':score>=45?'Proměnlivé podmínky': 'Omezené podmínky pro let';
    const warnings=[];if(t<13)warnings.push('chladno');if(rain>=1)warnings.push('déšť');if(wind>=20)warnings.push('vítr');
    return{label,score,warnings,t,rain,wind};
  }
  function forageEstimate(parcels,landscape,signal,weather,i){
    const date=new Date(weather.daily.time[i]+'T12:00:00'),m=date.getMonth()+1,shift=signal?.available?signal.shift:0;
    let score=0,items=[];
    parcels.filter(p=>p.distance<=5&&p.rule&&p.area>0&&active({from:p.rule.from,to:p.rule.to},m)).forEach(p=>{score+=Math.min(p.area,30)*p.rule.score*.025;if(!items.includes(p.rule.label))items.push(p.rule.label);});
    (landscape?.features||[]).filter(p=>p.distance<=5&&p.area>0&&active(p,m)).forEach(p=>{score+=Math.min(p.area,50)*p.score*.012;if(!items.includes(p.label))items.push(p.label);});
    // Fenologický posun se používá jako mírná korekce časování, nikoli jako potvrzení květu.
    if(shift&&m>=2&&m<=7)score*=1+(shift/100);
    const flight=flightInfo(weather,i);const adjusted=score*(.35+.65*flight.score/100);
    const level=adjusted>=2.4?'Silnější potenciál':adjusted>=.9?'Střední potenciál':adjusted>.15?'Slabší potenciál':'Nízký evidovaný potenciál';
    return{score:adjusted,level,items,flight};
  }
  function renderCalendar(panel,signal){
    const cal=bloomCalendar(signal);panel.append($('h3','🌸 Kalendář kvetení dřevin a keřů'));
    panel.append($('p','Orientační fenologický kalendář pro oblast Oseka. Období jsou upravena podle teplotního průběhu; výskyt konkrétní rostliny není potvrzen na jednotlivých pozemcích.','muted'));
    if(signal?.available)panel.append($('div',signal.normal?'Teplotní vliv za posledních 30 dní: '+(signal.shift>0?'možný posun přibližně o '+signal.shift+' dní dříve':signal.shift<0?'možné opoždění přibližně o '+Math.abs(signal.shift)+' dní':'bez významného posunu')+'. '+signal.note:signal.note,'notice'));
    else panel.append($('div','Teplotní úprava není dostupná; zobrazuji základní kalendář. '+(signal?.error||''),'notice'));
    const add=(heading,items,empty)=>{panel.append($('h4',heading));if(!items.length){panel.append($('div',empty,'item'));return;}items.forEach(x=>{const row=$('div',undefined,'item');row.append($('b',x.name+' · '+dateLabel(x.start)+' – '+dateLabel(x.end)),$('div',x.kind),$('div',x.group+' – '+x.note,'muted'));panel.append(row);});};
    add('Pravděpodobné období právě nyní',cal.current,'V tomto období není v kalendáři uveden hlavní druh.');
    add('Další druhy v následujících třech měsících',cal.next.filter(x=>!cal.current.includes(x)),'Žádné další druhy v nejbližším období.');
    panel.append($('h4','Roční přehled'));cal.all.forEach(x=>{const row=$('div',undefined,'item');row.append($('b',x.name),$('div',dateLabel(x.start)+' až '+dateLabel(x.end)),$('div',x.kind,'muted'));panel.append(row);});
    panel.append($('p','Skutečný začátek kvetení se může podle nadmořské výšky, odrůdy a počasí posunout i o několik týdnů. Kalendář nepotvrzuje, že rostlina právě kvete.','muted'));
  }

  function addForageStyles(){
    if(document.getElementById('vcelar-forage-card-styles'))return;
    const style=$('style');style.id='vcelar-forage-card-styles';
    style.textContent=`
      .vcelar-crop-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:12px;margin:10px 0 16px}
      .vcelar-crop-card{min-width:0;padding:14px;border:1px solid #e2c77f;border-radius:14px;background:#fff8e8;box-shadow:0 2px 7px #5a351018;color:#3e2412}
      .vcelar-crop-card-title{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;font-size:17px;line-height:1.35}
      .vcelar-crop-card-title strong{flex:1;overflow-wrap:anywhere}
      .vcelar-crop-card-title span{white-space:nowrap;font-weight:700;color:#70420c}
      .vcelar-crop-meta{display:flex;flex-wrap:wrap;gap:6px;margin:9px 0 12px}
      .vcelar-crop-meta span{padding:5px 8px;border-radius:20px;background:#f2e4bd;font-size:13px}
      .vcelar-crop-detail{display:grid;grid-template-columns:minmax(105px,.8fr) minmax(0,1.2fr);gap:8px;padding:8px 0;border-top:1px solid #eadbb9;font-size:14px;line-height:1.4}
      .vcelar-crop-detail span{overflow-wrap:anywhere}
      .vcelar-forage-map{display:block;position:relative;width:100%;min-width:0;height:360px;min-height:300px;border-radius:13px;overflow:hidden;background:#e8eee6;border:1px solid #d7b45d}
      .vcelar-map-status{margin:8px 0 14px;padding:8px 10px;background:#f7edcf;border-radius:10px;color:#715b3e;font-size:13px}
      @media(max-width:420px){.vcelar-crop-detail{grid-template-columns:1fr;gap:2px}.vcelar-forage-map{height:320px}}
    `;
    document.head.appendChild(style);
  }

  function loadForageLeaflet(){
    if(window.L)return Promise.resolve(window.L);
    return new Promise((resolve,reject)=>{
      const existing=[...document.scripts].find(x=>x.src.includes('leaflet')&&x.src.includes('.js'));
      if(existing){
        existing.addEventListener('load',()=>window.L?resolve(window.L):reject(Error('Leaflet není dostupný')),{once:true});
        existing.addEventListener('error',()=>reject(Error('Mapovou knihovnu se nepodařilo načíst')),{once:true});
        const started=Date.now(),check=()=>{if(window.L)resolve(window.L);else if(Date.now()-started>12000)reject(Error('Čekání na mapovou knihovnu vypršelo'));else setTimeout(check,150);};check();
        return;
      }
      const css=document.createElement('link');css.rel='stylesheet';css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.appendChild(css);
      const script=document.createElement('script');script.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload=()=>window.L?resolve(window.L):reject(Error('Leaflet není dostupný'));
      script.onerror=()=>reject(Error('Mapovou knihovnu se nepodařilo načíst'));document.head.appendChild(script);
    });
  }

  function initForageMap(element,status,parcels){
    const features=parcels.filter(p=>p.geometry&&p.geometry.type&&p.name&&p.name!=='Konkrétní plodina nezjištěna');
    if(!features.length){status.textContent='Pro mapu nejsou v načtených datech dostupné geometrie pozemků s konkrétní plodinou.';return;}
    if(!navigator.onLine){status.textContent='Jste offline. Přehled plodin zůstává dostupný, mapové podklady vyžadují internet.';return;}
    loadForageLeaflet().then(L=>{
      if(!element.isConnected)return;
      const map=L.map(element,{preferCanvas:true,scrollWheelZoom:false}).setView([SITE.lat,SITE.lon],12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
      const colors=p=>!p.rule?'#78909c':p.rule.score>=2.5?'#2e8b57':p.rule.score>=1.5?'#76a64b':p.rule.score>=.7?'#d4a22e':'#9a9a9a';
      const layer=L.geoJSON({type:'FeatureCollection',features:features.map((p,i)=>({type:'Feature',geometry:p.geometry,properties:{name:p.name,area:p.area,distance:p.distance,kind:p.rule?.kind||'neurčeno',color:colors(p),id:i}}))},{
        style:f=>({color:f.properties.color,fillColor:f.properties.color,weight:1.2,fillOpacity:.42}),
        onEachFeature:(f,l)=>{const p=f.properties;l.bindPopup('<b>'+String(p.name).replace(/[&<>"]/g,'')+'</b><br>'+Number(p.area||0).toFixed(1)+' ha<br>'+Number(p.distance||0).toFixed(2)+' km od stanoviště<br>'+String(p.kind).replace(/[&<>"]/g,''));}
      }).addTo(map);
      L.marker([SITE.lat,SITE.lon]).addTo(map).bindPopup('<b>Stanoviště TORENO – Osek</b>');
      [1,2,3,5].forEach((km,i)=>L.circle([SITE.lat,SITE.lon],{radius:km*1000,color:['#4b9655','#769b55','#a1a85a','#b58a43'][i],weight:1,fill:false,dashArray:'5 6'}).addTo(map));
      const bounds=layer.getBounds();if(bounds.isValid())map.fitBounds(bounds.pad(.12),{maxZoom:14});else map.setView([SITE.lat,SITE.lon],12);

      // Mapa se v aplikaci vytváří uvnitř záložky Pastva.
      // Na mobilu může prohlížeč nejprve oznámit Leafletu neúplnou velikost panelu.
      const refreshMapSize=()=>{if(element.isConnected)map.invalidateSize({pan:false,animate:false});};
      requestAnimationFrame(()=>{refreshMapSize();requestAnimationFrame(refreshMapSize);});
      [250,600,1200].forEach(ms=>setTimeout(refreshMapSize,ms));
      if('ResizeObserver' in window){
        const observer=new ResizeObserver(()=>refreshMapSize());
        observer.observe(element);
        map.once('unload',()=>observer.disconnect());
      }
      map.whenReady(refreshMapSize);
      status.textContent='Zobrazeno '+features.length+' pozemků s konkrétně evidovanou plodinou. Barvy rozlišují orientační význam zdroje, nikoli potvrzenou snůšku.';
    }).catch(e=>{console.warn('Mapa pastvy:',e);status.textContent='Mapu se nepodařilo načíst. Přehled plodin a vzdáleností zůstává dostupný.';});
  }

  function render(target,data,offline){
    target.replaceChildren();const panel=$('div',undefined,'panel');
    panel.append($('h2','🐝 Sezónní prognóza pastvy a snůšky'),$('p','Stanoviště Osek · LPIS + ZABAGED ČÚZK · okruhy 1–5 km','muted'),$('p',offline?'Poslední uložená data – offline.':'Aktualizováno: '+new Date(data.updated).toLocaleString('cs-CZ'),'muted'));
    panel.append($('h3','🍯 Měsíční potenciál plodin a krajinné vegetace'));
    RINGS.forEach(r=>{const m=monthlyModel(data.parcels,data.landscape,r),box=$('div',undefined,'notice');box.append($('b','Okruh do '+r+' km'),$('div','Aktuální měsíc ('+monthName(m.current.month)+'): '+m.level(m.current.score)),$('div','Aktivní plochy: '+round(m.current.cropArea)+' ha plodin a '+round(m.current.naturalArea)+' ha sadů, lesů a zeleně.'),$('div','Sezónní maximum: '+monthName(m.peak.month)+' · '+m.level(m.peak.score)+' · '+round(m.peak.totalArea)+' ha souhrnné plochy.'));if(m.next)box.append($('div','Nejbližší evidované období s plodinami či zelení: '+monthName(m.next.month)));panel.append(box);});
    panel.append($('p','Skóre je orientační relativní model ploch a obecných období kvetení. Není měřením nektaru ani předpovědí kilogramů medu.','muted'));
    renderCalendar(panel,data.phenology);
    panel.append($('h3','🌳 Lesy, sady, zahrady a zeleň – ZABAGED'));
    (data.landscape?.layerStatus||[]).forEach(x=>panel.append($('div',(x.ok?'✓ ':'⚠ ')+x.name+' · '+(x.ok?x.count+' objektů načteno':'vrstva nedostupná'),'item')));
    RINGS.forEach(r=>{const a=(data.landscape?.features||[]).filter(x=>x.distance<=r),area=a.reduce((s,x)=>s+x.area,0),counts=new Map();a.forEach(x=>counts.set(x.key,(counts.get(x.key)||0)+1));panel.append($('div','Do '+r+' km · '+([...counts.values()].map(v=>v+' objektů').join(', ')||'bez objektů')+' · '+round(area)+' ha celkem','item'));});
    panel.append($('p','Plochy jsou orientačně přiřazeny podle středu ohraničujícího obdélníku; objekty u hranice okruhu se mohou zařadit nepřesně.','muted'));
    panel.append($('h3','🛰️ Sentinel-2 – vývoj vegetace'));RINGS.forEach(r=>{const n=ndviInfo(data.ndvi,r);panel.append($('div',n?'Okruh '+r+' km · NDVI '+n.mean.toFixed(3)+(n.change==null?'':' · změna '+(n.change>0?'+':'')+n.change.toFixed(3))+' · '+new Date(n.date).toLocaleDateString('cs-CZ'):'Okruh '+r+' km · NDVI není dostupné','item'));});
    panel.append($('p','NDVI ukazuje zelenost vegetace, nikoli přímo kvetení nebo nektar.','muted'));

    const d=data.weather?.daily,indices=futureWeatherIndices(d);
    panel.append($('h3','🌦️ Podmínky letu včel – následujících 14 dní'));
    if(indices.length){
      const today=flightInfo(data.weather,indices[0]);panel.append($('div','Dnes: '+today.label+' · vhodnost '+today.score+'/100'+(today.warnings.length?' · upozornění: '+today.warnings.join(', '):''),'notice'));
      indices.forEach(i=>{const f=flightInfo(data.weather,i),date=d.time[i];panel.append($('div',new Date(date+'T12:00:00').toLocaleDateString('cs-CZ')+' · '+f.label+' ('+f.score+'/100) · '+(d.temperature_2m_max?.[i]??'–')+' °C · déšť '+(d.precipitation_sum?.[i]??'–')+' mm · vítr '+(d.wind_speed_10m_max?.[i]??'–')+' km/h','item'));});
      panel.append($('p','Hodnocení letových podmínek je orientační výpočet z maximální teploty, srážek a větru. Nezohledňuje všechny místní podmínky.','muted'));
    } else panel.append($('div','Aktuální předpověď není dostupná. Zkuste prognózu aktualizovat.','item'));

    panel.append($('h3','🌼 Odhad potenciálu pastvy – následujících 14 dní'));
    panel.append($('p','Model kombinuje evidované plochy plodin a krajinné vegetace s obvyklým obdobím kvetení a vhodností počasí pro let. Jde o orientační potenciál, nikoli potvrzenou snůšku.','muted'));
    if(indices.length){
      const estimates=indices.map(i=>({i,...forageEstimate(data.parcels,data.landscape,data.phenology,data.weather,i)}));
      let runs=[],run=null;estimates.forEach(x=>{if(x.score>=.9){if(!run)run={start:x.i,end:x.i,peak:x};else{run.end=x.i;if(x.score>run.peak.score)run.peak=x;}}else if(run){runs.push(run);run=null;}});if(run)runs.push(run);
      if(runs.length){panel.append($('h4','Odhadovaná období lepší pastvy'));runs.forEach(x=>{panel.append($('div','Přibližně '+dateLabel(new Date(d.time[x.start]+'T12:00:00'))+' – '+dateLabel(new Date(d.time[x.end]+'T12:00:00'))+' · vrchol '+dateLabel(new Date(d.time[x.peak.i]+'T12:00:00'))+' · '+x.peak.level,'notice'));});}
      else panel.append($('div','V dostupném čtrnáctidenním výhledu model neukazuje výraznější období pastvy.','item'));
      estimates.forEach(x=>{const date=new Date(d.time[x.i]+'T12:00:00');panel.append($('div',date.toLocaleDateString('cs-CZ')+' · '+x.level+' · let '+x.flight.score+'/100'+(x.items.length?' · možné zdroje: '+x.items.slice(0,4).join(', '):' · bez určeného aktivního zdroje'),'item'));});
    } else panel.append($('div','Odhad není dostupný bez denní předpovědi počasí.','item'));

    addForageStyles();
    panel.append($('h3','🌾 Plodiny z evidence LPIS – přehledné karty'));
    const known=data.parcels.filter(p=>p.name&&p.name!=='Konkrétní plodina nezjištěna');
    const unknown=data.parcels.filter(p=>!p.name||p.name==='Konkrétní plodina nezjištěna');
    const cropGroups=new Map();
    known.forEach((p,index)=>{
      const k=p.name;
      if(!cropGroups.has(k))cropGroups.set(k,{
        area:0,dpbIds:new Set(),declarationKeys:new Set(),geometryKeys:new Set(),
        minDistance:Infinity,maxDistance:0,rule:p.rule||rule(k),features:[]
      });
      const x=cropGroups.get(k);
      const dpb=String(p.dpbId||'').trim();
      if(dpb)x.dpbIds.add(dpb);
      const declarationKey=String(p.declarationKey||[dpb,k,p.year||'',p.area||'',index].join('|'));
      if(!x.declarationKeys.has(declarationKey)){
        x.declarationKeys.add(declarationKey);
        x.area+=p.area||0;
      }
      x.minDistance=Math.min(x.minDistance,Number(p.distance)||0);
      x.maxDistance=Math.max(x.maxDistance,Number(p.distance)||0);
      if(!x.rule&&p.rule)x.rule=p.rule;
      if(p.geometry&&p.geometry.type){
        const geometryKey=JSON.stringify(p.geometry);
        x.geometryKeys.add(geometryKey);
        if(!x.features.some(f=>JSON.stringify(f.geometry)===geometryKey))x.features.push(p);
      }
    });
    const monthSpan=r=>r.from===r.to?monthName(r.from):monthName(r.from)+'–'+monthName(r.to);
    const importance=r=>!r?'neurčeno':r.score>=2.5?'významnější potenciál':r.score>=1.5?'střední potenciál':r.score>=.7?'nižší potenciál':'malý přímý přínos';
    const cards=$('div');cards.className='vcelar-crop-grid';
    [...cropGroups.entries()].sort((a,b)=>b[1].area-a[1].area).forEach(([name,x])=>{
      const card=$('section');card.className='vcelar-crop-card';
      const heading=$('div');heading.className='vcelar-crop-card-title';
      heading.append($('strong',name),$('span',round(x.area)+' ha'));
      card.append(heading);
      const meta=$('div');meta.className='vcelar-crop-meta';
      meta.append($('span',x.dpbIds.size+' jedinečných DPB'));
      meta.append($('span',x.declarationKeys.size+' deklarací'));
      meta.append($('span',x.geometryKeys.size+' mapových částí'));
      meta.append($('span',(Number.isFinite(x.minDistance)?x.minDistance.toFixed(2):'–')+' až '+x.maxDistance.toFixed(2)+' km od stanoviště'));
      card.append(meta);
      const bloom=$('div');bloom.className='vcelar-crop-detail';
      bloom.append($('b','Obvyklé období kvetení'));
      bloom.append($('span',x.rule?monthSpan(x.rule):'V modelu neurčeno'));
      card.append(bloom);
      const value=$('div');value.className='vcelar-crop-detail';
      value.append($('b','Význam pro včely'));
      value.append($('span',x.rule?x.rule.kind+' · '+importance(x.rule):'Není spolehlivě určen'));
      card.append(value);
      cards.append(card);
    });
    if(!known.length)cards.append($('div','V aktuálně načtených LPIS záznamech není vyplněn konkrétní druh plodiny.','item'));
    panel.append(cards);
    panel.append($('div','Pozemky bez konkrétní plodiny: '+unknown.length+' záznamů · '+round(unknown.reduce((s,p)=>s+(p.area||0),0))+' ha. Jejich výměra je evidována, ale nelze ji poctivě přiřadit konkrétní plodině.','notice'));
    panel.append($('p','Období kvetení jsou orientační sezónní intervaly modelu pro oblast Oseka, nikoli potvrzení aktuálního květu. Význam pro včely je kvalitativní odhad. LPIS potvrzuje evidovanou plodinu a plochu, nikoli produkci nektaru ani skutečnou snůšku.','muted'));

    panel.append($('h3','🗺️ Mapa evidovaných plodin v okolí stanoviště'));
    panel.append($('p','Barevné plochy představují pozemky s konkrétně evidovanou plodinou. Klepnutím na plochu zobrazíš její název, výměru a vzdálenost. Mapa vyžaduje připojení k internetu.','muted'));
    const mapBox=$('div');mapBox.id='vcelarForageMap';mapBox.className='vcelar-forage-map';
    panel.append(mapBox);
    const mapStatus=$('div','Připravuji mapu pozemků…','vcelar-map-status');mapStatus.id='vcelarForageMapStatus';panel.append(mapStatus);
    initForageMap(mapBox,mapStatus,data.parcels);
    const cultures=new Map();data.parcels.forEach(p=>{const k=p.culture||'Kultura neuvedena';cultures.set(k,(cultures.get(k)||0)+1);});
    if(cultures.size)panel.append($('p','Druhy evidované kultury pozemků: '+[...cultures.entries()].map(([k,v])=>k+' ('+v+')').join(', ')+'. Kultura pozemku není totéž co aktuálně pěstovaná plodina.','muted'));
    panel.append($('h3','Přehled evidovaných pozemků podle vzdálenosti'));RINGS.forEach(r=>{const a=data.parcels.filter(p=>p.distance<=r),area=a.reduce((s,p)=>s+p.area,0),withCrop=a.filter(p=>p.name&&p.name!=='Konkrétní plodina nezjištěna').length;panel.append($('div','Do '+r+' km · '+a.length+' pozemků · '+round(area)+' ha · konkrétní plodina uvedena u '+withCrop,'item'));});
    const btn=$('button','Aktualizovat prognózu','btn primary');btn.type='button';btn.addEventListener('click',()=>update(target));panel.append(btn);target.append(panel);
  }
  async function update(target){
    target.replaceChildren($('div','Načítám LPIS, ZABAGED, čtrnáctidenní počasí a Sentinel-2…','panel'));
    try{
      const[parcels,landscape,weather,ndvi]=await Promise.all([
        getParcels(),getLandscape().catch(e=>{console.warn('ZABAGED:',e);return{features:[],layerStatus:[]};}),
        getWeather().catch(e=>{console.warn('Počasí není dostupné, pokračuji bez něj:',e);return null;}),
        getNdvi().catch(e=>{console.warn('NDVI:',e);return null;})
      ]);
      let phenology;try{phenology=await getPhenologySignal(weather);}catch(e){console.warn('Teplotní prognóza kvetení:',e);phenology={available:false,error:'Teplotní data nebo dlouhodobý normál se nepodařilo načíst.'};}
      const data={updated:new Date().toISOString(),parcels,landscape,weather,ndvi,phenology};save(data);render(target,data,false);
    }catch(e){
      console.error('Prognóza pastvy – přesná chyba:',e,e?.stack);
      const old=cached();
      if(old){
        try{render(target,old,true);target.prepend($('div','Aktualizace selhala: '+String(e?.message||e),'notice warn'));}
        catch(renderError){console.error('Chyba vykreslení uložené prognózy:',renderError);target.replaceChildren($('div','Chyba prognózy: '+String(e?.message||e)+' | Chyba zobrazení: '+String(renderError?.message||renderError),'notice warn'));}
      }else{
        target.replaceChildren($('div','Prognózu se nepodařilo načíst. Technická chyba: '+String(e?.message||e),'notice warn'));
      }
    }
  }
  function start(){const forage=document.getElementById('forage');if(!forage||document.getElementById('forecastPanel'))return;const target=$('div');target.id='forecastPanel';forage.insertBefore(target,forage.firstChild);const old=cached();if(old)render(target,old,true);else target.append($('div','Prognóza se načte při připojení k internetu.','notice'));update(target);}
  window.VcelarForecast={update,getCache:cached};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
