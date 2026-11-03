# Simulador Concurso de Ascensos 2028

Simulador de preguntas por tema, publicado con **GitHub Pages**. Sin base de datos ni backend: las preguntas viven en archivos JSON dentro de este repositorio.

```text
index.html          → estructura de la página
app.js              → lógica del simulador (carga los JSON con fetch)
estilos.css         → estilos
admin.html/js/css   → panel de administración
data/temas.json     → temas (módulos)
data/preguntas.json → preguntas
```

## Estructura de los datos

### Tema (`data/temas.json`)

```json
{
  "id": 3,
  "nombre": "📕 Decreto 461/15 (Régimen Disciplinario)",
  "descripcion": "Faltas leves/graves, sanciones, procedimiento sumarial (RSA).",
  "activo": true
}
```

### Pregunta (`data/preguntas.json`)

```json
{
  "id": 125,
  "tema_id": 3,
  "tipo": "mc",
  "pregunta": "Texto de la pregunta",
  "opciones": ["Respuesta A", "Respuesta B", "Respuesta C", "Respuesta D"],
  "correcta": 1,
  "explicacion": "Art. 37: ...",
  "origen": "concurso2025",
  "activo": true,
  "created_at": "2026-11-03",
  "updated_at": "2026-11-03"
}
```

| Campo | Descripción |
|---|---|
| `id` | Número único. Nunca reutilizar uno existente. |
| `tema_id` | `id` del tema en `temas.json`. |
| `tipo` | `"mc"` (opción múltiple, muestra A/B/C…) o `"vf"` (Verdadero/Falso, sin letras). |
| `opciones` | Lista de respuestas, **sin** la letra adelante. |
| `correcta` | Posición de la respuesta correcta **empezando en 0** (0 = primera, 1 = segunda…). |
| `explicacion` | Se muestra al responder. Puede quedar `""`. |
| `origen` | De dónde salió la pregunta (`concurso2025`, `NUEVO_VISTAS_2025`, `preguntas2028/...`). Sirve para filtrar. |
| `activo` | `true` se muestra; `false` queda oculta. |

## Panel de administración (`admin.html`)

Desde `https://<usuario>.github.io/<repo>/admin.html` (o el link "⚙️ Administrar preguntas" al pie del simulador) podés:

- **Módulos**: crear, editar nombre/descripción, desactivar y reactivar. Un módulo inactivo desaparece del simulador con todas sus preguntas.
- **Preguntas**: buscar por texto o ID, filtrar por módulo, estado y origen; crear, editar (texto, opciones, correcta, explicación), desactivar y reactivar. También desactivar/reactivar en bloque todas las que coinciden con el filtro (por ejemplo, todo un origen).
- **Guardar en GitHub**: hace el commit directo en el repo. GitHub Pages publica en 1–2 minutos.
- **Descargar JSON**: alternativa sin token; bajás `preguntas.json` / `temas.json` y los subís a `data/` desde la web de GitHub (*Add file → Upload files*).

Los cambios quedan marcados en naranja hasta que se guardan. Nada se borra: todo es `activo: false`.

### Crear el token (una sola vez)

1. GitHub → foto de perfil → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. *Repository access*: **Only select repositories** → este repo.
3. *Permissions → Repository permissions → Contents*: **Read and write**.
4. Poné una fecha de vencimiento, generalo y pegalo en el panel (sección 🔑 Conexión con GitHub). Tildá "Recordar en este navegador" solo en tu computadora personal.

El token se guarda únicamente en el navegador donde lo cargaste; el código público del sitio no lo contiene. Cualquiera puede abrir `admin.html`, pero sin un token con permiso de escritura no puede guardar nada. Si lo perdés o lo compartiste por error, revocalo en la misma pantalla de GitHub.

## Cómo administrar a mano (sin panel)

> Regla de oro: **nunca borrar** preguntas ni temas. Se desactivan con `"activo": false`. Git guarda el historial de todos los cambios.

### Agregar una pregunta

1. Abrí `data/preguntas.json`.
2. Copiá el último objeto y pegalo al final (antes del `]`), separado por una coma.
3. Poné `id` = último id + 1, el `tema_id` correspondiente, el texto, las opciones y `correcta`.
4. Actualizá `created_at` y `updated_at` con la fecha del día.

### Editar una pregunta

Buscá por `id` o por texto, modificá lo necesario y actualizá `updated_at`.

### Desactivar / reactivar una pregunta

Cambiá `"activo": true` por `"activo": false` (o al revés) y actualizá `updated_at`.

### Agregar un tema

1. En `data/temas.json` agregá un objeto con `id` = último id + 1, `nombre`, `descripcion` y `"activo": true`.
2. Cargá preguntas con ese `tema_id`. Un tema sin preguntas activas no se muestra.

### Desactivar un tema que no entra en este concurso

En `data/temas.json` poné `"activo": false`. El tema y todas sus preguntas dejan de aparecer, sin tocar `preguntas.json`. Para volver a mostrarlo, `"activo": true`.

### Editar desde la web de GitHub (sin instalar nada)

1. Entrá al repo → carpeta `data` → archivo → ícono del lápiz (✏️ *Edit this file*).
2. Hacé el cambio y tocá **Commit changes**.
3. En 1–2 minutos GitHub Pages publica la nueva versión.

GitHub marca en rojo si el JSON queda mal formado (coma de más o de menos). Ante la duda, pegá el contenido en <https://jsonlint.com> antes de guardar.

### Editar desde la PC

```bash
git pull
# editar data/preguntas.json o data/temas.json
git add data/
git commit -m "Agrego preguntas de Ley 12.521"
git push
```

## Probar localmente

El navegador no permite `fetch` de archivos locales abriendo `index.html` con doble clic. Levantá un servidor en la carpeta del repo:

```bash
npx serve .
```

o

```bash
python -m http.server 8000
```

y abrí la URL que indica (por ejemplo `http://localhost:8000`).

## Publicar en GitHub Pages

En el repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**. La URL queda como `https://<usuario>.github.io/<repo>/`.
