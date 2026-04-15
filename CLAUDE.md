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

### Stack objetivo
- **Frontend:** HTML + CSS + JS vanilla en un solo `index.html` (mantener simplicidad)
- **Base de datos:** Notion API
- **Videollamadas:** Jitsi Meet (sin costo, sin instalación)
- **IA:** Claude API (Anthropic) con acceso a las fichas en Notion
- **Hosting:** Netlify (arrastrar archivo)

---

## Estado actual (v7 — funcional en localStorage)

El archivo activo es **`1.5nutri-v6.html`** o **`1.8nutri-v6 (7).html`** (última versión estable).
Contiene todo el sistema (~1.720 líneas) en un solo archivo.

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
2. Al entregar una versión nueva, guardar una copia con nombre versionado:
   - Formato: `NutriAge_GAS_v8_150426.gs` o `index_v8_150426.html`
3. **No usar git add/commit/push ni crear PRs** salvo que el usuario lo pida explícitamente
4. El archivo principal siempre se llama `index.html` para producción

---

## Reglas para Claude

- El archivo activo de trabajo es `index.html` en producción; en desarrollo usar nombres versionados
- Al entregar código JS, validar que no haya funciones truncadas
- Todo archivo HTML debe terminar con `</html>`
- Usar `DOMContentLoaded` para todas las inicializaciones del DOM
- Si hay cambios grandes que puedan truncar el archivo, reconstruir completo
- No agregar frameworks ni dependencias NPM — mantener todo vanilla
- No agregar comentarios innecesarios ni docstrings a código no modificado
- Respuestas cortas y directas; no resumir al final lo que ya se hizo
