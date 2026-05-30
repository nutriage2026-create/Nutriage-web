# NutriAge — Guía del Proyecto para Claude

## ¿Qué es NutriAge?

SaaS de gestión para nutricionistas. La nutricionista paga membresía mensual. El sistema tiene tres actores:

- **Paciente** — agenda citas, completa formulario clínico, se une a videollamadas
- **Nutricionista** — administra su agenda, ve fichas de pacientes, lanza videollamadas, configura disponibilidad
- **Admin** — vista global del negocio con estadísticas e ingresos

**Cliente actual:** Fernanda Ugarte (`nutriage2026@gmail.com`, WhatsApp: `56971246200`)

---

## Dirección del proyecto (v8 en adelante)

### Base de datos → Notion.so
Se abandona `localStorage`. La nueva base de datos es **Notion** (API pública). Cada entidad (pacientes, citas, disponibilidad, pagos) será una base de datos en Notion.

### Inteligencia Artificial
Se integrará un asistente IA que ayude a la nutricionista a:
- Revisar fichas clínicas de pacientes
- Sugerir seguimiento o próxima consulta
- Generar resúmenes automáticos

### Stack actual (en producción en Render)
- **Frontend:** `dashboard.html` (panel nutricionista) y `booking.html` (reserva paciente), HTML + CSS + JS vanilla — servidos por Flask
- **Backend:** Flask (`main.py` + `app/`) desplegado en Render como `nutriage-api`
- **Base de datos:** Notion API (módulo `app/services/notion.py`)
- **Agenda:** Cal.com (`app/services/calcom.py`)
- **Videollamadas:** Jitsi Meet
- **IA:** Claude API (`app/services/ai.py`)
- **Correo:** Gmail SMTP (`app/services/notifications.py`)
- **Hosting:** Render.com (push a `main` redeployó automáticamente)

---

## Estado actual

**Archivos activos en producción** (ver `main.py` rutas `/dashboard` y `/booking`):
- `dashboard.html` — panel de la nutricionista
- `booking.html` — formulario de reserva del paciente
- `main.py`, `wsgi.py`, `app/` — backend Flask
- `render.yaml`, `requirements.txt`, `Procfile`, `runtime.txt` — config Render

**Versiones antiguas archivadas en `actualizaciones_antiguas/`** (no se sirven en Render): `index.html`, `1.8nutri-v6 (7).html`, `nutri-app.html`, versiones varias, GAS legacy, etc.

### Funcionalidades ya implementadas
- Formulario clínico de 33 campos
- Calendario de disponibilidad editable por la nutricionista
- Sistema de tickets automático (`NA-AAAAMMDD-NNN`)
- Vista paciente dual: "Nueva reserva" + "Ya tengo ticket"
- Videollamadas Jitsi integradas
- Gráficos de ingresos SVG (7 y 30 días)
- Descarga Excel (CSV UTF-8)
- Sidebar con perfil editable (nombre, celular, correo)
- WhatsApp bidireccional: paciente → nutricionista y nutricionista → paciente

### Pendiente de implementar
- Migración de localStorage a Notion como base de datos
- Integración Claude API para asistente IA de la nutricionista
- Publicación en Netlify con dominio propio
- Soporte para múltiples nutricionistas

---

## Credenciales del sistema

| Elemento | Valor |
|---|---|
| Panel nutricionista | `fernanda2026` |
| Panel admin | `admin2026` |
| Precio consulta | $15.000 CLP · 45 min |
| Zona horaria | America/Santiago |
| Prefijo tickets | `NA` (ej: `NA-20260414-001`) |

---

## Diseño y estilo

- **Paleta:** morado profundo `#3d2459` + verde salvia `#4a8c54` + crema `#faf7f2`
- **Variables CSS:** `--p1`–`--p6` (morados), `--s1`–`--s5` (verdes), `--g1`–`--g5` (grises)
- **Tipografía:** Cormorant Garamond (títulos) + Nunito (texto)
- **Tono:** natural, alimentación saludable, amigable, femenino
- **Mobile-first:** bottom nav en celular, nav superior en desktop

