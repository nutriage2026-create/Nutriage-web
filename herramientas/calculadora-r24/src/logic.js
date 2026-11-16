/* Lógica de la Calculadora Recordatorio 24 h: interpreta el relato, empareja alimentos y convierte medidas a gramos.
   Sin DOM. Los datos (DB y ALIAS_RAW) los antepone build.mjs desde data/. */
const ZERO_ID=DB.findIndex(f=>f.x);
const MEALS=['Desayuno','Colación','Almuerzo','Once','Cena','Otro'];
const UNITS=[['g','g'],['ml','ml'],['porcion','porción'],['unidad','unidad'],['taza','taza'],['vaso','vaso'],['cucharada','cucharada'],['cucharadita','cucharadita'],['rebanada','rebanada'],['lamina','lámina'],['racion','porción habitual / plato'],['punado','puñado'],['trozo','trozo'],['tazon','tazón'],['copa','copa'],['lata','lata']];
const UNIT_KEYS=UNITS.map(u=>u[0]);
const STOP=new Set('de del la el los las al a en tipo con y un una o e para sin grande grandes chico chica chicos chicas mediano mediana medianos medianas pequeno pequena pequenos pequenas regular regulares'.split(' '));
const NUMW={un:1,una:1,uno:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10,medio:.5,media:.5,cuarto:.25,once:11,doce:12};
const UNIT_RE=[
 ['g',/^(?:gramos?|grs?|g)\b\.?\s*/],['kg',/^(?:kilos?|kg)\b\.?\s*/],['ml',/^(?:mililitros?|ml|cc)\b\.?\s*/],['l',/^(?:litros?|lts?|l)\b\.?\s*/],
 ['cucharadita',/^(?:cucharaditas?|cdtas?|cditas?)\b\.?\s*/],['cucharada',/^(?:cucharadas?|cucharas?|cdas?)\b\.?\s*/],
 ['tazon',/^(?:tazon(?:es)?)\b\s*/],['taza',/^(?:tazas?)\b\s*/],['vaso',/^(?:vasos?)\b\s*/],['unidad',/^(?:unidad(?:es)?|unid|und|potes?|envases?|bombon(?:es)?)\b\.?\s*/],
 ['rebanada',/^(?:rebanadas?|tajadas?|rodelas?)\b\s*/],['lamina',/^(?:laminas?|fetas?)\b\s*/],['racion',/^(?:(?:raciones?|porcion(?:es)? (?:regular(?:es)?|habitual(?:es)?)|platos?|presas?|biste(?:ques?|cs?))\b|filetes?(?= de ))\s*/],['porcion',/^(?:porcion(?:es)?)\b\s*/],
 ['punado',/^(?:punados?)\b\s*/],['trozo',/^(?:trozos?|pedazos?)\b\s*/],['copa',/^(?:copas?)\b\s*/],['lata',/^(?:latas?)\b\s*/]];
const GEN_LIQ={taza:200,vaso:200,tazon:300,copa:150,lata:350,cucharada:15,cucharadita:5};
const GEN_ANY={cucharada:15,cucharadita:5};

function norm(s){
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/(\d),(\d)/g,'$1.$2').replace(/½/g,' 1/2').replace(/¼/g,' 1/4').replace(/¾/g,' 3/4')
    .replace(/(\d)\/(\d)/g,'$1⁄$2').replace(/(\d)\.(\d)/g,'$1·$2')
    .replace(/[^a-z0-9⁄·]+/g,' ').replace(/⁄/g,'/').replace(/·/g,'.').trim();
}
function sing(t){
  if(t.length>4&&/[^aeiou]es$/.test(t))return t.slice(0,-2);
  if(t.length>3&&t.endsWith('s'))return t.slice(0,-1);
  return t;
}
function toks(s){return norm(s).split(' ').filter(t=>t.length>1&&!STOP.has(t)&&!/^[\d./]+$/.test(t)).map(sing)}
function tmatch(a,b){
  if(a===b)return true;
  if(Math.abs(a.length-b.length)>1)return false;
  let i=0;while(i<a.length&&i<b.length&&a[i]===b[i])i++;
  return i>=Math.max(4,Math.min(a.length,b.length)-1);
}
DB.forEach(f=>{f.nt=toks(f.n.replace(/\(\d+\)$/,''));f.ct=toks(f.c);f.label=f.n+' · '+f.c});
const LABEL=new Map(DB.map(f=>[f.label,f.i]));
const ALIAS={};for(const k in ALIAS_RAW)ALIAS[toks(k).join(' ')]=ALIAS_RAW[k];
const CAT_PEN={'Bebidas':.06,'Helados':.08,'Galletas':.06,'Condimentos y especies':.03,'Chocolates y otros':.03};

