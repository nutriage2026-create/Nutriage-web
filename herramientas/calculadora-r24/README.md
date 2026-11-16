# Calculadora Recordatorio 24 h

Herramienta para consulta nutricional: se escribe lo que el paciente relata que comió el día anterior (en medidas caseras o gramos) y devuelve kcal, proteínas, CHO, grasas y fibra por alimento, por tiempo de comida y del día.

Es una sola página web, sin servidor ni dependencias. Todo el cálculo ocurre en el navegador.

## Uso rápido

```bash
npm test         # pruebas de la lógica (Node 18 o superior, sin instalar nada)
npm run build    # arma dist/index.html
```

`dist/index.html` es el entregable: se abre directo en el navegador o se publica como artefacto de Claude. Debe seguir siendo **un solo archivo** con estilos, datos y código incrustados.

## Estructura

```
data/alimentos.json   Base de alimentos (639). Un alimento por línea.
data/alias.json       Cómo se dicen los alimentos en el relato -> id.
src/index.html        Maquetado, con marcadores /*__CSS__*/ /*__DATA__*/ /*__LOGIC__*/ /*__UI__*/
src/styles.css        Estilos (tema claro y oscuro).
src/logic.js          Interpretar texto, emparejar alimento, convertir medida a gramos. Sin DOM.
src/ui.js             Tabla editable, totales, metas, copiar para Excel, equivalencias guardadas.
build.mjs             Valida los datos y arma dist/index.html.
scripts/load-logic.mjs  Carga la lógica en Node para las pruebas.
test/logic.test.mjs   Pruebas (node --test).
dist/index.html       Página armada.
```

## Modelo de datos

Cada alimento de `data/alimentos.json`:

| Campo | Significado |
|---|---|
| `i` | Id. Debe ser igual a su posición en la lista. No renumerar: los alias apuntan a estos ids. |
| `n`, `c` | Nombre y categoría. Ambos se usan para emparejar el texto del relato. |
| `k`, `p`, `ch`, `l` | kcal, proteínas, CHO y lípidos **por 100 g** (o 100 ml). |
| `fi` | Fibra por 100 g. `null` = la fuente no la informa (se muestra con guion y suma 0). |
| `po` | Gramos de 1 porción de intercambio. Se usa cuando el relato no trae cantidad. |
| `m` | Medidas caseras con fuente: gramos de 1 `taza`, `cucharada`, `cucharadita`, `unidad`, `rebanada`, `lamina`, `trozo`, `racion` (plato o porción habitual), `vaso`, `copa`. Sufijos `_c` y `_g` = tamaño chico y grande. |
| `mr` | Medidas referenciales (estimadas, sin fuente). La fila queda marcada como "Medida referencial". |
| `lq` | 1 = líquido: acepta ml y medidas genéricas (taza y vaso 200 ml). |
| `x` | 1 = ítem sin aporte calórico (agua, té, café, endulzante). Debe existir exactamente uno. |
| `src` | Fuente del dato (ver abajo). Solo documentación: no se incluye en la página. |

`data/alias.json`: `"frase": [id, supuesto]`. Con `supuesto` = 1 la fila se marca "Alimento supuesto" (relato genérico: "leche", "queso", "cazuela").

## Fuentes (`src`)

| `src` | Cantidad | Fuente |
|---|---|---|
| `excel` | 501 | Tabla de composición de alimentos en Excel de la nutricionista (valores por 100 g). |
| `uchile1990` | 44 | Tabla de Composición Química de Alimentos Chilenos, U. de Chile, 8ª ed., 1990. Sin fibra dietaria; CHO = extractos no nitrogenados. |
| `udd-preparacion` | 26 | Manual de Porciones de Intercambio para Chile (UDD): preparaciones típicas, valores por porción servida. |
| `udd-ultraprocesado` | 21 | Mismo manual: aporte promedio por porción de ultraprocesados. |
| `udd-grupo` | 46 | Alimentos del manual sin composición propia: usan el **aporte promedio de su grupo de intercambio**. Es una aproximación. |
| `interno` | 1 | Ítem sin aporte calórico. |

Medidas caseras: "Contenido nutricional de una porción en los listados de intercambio básicos" (M. I. Hurtado), completadas con el manual UDD solo donde Hurtado no tenía dato.

## Decisiones tomadas con la nutricionista

- **Prevalece Hurtado.** Donde Hurtado y el manual UDD difieren, se usa Hurtado: ¾ taza de arroz cocido = 100 g, 1 cda de leche en polvo = 20 g, 1 cda de mayonesa = 28 g, 1 tajada de jamón de pavo = 50 g, 1 rebanada de mortadela = 20 g, 1 rebanada de pan integral = 40 g, 1 taza de frutillas = 200 g. Hay una prueba que lo protege.
- **Única excepción:** lámina de queso = 15 g (UDD: 2 láminas = 30 g), porque Hurtado solo define la tajada (40 g).
- **Erratas del manual UDD corregidas:** puré de papas y tomaticán traen impreso 250,8 g de CHO; se usó el valor calculado desde sus porciones (32,3 y 22,3 g).
- **Datos no cargados por parecer erratas:** zanahoria cocida 1 taza = 50 g y 8 dientes de ajo = 8 g.

## Limitaciones conocidas

- Guiso de lentejas y de garbanzos (UDD) vienen con 116 g por porción y 381 / 338 kcal, lo que parece peso en crudo. Por plato calcula bien; por gramos de guiso cocido sobreestima.
- Calzones rotos, picarones y sopaipillas pasadas no traen gramaje: 2 unidades = 1 porción, con 100 g nominales.
- 86 alimentos del Excel no tienen fibra, y ninguno de los agregados la trae.
- Las equivalencias que la usuaria guarda con Fijar o Recordar viven en `localStorage` del navegador (`r24_equiv`): no se sincronizan entre equipos.
- El botón "Interpretar con Claude" solo aparece cuando la página corre como artefacto de Claude (`window.claude.use('sample')`). No se pudo probar fuera de ese entorno.
- La tabla Excel es antigua: varias marcas ya no circulan.

## Ideas pendientes

- Tamaños de plato (chico, normal, grande) para las preparaciones.
- Guardar el recordatorio por paciente y exportarlo.
- Actualizar productos de marca con rotulado vigente.
- Agregar fibra a los alimentos que no la traen, con fuente declarada.
