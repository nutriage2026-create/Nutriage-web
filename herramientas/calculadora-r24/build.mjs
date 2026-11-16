// Arma dist/index.html: una sola página con estilos, datos y código incrustados (sin dependencias).
// Uso: node build.mjs
import fs from 'node:fs';
const R=new URL('.',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,R),'utf8');
const foods=JSON.parse(read('data/alimentos.json'));
const alias=JSON.parse(read('data/alias.json'));

// Validaciones mínimas de los datos antes de publicar
foods.forEach((f,i)=>{
  if(f.i!==i)throw new Error(`alimentos.json: el campo "i" debe ser igual a la posición (fila ${i}, i=${f.i})`);
  for(const k of ['k','p','ch','l'])if(typeof f[k]!=='number'||!(f[k]>=0))throw new Error(`alimentos.json: ${f.n} tiene "${k}" inválido`);
  if(!f.n||!f.c)throw new Error(`alimentos.json: fila ${i} sin nombre o categoría`);
});
if(foods.filter(f=>f.x).length!==1)throw new Error('alimentos.json: debe existir exactamente un ítem con "x":1 (sin aporte calórico)');
for(const k in alias)if(!foods[alias[k][0]])throw new Error(`alias.json: "${k}" apunta a un id inexistente`);

// "src" es solo documentación de la fuente; no se envía a la página
const data='const DB='+JSON.stringify(foods.map(({src,...f})=>f))+';\nconst ALIAS_RAW='+JSON.stringify(alias)+';';
const put=(s,mark,val)=>{if(!s.includes(mark))throw new Error('Falta el marcador '+mark+' en src/index.html');return s.replace(mark,()=>val)};
let html=read('src/index.html');
html=put(html,'/*__CSS__*/',read('src/styles.css').trimEnd());
html=put(html,'/*__DATA__*/',data);
html=put(html,'/*__LOGIC__*/',read('src/logic.js').trimEnd());
html=put(html,'/*__UI__*/',read('src/ui.js').trimEnd());
if(/<\/script/i.test(data))throw new Error('Los datos contienen "</script"');
fs.mkdirSync(new URL('dist/',R),{recursive:true});
fs.writeFileSync(new URL('dist/index.html',R),html);
console.log(`dist/index.html listo: ${foods.length} alimentos, ${Object.keys(alias).length} alias, ${(Buffer.byteLength(html)/1024).toFixed(1)} KB`);