---

## Flujo de trabajo

1. Editar archivos localmente en VS Code
2. Para probar cambios sin tocar producción, usar copia local (ej: `dashboard_local_pruebas.html`)
3. **No usar git add/commit/push ni crear PRs** salvo que el usuario lo pida explícitamente
4. Los archivos de producción son `dashboard.html` y `booking.html` (servidos por Flask en Render)

---

## Reglas para Claude

- Los archivos activos en producción son `dashboard.html` (panel nutricionista) y `booking.html` (reserva paciente); para pruebas usar copias locales tipo `dashboard_local_pruebas.html`
- Al entregar código JS, validar que no haya funciones truncadas
- Todo archivo HTML debe terminar con `</html>`
- Usar `DOMContentLoaded` para todas las inicializaciones del DOM
- Si hay cambios grandes que puedan truncar el archivo, reconstruir completo
- No agregar frameworks ni dependencias NPM — mantener todo vanilla
- No agregar comentarios innecesarios ni docstrings a código no modificado
- Respuestas cortas y directas; no resumir al final lo que ya se hizo

---

## Perfil de necesidades del usuario (Fernanda)

Patrones que se repiten en cada pedido — anticípalos y resuélvelos sin que los pida:

### 1. Todo lo que mejore la vida de la nutricionista
Cada feature apunta a que Fernanda tenga **más información del paciente, más rápido, en menos clicks**. Ficha clínica visible, link de reunión a un click, datos del paciente en la fila. Si una mejora obliga a navegar más, está mal pensada.

### 2. Botones de acción visibles en las tablas
Prefiere botones inline en cada fila (📋 Ver ficha, 📹 Entrar a sala, 📞 Llamar) en vez de menús ocultos o vistas de detalle. Patrón estándar: ícono + texto corto + color suave.

### 3. Verificar TODO en producción real
No le basta "ya está hecho". Después de cualquier cambio, espera:
1. Ejecutar tests (`node .claude/test_all.js`)
2. Hacer commit + push
3. Verificar que Render redeployó
4. Probar con datos reales (incluso ejecutar una reserva de prueba end-to-end)
5. Confirmar que aparece online

### 4. Stack en Render.com (ya productivo)
- **API:** `https://nutriage-api.onrender.com` (Flask + gunicorn)
- **Frontend:** `https://nutriage-frontend.onrender.com` (sitio estático)
- **Configuración:** `render.yaml` — push a `main` redeployó ambos servicios
- Notion como BD, Cal.com como agenda, Gmail SMTP para correos
- Cuando agregue una integración nueva, asumir que también vive en Render

### 5. Confirma antes de cualquier acción externa
Hacer commits/push, crear PRs, llamar APIs externas, mandar correos → SIEMPRE confirmar antes. Ella responde "si"/"confirmar"/"perfecto" y ahí ejecutas.

### 6. Mensajes cortos en español, con errores tipográficos
Escribe rápido y con typos ("reserba", "siginfica", "filas" cuando quiere decir "columna"). Interpretar la intención, no la literalidad. Responder siempre en español.

### 7. Conocimiento técnico básico-medio
Pregunta cosas como "qué significa el verde en VS Code" o "a quién se envía el correo". No asumir vocabulario técnico avanzado. Usar tablas, ejemplos concretos y emojis discretos cuando ayuden a la claridad. Si una respuesta es informativa, explicar el "qué" y el "por qué", no solo el comando.

### 8. Iteración: pedido pequeño → entrega + verificación → siguiente pedido
No le gustan refactors grandes ni "vamos a planear todo". Prefiere ciclos cortos: pide algo concreto, lo entregás, lo verifica, sigue con lo siguiente. Mantener cambios chicos y commits descriptivos.

### 9. Pre-cita: la nutricionista debe llegar preparada
Una de las prioridades del producto es que ella vea la ficha del paciente **antes** de entrar a la videollamada. Cualquier mejora que le ahorre tiempo en esa fase de preparación es bienvenida.
