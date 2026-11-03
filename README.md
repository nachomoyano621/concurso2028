# Simulador Concurso de Ascensos 2028

Simulador de preguntas por tema, publicado con **GitHub Pages**. Sin base de datos ni backend: las preguntas viven en archivos JSON dentro de este repositorio.

```text
index.html          → estructura de la página
app.js              → lógica del simulador (carga los JSON con fetch)
estilos.css         → estilos
acceso.js           → login de administración y guardado en GitHub
data/temas.json     → temas (módulos)
data/preguntas.json → preguntas
data/acceso.json    → token de GitHub cifrado (se crea en la configuración inicial)
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

## Modo administración (desde el celu o la PC)

Al pie del simulador: **🔒 Administrar** → contraseña. Con la sesión iniciada:

- Cada módulo muestra 🗑️ para eliminarlo (deja de verse con todas sus preguntas) o ♻️ para restaurarlo.
- Dentro de un módulo, cada pregunta muestra **🗑️ Eliminar pregunta** o **♻️ Restaurar**. En modo admin también se ven las eliminadas, marcadas en rojo.
- Cada cambio se guarda al instante como un commit en el repo y GitHub Pages lo publica en 1–2 minutos.
- **🔓 Salir de administración** cierra la sesión en ese dispositivo.

Nada se borra físicamente: "eliminar" pone `activo: false`.

### Configuración inicial (una sola vez)

1. Creá un token en GitHub → foto de perfil → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**:
   - *Repository access*: **Only select repositories** → este repo.
   - *Permissions → Repository permissions → Contents*: **Read and write**.
   - Fecha de vencimiento: la que prefieras (cuando vence, hay que repetir este paso).
2. Abrí el simulador → **🔒 Administrar**. Como todavía no hay configuración, pide contraseña (dos veces), el token, usuario y repositorio.
3. Al confirmar, la página cifra el token con la contraseña (AES-GCM + PBKDF2) y sube `data/acceso.json`. Desde ahí, en cualquier dispositivo alcanza con la contraseña.

Seguridad: la contraseña no está en el código y el token en el repo está cifrado. Aun así `acceso.json` es público, así que una contraseña larga hace mucho más difícil adivinarla por fuerza bruta. El token solo puede tocar el contenido de este repo y todo cambio queda en el historial de Git. Para cambiar la contraseña o el token: borrá `data/acceso.json` desde GitHub y repetí la configuración. Si sospechás que alguien lo obtuvo, revocá el token en GitHub.

## Cómo administrar a mano (editando los JSON)

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
