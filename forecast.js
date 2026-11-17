/* Včelař – Osek | sezónní model kvetení a potenciálu snůšky */
(() => {
  'use strict';
  const SITE = { lat: 49.7804535, lon: 13.5998565 };
  const GEOJSON = './crops/plodiny_lpis_2026_osek_5km.geojson';
  const CACHE = 'vcelarOsek.forecast.v4';
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
  const $ = (tag, text, cls) => { const n=document.createElement(tag); if(text!==undefined)n.textContent=text; if(cls)n.className=cls; return n; };
  const monthName = m => MONTHS[m-1];
  function coords(g){const a=[];const walk=x=>{if(!Array.isArray(x))return;if(typeof x[0]==='number'&&typeof x[1]==='number')a.push(x);else x.forEach(walk);};if(g)walk(g.coordinates);return a;}
  function dist(a,b,c,d){const r=x=>x*Math.PI/180;const h=Math.sin(r(c-a)/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(r(d-b)/2)**2;return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
  function rule(name){return RULES.find(x=>x.re.test(name))||null;}
  async function getParcels(){const r=await fetch(GEOJSON);if(!r.ok)throw Error('GeoJSON LPIS není dostupný');const j=await r.json();return (j.features||[]).flatMap(f=>{const p=f.properties||{},name=String(p.plodina||'Plodina neuvedena').trim(),pts=coords(f.geometry),rr=rule(name);if(!pts.length)return[];const lon=pts.reduce((s,x)=>s+x[0],0)/pts.length,lat=pts.reduce((s,x)=>s+x[1],0)/pts.length,distance=dist(SITE.lat,SITE.lon,lat,lon),area=Number(p.deklarovana_vymera_ha||p.dpb_vymera_ha||0);return distance<=5.15?[{name,distance,area,rule:rr}]:[];});}
  async function getWeather(){const u=new URL('https://api.open-meteo.com/v1/forecast');u.search=new URLSearchParams({latitude:SITE.lat,longitude:SITE.lon,daily:'temperature_2m_max,precipitation_sum,wind_speed_10m_max',forecast_days:'7',timezone:'Europe/Prague'});const r=await fetch(u);if(!r.ok)throw Error('Počasí není dostupné');return r.json();}
  async function getNdvi(){const r=await fetch('./data/ndvi-latest.json',{cache:'no-store'});if(!r.ok)throw Error('NDVI není dostupné');const j=await r.json();if(j.status!=='OK'||!j.rings)throw Error('Neplatný formát NDVI');return j;}
  function cached(){try{return JSON.parse(localStorage.getItem(CACHE)||'null')}catch(_){return null;}}
  function save(x){try{localStorage.setItem(CACHE,JSON.stringify(x));}catch(_){}}
  function monthlyModel(parcels,radius){
    const rows=parcels.filter(p=>p.distance<=radius&&p.rule&&p.area>0);
    const byCrop=new Map();
    rows.forEach(p=>{const k=p.rule.label;if(!byCrop.has(k))byCrop.set(k,{name:k,area:0,parcels:0,nearest:p.distance,rule:p.rule});const c=byCrop.get(k);c.area+=p.area;c.parcels++;c.nearest=Math.min(c.nearest,p.distance);});
    const crops=[...byCrop.values()], active=(r,m)=>r.from<=r.to?m>=r.from&&m<=r.to:m>=r.from||m<=r.to;
    const months=MONTHS.map((_,i)=>{const m=i+1,list=crops.filter(c=>active(c.rule,m));const area=list.reduce((s,c)=>s+c.area,0),weighted=list.reduce((s,c)=>s+c.area*c.rule.score,0);return{month:m,area,score:area?weighted/area:0,crops:list};});
    const now=new Date().getMonth()+1,cur=months[now-1],next=Array.from({length:11},(_,i)=>months[(now+i)%12]).find(m=>m.area>0),peak=months.reduce((a,b)=>b.score>a.score?b:a,months[0]);
    const level=s=>!s?'Bez evidované plodiny':s>=2.5?'Vysoký':s>=1.8?'Střední':s>=1?'Nižší':'Velmi nízký';
    return{totalArea:rows.reduce((s,p)=>s+p.area,0),cropCount:crops.length,current:cur,peak,next,level};
  }
  function ndviInfo(data,radius){const a=data?.rings?.[String(radius)]||[];const vals=a.map(x=>({date:x.interval?.to,mean:x.outputs?.ndvi?.bands?.B0?.stats?.mean})).filter(x=>x.date&&Number.isFinite(x.mean));if(!vals.length)return null;const last=vals[vals.length-1],prev=vals.length>1?vals[vals.length-2]:null;return{...last,change:prev?last.mean-prev.mean:null};}
  function flightStatus(w){const d=w?.daily;if(!d?.time?.length)return'Počasí není dostupné';const t=d.temperature_2m_max?.[0],rain=d.precipitation_sum?.[0],wind=d.wind_speed_10m_max?.[0];if(t==null||rain==null||wind==null)return'Neúplné údaje';if(t<10)return'Chladno – omezený let';if(rain>=2)return'Déšť může omezit let';if(wind>=30)return'Silný vítr';if(t>=15&&rain<1&&wind<20)return'Příznivé podmínky pro let';return'Proměnlivé podmínky';}
  function render(target,data,offline){target.replaceChildren();const panel=$('div',undefined,'panel');panel.append($('h2','🐝 Sezónní prognóza pastvy a snůšky'),$('p','Stanoviště Osek · LPIS do 5 km','muted'),$('p',offline?'Poslední uložená data – offline.':'Aktualizováno: '+new Date(data.updated).toLocaleString('cs-CZ'),'muted'));
    panel.append($('h3','🍯 Měsíční potenciál podle plodin LPIS'));
    RINGS.forEach(radius=>{const m=monthlyModel(data.parcels,radius),box=$('div',undefined,'notice');box.append($('b','Okruh do '+radius+' km'),$('div','Aktuální měsíc ('+monthName(m.current.month)+'): '+m.level(m.current.score)),$('div','Plocha evidovaných plodin s kalendářním kvetením nyní: '+m.current.area.toFixed(1)+' ha'),$('div','Sezónní maximum: '+monthName(m.peak.month)+' · '+m.level(m.peak.score)+' · '+m.peak.area.toFixed(1)+' ha v květu'));if(m.next){const n=m.next.crops.slice().sort((a,b)=>b.area-a.area)[0];box.append($('div','Nejbližší očekávané kvetení: '+n.name+' · '+monthName(m.next.month)+' · '+m.next.area.toFixed(1)+' ha celkem'));}panel.append(box);});
    panel.append($('p','Skóre vyjadřuje relativní potenciál evidovaných plodin v období kvetení. Nejde o měření nektaru ani předpověď množství medu. Plodina v LPIS nemusí být skutečně vysetá nebo právě kvést.','muted'));
    panel.append($('h3','🛰️ Sentinel‑2 – vývoj vegetace'));RINGS.forEach(radius=>{const n=ndviInfo(data.ndvi,radius);panel.append($('div',n?'Okruh '+radius+' km · NDVI '+n.mean.toFixed(3)+(n.change==null?'':' · změna '+(n.change>0?'+':'')+n.change.toFixed(3))+' · '+new Date(n.date).toLocaleDateString('cs-CZ'):'Okruh '+radius+' km · NDVI není dostupné','item'));});panel.append($('p','NDVI ukazuje zelenost vegetace v celém okruhu. Je doplňkovým ukazatelem stavu porostů, nikoli přímým ukazatelem kvetení nebo nektaru.','muted'));
    panel.append($('h3','🌦️ Podmínky letu včel – následujících 7 dní'),$('p',flightStatus(data.weather),'notice'));const d=data.weather?.daily;if(d?.time)(d.time||[]).forEach((date,i)=>panel.append($('div',new Date(date).toLocaleDateString('cs-CZ')+' · '+(d.temperature_2m_max?.[i]??'–')+' °C · déšť '+(d.precipitation_sum?.[i]??'–')+' mm · vítr '+(d.wind_speed_10m_max?.[i]??'–')+' km/h','item')));
    panel.append($('h3','Přehled plodin podle vzdálenosti'));RINGS.forEach(radius=>{const a=data.parcels.filter(p=>p.distance<=radius),area=a.reduce((s,p)=>s+p.area,0);panel.append($('div','Do '+radius+' km · '+a.length+' pozemkových záznamů · '+area.toFixed(1)+' ha','item'));});
    const btn=$('button','Aktualizovat prognózu','btn primary');btn.type='button';btn.addEventListener('click',()=>update(target));panel.append(btn);target.append(panel);
  }
  async function update(target){target.replaceChildren($('div','Načítám LPIS, počasí a Sentinel‑2…','panel'));try{const [parcels,weather,ndvi]=await Promise.all([getParcels(),getWeather(),getNdvi().catch(e=>{console.warn(e);return null;})]);const data={updated:new Date().toISOString(),parcels,weather,ndvi};save(data);render(target,data,false);}catch(e){console.warn('Prognóza pastvy:',e);const old=cached();if(old)render(target,old,true);else target.replaceChildren($('div','Prognóza není dostupná. Zkontrolujte připojení a zkuste aktualizaci.','notice warn'));}}
  function start(){const forage=document.getElementById('forage');if(!forage||document.getElementById('forecastPanel'))return;const target=$('div');target.id='forecastPanel';forage.insertBefore(target,forage.firstChild);const old=cached();if(old)render(target,old,true);else target.append($('div','Prognóza se načte při připojení k internetu.','notice'));update(target);}
  window.VcelarForecast={update,getCache:cached};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
