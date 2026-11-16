// Pruebas de la lógica: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from '../scripts/load-logic.mjs';
const L=load();
const one=(txt,custom={})=>{const r=L.parseText(txt,custom);assert.equal(r.length,1,'se esperaba 1 fila para: '+txt);return r[0]};
const name=r=>r.foodId==null?null:L.DB[r.foodId].n;
const near=(a,b,tol=0.6)=>assert.ok(Math.abs(a-b)<=tol,`${a} ≉ ${b}`);

test('datos: ids consecutivos y alias válidos',()=>{
  L.DB.forEach((f,i)=>assert.equal(f.i,i));
  assert.equal(L.DB.filter(f=>f.x).length,1);
});

test('gramos directos',()=>{
  const r=one('120 g de pechuga de pollo');
  assert.equal(r.grams,120);assert.equal(name(r),'PECHUGA ASADA S/PIEL');near(r.k,198);
});

test('medidas caseras de Hurtado (no se reemplazan por las del manual UDD)',()=>{
  assert.equal(one('3/4 taza de arroz').grams,100);          // ¾ taza de arroz cocido = 100 g
  assert.equal(one('1 marraqueta').grams,100);
  assert.equal(one('1 cucharada de leche en polvo descremada').grams,20);
  assert.equal(one('1 cucharada de mayonesa').grams,28);
  assert.equal(one('1 lámina de jamón de pavo').grams,50);
  assert.equal(one('1 tajada de queso').grams,40);
});

test('queso laminado: 1 lámina = 15 g (manual UDD)',()=>{
  const r=one('2 láminas de queso');assert.equal(r.grams,30);assert.equal(r.flag,'supuesto');
});

test('fracciones y "y media"',()=>{
  assert.equal(one('1 taza y media de lentejas').qty,1.5);
  assert.equal(one('1/2 marraqueta').grams,50);
  assert.equal(one('media palta').qty,0.5);
});

test('preparaciones chilenas del manual UDD: valores por porción',()=>{
  let r=one('1 plato de cazuela');assert.equal(name(r),'CAZUELA DE VACUNO (PLATO)');assert.equal(r.grams,250);near(r.k,391);near(r.p,16.5);
  r=one('porotos con riendas');assert.equal(name(r),'POROTOS CON RIENDAS');near(r.k,351);   // no se divide en "porotos" + "riendas"
  r=one('1 empanada');assert.equal(r.grams,172);near(r.k,467);
  r=one('2 sopaipillas');near(r.k,267);
  r=one('1 plato de puré');near(r.ch,32.3);                                                 // errata del manual corregida
});

test('alimentos por promedio de grupo y ultraprocesados',()=>{
  let r=one('2 mandarinas');assert.equal(r.grams,180);near(r.k,60);near(r.ch,15);
  r=one('1 yogurt griego');assert.equal(r.grams,110);near(r.k,110);
  r=one('1 pote de postre de leche');assert.equal(r.grams,120);near(r.k,120);
  r=one('1 taza de leche de almendras');assert.equal(r.grams,200);near(r.k,52);
});

test('sin aporte calórico',()=>{
  for(const t of ['té sin azúcar','1 vaso de agua','coca cola zero']){const r=one(t);assert.equal(r.k,0,t)}
});

test('tiempos de comida y separación con "con"',()=>{
  const rows=L.parseText('Desayuno: 1 marraqueta con 2 cucharadas de palta\nOnce: té',{});
  assert.deepEqual(rows.map(r=>r.meal),['Desayuno','Desayuno','Once']);
  near(rows[1].grams,53.4);
});

test('estados: sin coincidencia, sin cantidad y equivalencias propias',()=>{
  assert.equal(one('2 unidades de xyzzyq').foodId,null);
  const r=one('helado');assert.equal(r.st,'falta');assert.equal(r.noQty,true);
  const c=one('1 taza de arroz',{'ARROZ|taza':150});assert.equal(c.grams,150);assert.equal(c.st,'ok');
});

test('totales',()=>{
  const rows=L.parseText('1 marraqueta, 1 plátano, 1 cucharadita de azúcar',{});
  const t=L.totals(rows);near(t.k,279+109.4+19.9,1);
});
