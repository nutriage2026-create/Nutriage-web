# Instrucciones para Claude Code

Calculadora de recordatorio de 24 horas para una nutricionista chilena. Lee `README.md` antes de cambiar algo: explica el modelo de datos, las fuentes y las decisiones ya tomadas.

## Comandos

- `npm test` — pruebas de la lógica. Deben pasar antes de dar un cambio por terminado.
- `npm run build` — valida los datos y arma `dist/index.html`.
- `npm run check` — ambas cosas.

No hay dependencias que instalar (Node 18 o superior).

## Reglas del proyecto

- La interfaz y los textos van en **español de Chile**. La usuaria no es programadora: explícale los cambios en términos de lo que verá en la calculadora.
- El entregable es `dist/index.html` en **un solo archivo**: sin archivos externos, sin frameworks, sin paso de compilación más allá de `build.mjs`. Solo carga fuentes desde Google Fonts.
- No edites `dist/index.html` a mano: cambia `src/` o `data/` y vuelve a armar.
- `src/logic.js` no toca el DOM; `src/ui.js` no contiene reglas de cálculo. Los dos son scripts clásicos que comparten variables globales (`DB`, `UNITS`, `parseText`, etc.); no los conviertas a módulos sin ajustar `build.mjs` y las pruebas.
- La página se publica como artefacto de Claude: no uses `alert`, `confirm`, `prompt`, descargas iniciadas por la página ni `window.print`. `localStorage` siempre dentro de `try/catch`.

## Reglas de datos (lo más importante)

- **Cada dato nutricional debe venir de una fuente.** No inventes ni estimes valores de composición. Si falta un dato, pídelo a la usuaria o deja el campo en `null`.
- Los valores de `k`, `p`, `ch`, `l`, `fi` son por 100 g. Si la fuente los da por porción, conviértelos y deja `po` con los gramos de esa porción.
- Alimento nuevo: agrégalo **al final** de `data/alimentos.json` con el siguiente `i` y su `src`. Nunca renumeres ni reordenes: `data/alias.json` apunta a los ids.
- Medida casera con fuente va en `m`; estimada va en `mr` (la interfaz la marca como referencial).
- **Prevalece Hurtado.** No reemplaces una medida de `m` existente por la del manual UDD ni por otra fuente sin que la usuaria lo pida. La excepción vigente es la lámina de queso (15 g).
- Frases genéricas del relato ("leche", "pan", "cazuela") van en `alias.json` con `supuesto` = 1.
- Nunca incluyas datos de pacientes (nombres, RUT, relatos reales) en el código, las pruebas ni los ejemplos.

## Al agregar o cambiar comportamiento

1. Escribe o ajusta una prueba en `test/logic.test.mjs` con un relato real de ejemplo.
2. Cambia `src/logic.js` o los datos.
3. `npm run check` y abre `dist/index.html` en el navegador para revisar la tabla.
4. Si cambió una fuente, una decisión o una limitación, actualiza `README.md` y el bloque "Cómo calcula y qué revisar" de `src/index.html`, que es lo que lee la usuaria.