function matchFood(phrase,noZero){
  const n=norm(phrase), q=toks(phrase);
  if(!q.length)return {id:null,score:0};
  const key=q.join(' ');
  if(/\b(zero|light|sin azucar)\b/.test(n)&&/^(bebida|gaseosa|coca|cocacola|sprite|fanta|pepsi)\b/.test(n))return {id:ZERO_ID,score:1,assumed:1};
  if(ALIAS[key])return {id:ALIAS[key][0],score:1,assumed:ALIAS[key][1]};
  let best={id:null,score:0};
  for(const f of DB){
    if(f.x)continue;
    let qs=0,hit=0;
    for(const t of q){
      if(f.nt.some(x=>tmatch(t,x))){qs+=1}
      else if(f.ct.some(x=>tmatch(t,x))){qs+=.7}
    }
    for(const x of f.nt){if(q.some(t=>tmatch(t,x)))hit++}
    if(!hit)continue;
    let sc=.65*qs/q.length+.35*hit/f.nt.length;
    const pen=CAT_PEN[f.c];
    if(pen&&!q.some(t=>f.ct.some(x=>tmatch(t,x))))sc-=pen;
    if(/cocid/i.test(f.c)||/COCID/.test(f.n))sc+=.02;
    if(sc>best.score)best={id:f.i,score:sc};
  }
  if(!noZero&&best.score<.95&&/^(te|cafe|agua|aguita|infusion|mate|endulzante|stevia|sucralosa|sacarina)\b/.test(n))return {id:ZERO_ID,score:1};
  return best;
}

function parseItem(raw){
  let s=norm(raw).replace(/\by medi[ao]\b/g,'mediaextra');
  s=s.replace(/^(?:(?:y|luego|despues|tambien|ademas|mas|comio|comi|tomo|tome|bebio|bebi|almorzo|ceno|se sirvio|me servi)\s+)+/,'');
  let qty=null,unit=null,half=0,m;
  if((m=s.match(/^(\d+(?:\.\d+)?)\s+(\d+)\/(\d+)\s*/))){qty=+m[1]+m[2]/m[3];s=s.slice(m[0].length)}
  else if((m=s.match(/^(\d+)\/(\d+)\s*/))){qty=m[1]/m[2];s=s.slice(m[0].length)}
  else if((m=s.match(/^(\d+(?:\.\d+)?)\s*/))){qty=+m[1];s=s.slice(m[0].length)}
  else if((m=s.match(/^([a-z]+)\s+/))&&NUMW[m[1]]!=null){qty=NUMW[m[1]];s=s.slice(m[0].length)}
  if(s.startsWith('mediaextra')){half=.5;s=s.slice(10).trim()}
  let size='',bistec=false;
  for(const [u,re] of UNIT_RE){const mm=s.match(re);if(mm&&(qty!=null||!/^(g|l)$/.test(u))){unit=u;bistec=/^biste/.test(mm[0]);s=s.slice(mm[0].length);break}}
  const adj=s.match(/^(?:(?:soperas?|grandes?|chic[oa]s?|pequen[oa]s?|median[oa]s?|regular(?:es)?|hond[oa]s?|baj[oa]s?|colmadas?|rasas?|llen[oa]s?)\s+)+/);
  if(adj){if(/chic|pequen/.test(adj[0]))size='c';else if(/grande/.test(adj[0]))size='g';s=s.slice(adj[0].length)}
  if(s.startsWith('mediaextra')){half=.5;s=s.slice(10).trim()}
  s=s.replace(/^del?\s+/,'');
  if(unit==null&&(m=s.match(/\s(\d+(?:\.\d+)?)\s*(gramos?|grs?|g|ml|cc|kg)$/))){qty=+m[1];unit=/^g/.test(m[2])?'g':(m[2]==='kg'?'kg':'ml');s=s.slice(0,-m[0].length)}
  s=s.replace(/mediaextra/g,'').trim();
  if(!size){if(/\b(chic[oa]s?|pequen[oa]s?)\b/.test(s))size='c';else if(/\bgrandes?\b/.test(s))size='g'}
  if(bistec&&(!s||/^(vacuno|carne)$/.test(s)))s='bistec';
  let noQty=false;
  if(qty==null&&unit==null){qty=1;unit='porcion';noQty=true}
  else{if(qty==null)qty=1;if(unit==null)unit='unidad'}
  qty+=half;
  if(unit==='kg'){unit='g';qty*=1000}
  if(unit==='l'){unit='ml';qty*=1000}
  return {qty:Math.round(qty*1000)/1000,unit,food:s,noQty,size};
}

