// Carga la lógica (src/logic.js) con los datos de data/ sin navegador.
import fs from 'node:fs';
const R=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,R),'utf8');
export function load(){
  const DB=JSON.parse(read('data/alimentos.json')),ALIAS_RAW=JSON.parse(read('data/alias.json'));
  const mod={exports:{}};
  new Function('DB','ALIAS_RAW','module',read('src/logic.js'))(DB,ALIAS_RAW,mod);
  return mod.exports;
}
