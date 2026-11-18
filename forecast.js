/* Včelař – Osek | prognóza pastvy: LPIS + ZABAGED + NDVI + počasí + kalendář kvetení */
(() => {
  'use strict';

  const SITE = { lat: 49.7804535, lon: 13.5998565 };
  const GEOJSON = './crops/plodiny_lpis_2026_osek_5km.geojson';
  const ZABAGED = 'https://ags.cuzk.gov.cz/arcgis/rest/services/ZABAGED_POLOHOPIS/MapServer';
  const CACHE = 'vcelarOsek.forecast.v6';
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

  // Orientační fenologický kalendář pro oblast Oseka.
  // Nejde o potvrzení výskytu druhu na konkrétním pozemku.
  const BLOOMS = [
    {name:'Líska',from:2,to:3,kind:'Především pyl',group:'Keře a lesní okraje',note:'Časný pylový zdroj; význam závisí na počasí.'},
    {name:'Olše',from:2,to:3,kind:'Především pyl',group:'Lesní dřeviny',note:'Časný pylový zdroj.'},
    {name:'Vrby včetně jívy',from:3,to:4,kind:'Nektar i pyl',group:'Lesní okraje a břehy',note:'Významný časný zdroj potravy.'},
    {name:'Topoly',from:3,to:4,kind:'Především pyl',group:'Lesní dřeviny',note:'Pylový zdroj; intenzita se liší podle druhu.'},
    {name:'Javory',from:4,to:5,kind:'Nektar i pyl',group:'Lesní a parkové dřeviny',note:'Kvetení podle druhu a průběhu jara.'},
    {name:'Třešeň a višeň',from:4,to:5,kind:'Nektar i pyl',group:'Ovocné stromy',note:'Krátké, na počasí citlivé kvetení.'},
    {name:'Švestka a slivoň',from:4,to:5,kind:'Nektar i pyl',group:'Ovocné stromy',note:'Termín se liší podle odrůdy a polohy.'},
    {name:'Hrušeň',from:4,to:5,kind:'Nektar i pyl',group:'Ovocné stromy',note:'Krátké jarní období kvetení.'},
    {name:'Jabloň',from:4,to:5,kind:'Nektar i pyl',group:'Ovocné stromy',note:'Termín se liší podle odrůdy.'},
    {name:'Hloh',from:5,to:6,kind:'Nektar i pyl',group:'Keře a okraje',note:'Kvetení na mezích, v remízcích a okrajích porostů.'},
    {name:'Jírovec',from:5,to:6,kind:'Nektar i pyl',group:'Parkové dřeviny',note:'Městská a parková dřevina; výskyt není z mapy potvrzen.'},
    {name:'Akát',from:5,to:6,kind:'Významný nektarový zdroj',group:'Lesní a krajinné dřeviny',note:'Kvetení silně ovlivňuje chlad a déšť.'},
    {name:'Maliník',from:5,to:7,kind:'Nektar i pyl',group:'Lesní paseky a okraje',note:'Důležitý zdroj na pasekách a okrajích.'},
    {name:'Ostružiník',from:6,to:8,kind:'Nektar i pyl',group:'Lesní okraje a křoviny',note:'Dlouhé a druhově proměnlivé období kvetení.'},
    {name:'Lípy',from:6,to:7,kind:'Významný nektarový i pylový zdroj',group:'Lesní a parkové dřeviny',note:'Jednotlivé druhy lip kvetou postupně.'},
    {name:'Vřes',from:8,to:9,kind:'Pozdní nektar i pyl',group:'Vřesoviště a suchá stanoviště',note:'Jen tam, kde se skutečně vyskytuje.'}
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
  const rule=name=>RULES.find(x=>x.re.test(name))||null;

  function points(g){const out=[];const walk=x=>{if(!Array.isArray(x))return;if(typeof x[0]==='number'&&typeof x[1]==='number')out.push(x);else x.forEach(walk);};if(g?.type==='GeometryCollection')(g.geometries||[]).forEach(x=>walk(x.coordinates));else walk(g?.coordinates);return out;}
  function centerPts(p){if(!p.length)return null;const xs=p.map(x=>x[0]),ys=p.map(x=>x[1]);return[(Math.min(...ys)+Math.max(...ys))/2,(Math.min(...xs)+Math.max(...xs))/2];}
  function arcCenter(g){if(!g)return null;if(Number.isFinite(g.x)&&Number.isFinite(g.y))return[g.y,g.x];const p=[];(g.rings||g.paths||[]).forEach(line=>line.forEach(x=>{if(Array.isArray(x)&&Number.isFinite(x[0])&&Number.isFinite(x[1]))p.push(x);}));return centerPts(p);}
  function arcArea(f){const a=Number(f?.attributes?.Shape_Area??f?.attributes?.shape_area);if(a>0)return a;const ring=f?.geometry?.rings?.[0];if(!ring)return 0;let s=0;for(let i=0,j=ring.length-1;i<ring.length;j=i++)s+=ring[j][0]*ring[i][1]-ring[i][0]*ring[j][1];return Math.abs(s/2);}

  async function readLocalParcels(){
    if(!('indexedDB'in window))return[];
    try{const db=await new Promise((ok,no)=>{const r=indexedDB.open(DB_NAME,1);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
      const data=await new Promise((ok,no)=>{const r=db.transaction(DB_STORE,'readonly').objectStore(DB_STORE).get(DB_KEY);r.onsuccess=()=>ok(r.result||null);r.onerror=()=>no(r.error);});db.close();return Array.isArray(data?.parcels)?data.parcels:[];
    }catch(e){console.warn('Lokální LPIS:',e);return[];}
  }
  async function getParcels(){
    try{const r=await fetch(GEOJSON,{cache:'no-store'});if(!r.ok)throw Error('LPIS export není dostupný');const j=await r.json();
      return(j.features||[]).flatMap(f=>{const p=f.properties||{},name=String(p.plodina||'Plodina neuvedena'),c=centerPts(points(f.geometry));if(!c)return[];const distance=dist(SITE.lat,SITE.lon,c[0],c[1]);return distance<=5.15?[{name,distance,area:Number(p.deklarovana_vymera_ha||p.dpb_vymera_ha||0),rule:rule(name)}]:[];});
    }catch(e){console.warn('LPIS export:',e);const local=await readLocalParcels();return local.flatMap(p=>{const c=centerPts(points(p.geometry));if(!c)return[];const distance=dist(SITE.lat,SITE.lon,c[0],c[1]),name=String(p.crop||p.attributes?.plodina||p.culture||'Plodina neuvedena');return distance<=5.15?[{name,distance,area:Number(p.area||p.attributes?.vymera_ha||0),rule:rule(name)}]:[];});}
  }
  function envelope(){const dy=5.25/111.32,dx=5.25/(111.32*Math.cos(SITE.lat*Math.PI/180));return{xmin:SITE.lon-dx,ymin:SITE.lat-dy,xmax:SITE.lon+dx,ymax:SITE.lat+dy};}
  async function getLayer(id){const u=new URL(`${ZABAGED}/${id}/query`),p={f:'json',where:'1=1',outFields:'*',returnGeometry:'true',geometry:JSON.stringify(envelope()),geometryType:'esriGeometryEnvelope',inSR:'4326',spatialRel:'esriSpatialRelIntersects',outSR:'4326',resultRecordCount:'2000'};Object.entries(p).forEach(([k,v])=>u.searchParams.set(k,v));const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const j=await r.json();if(j.error)throw Error(j.error.message||'Chyba ZABAGED');return j.features||[];}
  async function getLandscape(){const results=await Promise.allSettled(NATURAL.map(x=>getLayer(x.id))),features=[];results.forEach((res,i)=>{const d=NATURAL[i];if(res.status!=='fulfilled'){console.warn('ZABAGED:',d.id,res.reason);return;}res.value.forEach(f=>{const c=arcCenter(f.geometry);if(!c)return;const distance=dist(SITE.lat,SITE.lon,c[0],c[1]);if(distance>5.15)return;features.push({key:d.key,label:d.label,distance,area:arcArea(f)/10000,from:d.from,to:d.to,score:d.score});});});return{features,layerStatus:NATURAL.map((d,i)=>({name:d.label,ok:results[i].status==='fulfilled',count:results[i].status==='fulfilled'?results[i].value.length:0}))};}
  async function getWeather(){const u=new URL('https://api.open-meteo.com/v1/forecast');u.search=new URLSearchParams({latitude:SITE.lat,longitude:SITE.lon,daily:'temperature_2m_max,precipitation_sum,wind_speed_10m_max',forecast_days:'7',timezone:'Europe/Prague'});const r=await fetch(u);if(!r.ok)throw Error('Počasí není dostupné');return r.json();}
  async function getNdvi(){const r=await fetch('./data/ndvi-latest.json',{cache:'no-store'});if(!r.ok)throw Error('NDVI není dostupné');const j=await r.json();if(j.status!=='OK'||!j.rings)throw Error('Neplatný formát NDVI');return j;}
  function cached(){try{return JSON.parse(localStorage.getItem(CACHE)||'null');}catch(_){return null;}}
  function save(x){try{localStorage.setItem(CACHE,JSON.stringify(x));}catch(e){console.warn('Cache prognózy:',e);}}

  function monthlyModel(parcels,landscape,radius){
    const crops=parcels.filter(p=>p.distance<=radius&&p.rule&&p.area>0),cropMap=new Map();
    crops.forEach(p=>{const k=p.rule.label;if(!cropMap.has(k))cropMap.set(k,{name:k,area:0,rule:p.rule});const x=cropMap.get(k);x.area+=p.area;});
    const natural=(landscape?.features||[]).filter(p=>p.distance<=radius&&p.area>0),natMap=new Map();
    natural.forEach(p=>{if(!natMap.has(p.key))natMap.set(p.key,{name:p.label,area:0,from:p.from,to:p.to,score:p.score});natMap.get(p.key).area+=p.area;});
    const months=MONTHS.map((_,i)=>{const m=i+1,cc=[...cropMap.values()].filter(x=>active(x.rule,m)),nn=[...natMap.values()].filter(x=>active(x,m)),ca=cc.reduce((s,x)=>s+x.area,0),na=nn.reduce((s,x)=>s+x.area,0),weighted=cc.reduce((s,x)=>s+x.area*x.rule.score,0)+nn.reduce((s,x)=>s+x.area*x.score,0),total=ca+na;return{month:m,cropArea:ca,naturalArea:na,totalArea:total,score:total?weighted/total:0,crops:cc,natural:nn};});
    const now=new Date().getMonth()+1,peak=months.reduce((a,b)=>b.score>a.score?b:a,months[0]),next=Array.from({length:11},(_,i)=>months[(now+i)%12]).find(x=>x.totalArea>0);
    return{current:months[now-1],peak,next,level:s=>!s?'Bez evidovaných zdrojů':s>=2.5?'Vysoký':s>=1.8?'Střední':s>=1?'Nižší':'Velmi nízký'};
  }
  function bloomCalendar(){
    const now=new Date(),m=now.getMonth()+1;
    const current=BLOOMS.filter(x=>active(x,m)),next=BLOOMS.filter(x=>{for(let i=1;i<=3;i++)if(active(x,((m+i-1)%12)+1))return true;return false;});
    return{current,next};
  }
  function ndviInfo(data,r){const a=data?.rings?.[String(r)]||[],v=a.map(x=>({date:x.interval?.to,mean:x.outputs?.ndvi?.bands?.B0?.stats?.mean})).filter(x=>x.date&&Number.isFinite(x.mean));if(!v.length)return null;const last=v[v.length-1],prev=v.length>1?v[v.length-2]:null;return{...last,change:prev?last.mean-prev.mean:null};}
  function flightStatus(w){const d=w?.daily;if(!d?.time?.length)return'Počasí není dostupné';const t=d.temperature_2m_max?.[0],rain=d.precipitation_sum?.[0],wind=d.wind_speed_10m_max?.[0];if(t==null||rain==null||wind==null)return'Neúplné údaje';if(t<10)return'Chladno – omezený let';if(rain>=2)return'Déšť může omezit let';if(wind>=30)return'Silný vítr';if(t>=15&&rain<1&&wind<20)return'Příznivé podmínky pro let';return'Proměnlivé podmínky';}

  function renderCalendar(panel){
    const cal=bloomCalendar();panel.append($('h3','🌸 Kalendář kvetení dřevin a keřů'));
    panel.append($('p','Orientační fenologický kalendář pro oblast Oseka. Zobrazuje obvyklá období, nikoli potvrzený výskyt konkrétního druhu na jednotlivých pozemcích.','muted'));
    const add=(heading,items,empty)=>{panel.append($('h4',heading));if(!items.length){panel.append($('div',empty,'item'));return;}items.forEach(x=>{const row=$('div',undefined,'item');row.append($('b',x.name+' · '+monthName(x.from)+'–'+monthName(x.to)),$('div',x.kind),$('div',x.group+' – '+x.note,'muted'));panel.append(row);});};
    add('Pravděpodobné období právě nyní',cal.current,'V tomto měsíci není v kalendáři uveden hlavní druh.');
    add('Další druhy v následujících třech měsících',cal.next.filter(x=>!cal.current.includes(x)),'Žádné další druhy v nejbližším období.');
    panel.append($('h4','Roční přehled'));
    BLOOMS.forEach(x=>{
      const row=$('div',undefined,'item');
      row.append($('b',x.name),$('div',monthName(x.from)+' až '+monthName(x.to)),$('div',x.kind,'muted'));
      panel.append(row);
    });
    panel.append($('p','Skutečný začátek kvetení se může podle nadmořské výšky, odrůdy a průběhu počasí posunout i o několik týdnů. Teplotní a srážková předpověď je zobrazena níže samostatně; kalendář proto automaticky netvrdí, že rostlina právě kvete.','muted'));
  }

  function render(target,data,offline){
    target.replaceChildren();const panel=$('div',undefined,'panel');
    panel.append($('h2','🐝 Sezónní prognóza pastvy a snůšky'),$('p','Stanoviště Osek · LPIS + ZABAGED ČÚZK · okruhy 1–5 km','muted'),$('p',offline?'Poslední uložená data – offline.':'Aktualizováno: '+new Date(data.updated).toLocaleString('cs-CZ'),'muted'));
    panel.append($('h3','🍯 Měsíční potenciál plodin a krajinné vegetace'));
    RINGS.forEach(r=>{const m=monthlyModel(data.parcels,data.landscape,r),box=$('div',undefined,'notice');box.append($('b','Okruh do '+r+' km'),$('div','Aktuální měsíc ('+monthName(m.current.month)+'): '+m.level(m.current.score)),$('div','Aktivní plochy: '+round(m.current.cropArea)+' ha plodin a '+round(m.current.naturalArea)+' ha sadů, lesů a zeleně.'),$('div','Sezónní maximum: '+monthName(m.peak.month)+' · '+m.level(m.peak.score)+' · '+round(m.peak.totalArea)+' ha souhrnné plochy.'));if(m.next)box.append($('div','Nejbližší evidované období s plodinami či zelení: '+monthName(m.next.month)));panel.append(box);});
    panel.append($('p','Skóre je orientační relativní model ploch a obecných období kvetení. Není měřením nektaru ani předpovědí kilogramů medu. ZABAGED nemusí uvádět konkrétní druhy stromů.','muted'));
    renderCalendar(panel);
    panel.append($('h3','🌳 Lesy, sady, zahrady a zeleň – ZABAGED'));
    (data.landscape?.layerStatus||[]).forEach(x=>panel.append($('div',(x.ok?'✓ ':'⚠ ')+x.name+' · '+(x.ok?x.count+' objektů načteno':'vrstva nedostupná'),'item')));
    RINGS.forEach(r=>{const a=(data.landscape?.features||[]).filter(x=>x.distance<=r),area=a.reduce((s,x)=>s+x.area,0),counts=new Map();a.forEach(x=>counts.set(x.key,(counts.get(x.key)||0)+1));panel.append($('div','Do '+r+' km · '+([...counts.values()].map(v=>v+' objektů').join(', ')||'bez objektů')+' · '+round(area)+' ha celkem','item'));});
    panel.append($('p','Plochy jsou orientačně přiřazeny podle středu ohraničujícího obdélníku; malé objekty u hranice okruhu se mohou zařadit nepřesně.','muted'));
    panel.append($('h3','🛰️ Sentinel-2 – vývoj vegetace'));RINGS.forEach(r=>{const n=ndviInfo(data.ndvi,r);panel.append($('div',n?'Okruh '+r+' km · NDVI '+n.mean.toFixed(3)+(n.change==null?'':' · změna '+(n.change>0?'+':'')+n.change.toFixed(3))+' · '+new Date(n.date).toLocaleDateString('cs-CZ'):'Okruh '+r+' km · NDVI není dostupné','item'));});
    panel.append($('p','NDVI ukazuje zelenost vegetace, nikoli přímo kvetení nebo nektar.','muted'));
    panel.append($('h3','🌦️ Podmínky letu včel – následujících 7 dní'),$('p',flightStatus(data.weather),'notice'));const d=data.weather?.daily;if(d?.time)(d.time||[]).forEach((date,i)=>panel.append($('div',new Date(date).toLocaleDateString('cs-CZ')+' · '+(d.temperature_2m_max?.[i]??'–')+' °C · déšť '+(d.precipitation_sum?.[i]??'–')+' mm · vítr '+(d.wind_speed_10m_max?.[i]??'–')+' km/h','item')));
    panel.append($('h3','Přehled evidovaných plodin podle vzdálenosti'));RINGS.forEach(r=>{const a=data.parcels.filter(p=>p.distance<=r),area=a.reduce((s,p)=>s+p.area,0);panel.append($('div','Do '+r+' km · '+a.length+' záznamů plodin · '+round(area)+' ha','item'));});
    const btn=$('button','Aktualizovat prognózu','btn primary');btn.type='button';btn.addEventListener('click',()=>update(target));panel.append(btn);target.append(panel);
  }
  async function update(target){
    target.replaceChildren($('div','Načítám LPIS, ZABAGED, počasí a Sentinel-2…','panel'));
    try{const[parcels,landscape,weather,ndvi]=await Promise.all([getParcels(),getLandscape().catch(e=>{console.warn('ZABAGED:',e);return{features:[],layerStatus:[]};}),getWeather(),getNdvi().catch(e=>{console.warn('NDVI:',e);return null;})]);const data={updated:new Date().toISOString(),parcels,landscape,weather,ndvi};save(data);render(target,data,false);}
    catch(e){console.warn('Prognóza pastvy:',e);const old=cached();if(old)render(target,old,true);else target.replaceChildren($('div','Prognóza není dostupná. Zkontrolujte připojení a zkuste aktualizaci.','notice warn'));}
  }
  function start(){const forage=document.getElementById('forage');if(!forage||document.getElementById('forecastPanel'))return;const target=$('div');target.id='forecastPanel';forage.insertBefore(target,forage.firstChild);const old=cached();if(old)render(target,old,true);else target.append($('div','Prognóza se načte při připojení k internetu.','notice'));update(target);}
  window.VcelarForecast={update,getCache:cached};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