const MEAL_RE=/^\s*((?:al|a la|en el|en la|de|del|para el|para la|el|la)\s+)?(desayuno|almuerzo|cena|once|colaci[oó]n(?:es)?|merienda|snack|media ma[nñ]ana|media tarde|otros?|extras?|picoteo)(?![a-záéíóúñ])\s*(?:\([^)]*\))?\s*([:\-–—]?)\s*/i;
function mealOf(w){w=norm(w);if(w==='desayuno')return 'Desayuno';if(w==='almuerzo')return 'Almuerzo';if(w==='cena')return 'Cena';if(w==='once')return 'Once';if(/^(otro|extra|picoteo)/.test(w))return 'Otro';return 'Colación'}

function convert(food,qty,unit,custom,size){
  const pick=o=>o?(size&&o[unit+'_'+size]!=null?o[unit+'_'+size]:o[unit]):null;
  if(!food)return {g:0,st:'crit'};
  if(unit==='g')return {g:qty,st:'ok'};
  if(unit==='ml')return {g:qty,st:food.lq?'ok':'ref'};
  const ck=custom&&custom[food.n+'|'+unit];
  if(ck)return {g:qty*ck,st:'ok'};
  if(unit==='porcion')return food.po?{g:qty*food.po,st:'ok'}:{g:qty*100,st:'falta'};
  if(pick(food.m))return {g:qty*pick(food.m),st:'ok'};
  if(pick(food.mr))return {g:qty*pick(food.mr),st:'ref'};
  if(food.lq&&GEN_LIQ[unit])return {g:qty*GEN_LIQ[unit],st:(unit==='taza'||unit==='vaso')?'ok':'ref'};
  if(GEN_ANY[unit])return {g:qty*GEN_ANY[unit],st:'ref'};
  return {g:qty*(food.po||100),st:'falta'};
}

function parseText(text,custom){
  const rows=[];let meal='Otro';
  const chunks=String(text).split(/[;\n]+|,(?!\d)|\.(?!\d)|\s\+\s/);
  for(let c of chunks){
    c=c.trim();if(!c)continue;
    const mm=c.match(MEAL_RE);
    if(mm&&!(mm[2].toLowerCase()==='once'&&!mm[1]&&!mm[3])){meal=mealOf(mm[2]);c=c.slice(mm[0].length).trim();if(!c)continue}
    c=c.replace(/\s+y\s+medi([ao])(?![a-z])/gi,' ymedi$1');
    let parts=[c];
    if(/\s(?:con|y|m[aá]s)\s/i.test(c)){
      const whole=matchFood(parseItem(c.replace(/ymedi/g,'y medi')).food,true);
      if(whole.score<.9)parts=c.split(/\s+(?:con|y|m[aá]s)\s+/i).filter(x=>x.trim());
    }
    for(let p of parts){
      p=p.replace(/ymedi/g,'y medi').trim();
      const it=parseItem(p);if(!it.food)continue;
      const mt=matchFood(it.food);
      const r={meal,raw:p,qty:it.qty,unit:it.unit,size:it.size,foodId:mt.score>=.5?mt.id:null,flag:mt.score<.5?'nomatch':(mt.assumed?'supuesto':(mt.score<.7?'revisar':'')),noQty:it.noQty,manual:false};
      computeRow(r,custom);rows.push(r);
    }
  }
  return rows;
}
function computeRow(r,custom){
  const f=r.foodId!=null?DB[r.foodId]:null;
  if(!r.manual&&r.src!=='ia'){const cv=convert(f,r.qty,r.unit,custom,r.size);r.grams=Math.round(cv.g*10)/10;r.st=f&&f.x?'ok':(r.noQty&&cv.st==='ok'?'falta':cv.st)}
  const k=f?r.grams/100:0;
  r.k=f?f.k*k:0;r.p=f?f.p*k:0;r.ch=f?f.ch*k:0;r.l=f?f.l*k:0;r.fi=f&&f.fi!=null?f.fi*k:0;r.fiNA=!!(f&&f.fi==null);
  return r;
}
function totals(rows){const t={k:0,p:0,ch:0,l:0,fi:0};for(const r of rows){if(r.foodId==null)continue;t.k+=r.k;t.p+=r.p;t.ch+=r.ch;t.l+=r.l;t.fi+=r.fi}return t}
if(typeof module!=='undefined')module.exports={DB,parseText,parseItem,matchFood,totals,convert};
