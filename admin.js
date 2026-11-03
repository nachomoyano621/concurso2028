// ========== PANEL DE ADMINISTRACIÓN ==========
// Edita data/temas.json y data/preguntas.json. Nunca borra: desactiva con "activo": false.
// Guarda directo en GitHub (API de contenidos) con un token personal guardado solo en este navegador,
// o descarga los JSON para subirlos a mano.

const POR_PAGINA = 50;
const CLAVE_CONFIG = "simulador2028.github";
const ARCHIVOS = { temas: "data/temas.json", preguntas: "data/preguntas.json" };

let temas = [], preguntas = [];
let originales = { temas: "", preguntas: "" };       // JSON tal como se cargó, para detectar cambios
let originalesPorId = { temas: new Map(), preguntas: new Map() };
let shas = { temas: null, preguntas: null };
let fuente = "sitio";                                  // "sitio" | "github"
let pagina = 0;

const $ = id => document.getElementById(id);

function escaparHTML(texto) {
    return String(texto ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

const hoy = () => new Date().toLocaleDateString("sv-SE");   // AAAA-MM-DD en hora local
const aJSON = datos => JSON.stringify(datos, null, 2) + "\n";
const nombreTema = id => temas.find(t => t.id === id)?.nombre ?? `Tema ${id}`;

function aviso(texto, tipo = "") {
    const div = $("aviso");
    div.className = "aviso " + tipo;
    div.innerHTML = texto;
    div.hidden = !texto;
}

// ---------- Configuración de GitHub ----------

function leerConfig() {
    let guardada = {};
    try { guardada = JSON.parse(localStorage.getItem(CLAVE_CONFIG) || "{}"); } catch (e) { /* sin storage */ }
    // En GitHub Pages se deduce usuario y repo de la URL
    if (!guardada.owner && location.hostname.endsWith(".github.io")) {
        guardada.owner = location.hostname.split(".")[0];
        guardada.repo = location.pathname.split("/")[1] || location.hostname;
    }
    $("ghOwner").value = guardada.owner || "";
    $("ghRepo").value = guardada.repo || "";
    $("ghBranch").value = guardada.branch || "main";
    $("ghToken").value = guardada.token || "";
    $("ghRecordar").checked = !!guardada.token;
    return guardada;
}

function configActual() {
    return {
        owner: $("ghOwner").value.trim(),
        repo: $("ghRepo").value.trim(),
        branch: $("ghBranch").value.trim() || "main",
        token: $("ghToken").value.trim()
    };
}

function guardarConfig() {
    const cfg = configActual();
    if (!$("ghRecordar").checked) delete cfg.token;
    try { localStorage.setItem(CLAVE_CONFIG, JSON.stringify(cfg)); } catch (e) { /* sin storage */ }
}

async function github(ruta, opciones = {}) {
    const cfg = configActual();
    const resp = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/${ruta}`, {
        ...opciones,
        headers: {
            "Authorization": `Bearer ${cfg.token}`,
            "Accept": opciones.accept || "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            ...(opciones.body ? { "Content-Type": "application/json" } : {})
        }
    });
    if (!resp.ok) {
        let detalle = "";
        try { detalle = (await resp.json()).message; } catch (e) { /* sin cuerpo */ }
        const err = new Error(`GitHub ${resp.status}: ${detalle || resp.statusText}`);
        err.status = resp.status;
        throw err;
    }
    return resp;
}

function aBase64(texto) {
    const bytes = new TextEncoder().encode(texto);
    let binario = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binario);
}

function estadoConexion(texto, tipo) {
    const chip = $("estadoConexion");
    chip.textContent = texto;
    chip.className = "chip " + (tipo || "");
}

// ---------- Carga de datos ----------

function aplicarDatos(nuevosTemas, nuevasPreguntas) {
    temas = nuevosTemas;
    preguntas = nuevasPreguntas;
    originales = { temas: aJSON(temas), preguntas: aJSON(preguntas) };
    originalesPorId = {
        temas: new Map(temas.map(t => [t.id, JSON.stringify(t)])),
        preguntas: new Map(preguntas.map(p => [p.id, JSON.stringify(p)]))
    };
    pagina = 0;
    renderTodo();
}

async function cargarDesdeSitio() {
    const leer = archivo => fetch(archivo, { cache: "no-cache" })
        .then(r => { if (!r.ok) throw new Error(`${archivo}: ${r.status}`); return r.json(); });
    const [t, p] = await Promise.all([leer(ARCHIVOS.temas), leer(ARCHIVOS.preguntas)]);
    fuente = "sitio";
    shas = { temas: null, preguntas: null };
    aplicarDatos(t, p);
}

async function cargarDesdeGithub() {
    const cfg = configActual();
    if (!cfg.owner || !cfg.repo || !cfg.token) throw new Error("Completá usuario, repositorio y token.");
    const repo = await (await github("")).json();
    if (!repo.permissions?.push) throw new Error("El token no tiene permiso de escritura sobre el repositorio.");

    // Los sha se toman del listado de la carpeta (sirve aunque el archivo pese más de 1 MB)
    const listado = await (await github(`contents/data?ref=${encodeURIComponent(cfg.branch)}`)).json();
    const sha = nombre => listado.find(f => f.path === nombre)?.sha ?? null;
    const leerCrudo = async ruta => JSON.parse(await (await github(
        `contents/${ruta}?ref=${encodeURIComponent(cfg.branch)}`, { accept: "application/vnd.github.raw+json" })).text());

    const [t, p] = await Promise.all([leerCrudo(ARCHIVOS.temas), leerCrudo(ARCHIVOS.preguntas)]);
    fuente = "github";
    shas = { temas: sha(ARCHIVOS.temas), preguntas: sha(ARCHIVOS.preguntas) };
    aplicarDatos(t, p);
    estadoConexion(`Conectado a ${cfg.owner}/${cfg.repo} (${cfg.branch})`, "ok");
}

// ---------- Cambios pendientes ----------

function archivosModificados() {
    const lista = [];
    if (aJSON(temas) !== originales.temas) lista.push("temas");
    if (aJSON(preguntas) !== originales.preguntas) lista.push("preguntas");
    return lista;
}

function contarCambios(tipo, lista) {
    const orig = originalesPorId[tipo];
    return lista.filter(x => orig.get(x.id) !== JSON.stringify(x)).length;
}

function renderCambios() {
    const modificados = archivosModificados();
    const nT = contarCambios("temas", temas), nP = contarCambios("preguntas", preguntas);
    const hay = modificados.length > 0;
    $("barraCambios").classList.toggle("pendiente", hay);
    $("textoCambios").textContent = hay
        ? `✏️ Cambios sin guardar: ${nT} módulo(s), ${nP} pregunta(s)`
        : (fuente === "github" ? "✔ Todo guardado en GitHub" : "Sin cambios pendientes");
    $("btnGuardar").disabled = !hay || fuente !== "github";
    $("btnGuardar").title = fuente !== "github" ? "Conectá GitHub para guardar directo" : "";
    $("btnDescartar").disabled = !hay;
}

async function guardarEnGithub() {
    const cfg = configActual();
    const modificados = archivosModificados();
    if (!modificados.length) return;
    const mensaje = $("mensajeCommit").value.trim() || "Actualizo preguntas desde el panel";
    $("btnGuardar").disabled = true;
    aviso("Guardando en GitHub…");
    try {
        for (const tipo of modificados) {
            const contenido = tipo === "temas" ? aJSON(temas) : aJSON(preguntas);
            const resp = await github(`contents/${ARCHIVOS[tipo]}`, {
                method: "PUT",
                body: JSON.stringify({ message: `${mensaje} (${tipo})`, content: aBase64(contenido), sha: shas[tipo], branch: cfg.branch })
            });
            shas[tipo] = (await resp.json()).content.sha;
            originales[tipo] = contenido;
            originalesPorId[tipo] = new Map((tipo === "temas" ? temas : preguntas).map(x => [x.id, JSON.stringify(x)]));
        }
        $("mensajeCommit").value = "";
        aviso("✅ Guardado. GitHub Pages publica la nueva versión en 1–2 minutos.", "ok");
    } catch (err) {
        console.error(err);
        const conflicto = err.status === 409 || err.status === 422;
        aviso(conflicto
            ? "⚠️ El archivo cambió en GitHub desde que lo cargaste. Descargá tus cambios como respaldo, reconectá y volvé a aplicarlos."
            : `❌ No se pudo guardar: ${escaparHTML(err.message)}`, "error");
    }
    renderTodo();
}

function descargar(nombre, contenido) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([contenido], { type: "application/json;charset=utf-8" }));
    link.download = nombre;
    link.click();
    URL.revokeObjectURL(link.href);
}

function descargarJSON() {
    const modificados = archivosModificados();
    const lista = modificados.length ? modificados : ["temas", "preguntas"];
    lista.forEach((tipo, i) => setTimeout(() =>
        descargar(`${tipo}.json`, tipo === "temas" ? aJSON(temas) : aJSON(preguntas)), i * 400));
    aviso(`📥 Descargado: ${lista.map(t => t + ".json").join(" y ")}. Subilo/s a la carpeta <code>data/</code> del repo (Add file → Upload files) reemplazando los actuales.`);
}

function descartar() {
    if (!confirm("¿Descartar todos los cambios sin guardar?")) return;
    aplicarDatos(JSON.parse(originales.temas), JSON.parse(originales.preguntas));
    aviso("");
}

// ---------- Módulos ----------

function renderTemas() {
    $("cuerpoTemas").innerHTML = temas.map(t => {
        const delTema = preguntas.filter(p => p.tema_id === t.id);
        const activas = delTema.filter(p => p.activo).length;
        const modificado = originalesPorId.temas.get(t.id) !== JSON.stringify(t);
        return `<tr class="${t.activo ? "" : "inactivo"} ${modificado ? "modificado" : ""}">
            <td>${t.id}</td>
            <td><strong>${escaparHTML(t.nombre)}</strong><br><span class="ayuda">${escaparHTML(t.descripcion)}</span></td>
            <td>${activas} / ${delTema.length}</td>
            <td><span class="estado ${t.activo ? "on" : "off"}">${t.activo ? "Activo" : "Inactivo"}</span></td>
            <td class="botones">
                <button class="btn btn-mini btn-sec" data-ver-tema="${t.id}">Ver preguntas</button>
                <button class="btn btn-mini" data-editar-tema="${t.id}">Editar</button>
                <button class="btn btn-mini ${t.activo ? "btn-pdf" : "btn-download"}" data-toggle-tema="${t.id}">${t.activo ? "Desactivar" : "Reactivar"}</button>
            </td>
        </tr>`;
    }).join("");
}

function toggleTema(id) {
    const t = temas.find(x => x.id === id);
    t.activo = !t.activo;
    t.updated_at = hoy();
    renderTodo();
}

let temaEditando = null;
function abrirTema(id) {
    temaEditando = id ? temas.find(x => x.id === id) : null;
    $("tituloDlgTema").textContent = temaEditando ? `Editar módulo #${id}` : "Nuevo módulo";
    $("tNombre").value = temaEditando?.nombre ?? "";
    $("tDescripcion").value = temaEditando?.descripcion ?? "";
    $("tActivo").checked = temaEditando?.activo ?? true;
    $("dlgTema").showModal();
}

$("formTema").addEventListener("submit", e => {
    if (e.submitter?.value !== "ok") return;
    const datos = { nombre: $("tNombre").value.trim(), descripcion: $("tDescripcion").value.trim(), activo: $("tActivo").checked };
    if (temaEditando) {
        Object.assign(temaEditando, datos, { updated_at: hoy() });
    } else {
        const id = Math.max(0, ...temas.map(t => t.id)) + 1;
        temas.push({ id, ...datos, created_at: hoy(), updated_at: hoy() });
    }
    renderTodo();
});

// ---------- Preguntas ----------

function renderFiltros() {
    const temaSel = $("fTema").value, origenSel = $("fOrigen").value;
    $("fTema").innerHTML = `<option value="">Todos los módulos</option>` +
        temas.map(t => `<option value="${t.id}">${escaparHTML(t.nombre)}${t.activo ? "" : " (inactivo)"}</option>`).join("");
    $("fTema").value = temaSel;
    const origenes = [...new Set(preguntas.map(p => p.origen).filter(Boolean))].sort();
    $("fOrigen").innerHTML = `<option value="">Todos los orígenes</option>` +
        origenes.map(o => `<option value="${escaparHTML(o)}">${escaparHTML(o)}</option>`).join("");
    $("fOrigen").value = origenSel;
    $("pTema").innerHTML = temas.map(t => `<option value="${t.id}">${escaparHTML(t.nombre)}</option>`).join("");
}

function preguntasFiltradas() {
    const texto = $("fTexto").value.trim().toLowerCase();
    const tema = $("fTema").value, estado = $("fEstado").value, origen = $("fOrigen").value;
    return preguntas.filter(p =>
        (!tema || p.tema_id === Number(tema)) &&
        (!estado || p.activo === (estado === "1")) &&
        (!origen || p.origen === origen) &&
        (!texto || String(p.id) === texto || p.pregunta.toLowerCase().includes(texto) ||
            p.opciones.some(o => o.toLowerCase().includes(texto)))
    );
}

function renderPreguntas() {
    const lista = preguntasFiltradas();
    const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
    pagina = Math.min(pagina, paginas - 1);
    const visibles = lista.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
    $("textoFiltradas").textContent = `${lista.length} pregunta(s) filtradas`;
    $("cuerpoPreguntas").innerHTML = visibles.map(p => {
        const modificado = originalesPorId.preguntas.get(p.id) !== JSON.stringify(p);
        const temaInactivo = !temas.find(t => t.id === p.tema_id)?.activo;
        return `<tr class="${p.activo ? "" : "inactivo"} ${modificado ? "modificado" : ""}">
            <td>${p.id}</td>
            <td>${escaparHTML(nombreTema(p.tema_id))}${temaInactivo ? `<br><span class="ayuda">(módulo inactivo)</span>` : ""}</td>
            <td class="texto">${escaparHTML(p.pregunta)}<br><span class="ayuda">✔ ${escaparHTML(p.opciones[p.correcta])}</span></td>
            <td><span class="estado ${p.activo ? "on" : "off"}">${p.activo ? "Activa" : "Inactiva"}</span></td>
            <td class="botones">
                <button class="btn btn-mini" data-editar-pregunta="${p.id}">Editar</button>
                <button class="btn btn-mini ${p.activo ? "btn-pdf" : "btn-download"}" data-toggle-pregunta="${p.id}">${p.activo ? "Desactivar" : "Reactivar"}</button>
            </td>
        </tr>`;
    }).join("") || `<tr><td colspan="5" class="ayuda">No hay preguntas con esos filtros.</td></tr>`;
    $("pagTexto").textContent = `Página ${pagina + 1} / ${paginas}`;
    $("pagAnterior").disabled = pagina === 0;
    $("pagSiguiente").disabled = pagina >= paginas - 1;
}

function togglePregunta(id) {
    const p = preguntas.find(x => x.id === id);
    p.activo = !p.activo;
    p.updated_at = hoy();
    renderTodo();
}

function cambiarFiltradas(activo) {
    const lista = preguntasFiltradas().filter(p => p.activo !== activo);
    if (!lista.length) return;
    if (!confirm(`¿${activo ? "Reactivar" : "Desactivar"} ${lista.length} pregunta(s)?`)) return;
    lista.forEach(p => { p.activo = activo; p.updated_at = hoy(); });
    renderTodo();
}

let preguntaEditando = null;

function filaOpcion(texto, correcta) {
    const fila = document.createElement("div");
    fila.className = "opcion-fila";
    fila.innerHTML = `<span class="letra"></span>
        <input type="radio" name="pCorrecta" ${correcta ? "checked" : ""} title="Correcta">
        <input type="text" value="${escaparHTML(texto)}">
        <button type="button" class="btn btn-mini btn-pdf" title="Quitar opción">✕</button>`;
    fila.querySelector("button").addEventListener("click", () => { fila.remove(); letrasOpciones(); });
    $("pOpciones").appendChild(fila);
    letrasOpciones();
}

function letrasOpciones() {
    [...$("pOpciones").children].forEach((f, i) => { f.querySelector(".letra").textContent = String.fromCharCode(65 + i); });
}

function abrirPregunta(id) {
    preguntaEditando = id ? preguntas.find(x => x.id === id) : null;
    const p = preguntaEditando || {
        tema_id: Number($("fTema").value) || temas[0]?.id, tipo: "mc", pregunta: "",
        opciones: ["", "", "", ""], correcta: 0, explicacion: "", origen: "panel", activo: true
    };
    $("tituloDlgPregunta").textContent = preguntaEditando ? `Editar pregunta #${id}` : "Nueva pregunta";
    $("pTema").value = p.tema_id;
    $("pTipo").value = p.tipo;
    $("pTexto").value = p.pregunta;
    $("pExplicacion").value = p.explicacion;
    $("pOrigen").value = p.origen || "";
    $("pActivo").checked = p.activo;
    $("pOpciones").innerHTML = "";
    p.opciones.forEach((o, i) => filaOpcion(o, i === p.correcta));
    $("pError").hidden = true;
    $("dlgPregunta").showModal();
}

$("pTipo").addEventListener("change", () => {
    if ($("pTipo").value !== "vf") return;
    $("pOpciones").innerHTML = "";
    filaOpcion("Verdadero", true);
    filaOpcion("Falso", false);
});

$("btnAgregarOpcion").addEventListener("click", () => filaOpcion("", false));

$("formPregunta").addEventListener("submit", e => {
    if (e.submitter?.value !== "ok") return;
    const filas = [...$("pOpciones").children];
    const opciones = filas.map(f => f.querySelector('input[type="text"]').value.trim());
    const correcta = filas.findIndex(f => f.querySelector('input[type="radio"]').checked);
    const texto = $("pTexto").value.trim();
    let error = "";
    if (!texto) error = "Falta el texto de la pregunta.";
    else if (opciones.length < 2) error = "Tiene que haber al menos 2 opciones.";
    else if (opciones.some(o => !o)) error = "Hay opciones vacías: completalas o quitalas.";
    else if (correcta < 0) error = "Marcá cuál es la opción correcta.";
    if (error) {
        e.preventDefault();
        $("pError").textContent = error;
        $("pError").hidden = false;
        return;
    }
    const datos = {
        tema_id: Number($("pTema").value), tipo: $("pTipo").value, pregunta: texto, opciones, correcta,
        explicacion: $("pExplicacion").value.trim(), origen: $("pOrigen").value.trim(), activo: $("pActivo").checked
    };
    if (preguntaEditando) {
        Object.assign(preguntaEditando, datos, { updated_at: hoy() });
    } else {
        const id = Math.max(0, ...preguntas.map(p => p.id)) + 1;
        preguntas.push({ id, ...datos, created_at: hoy(), updated_at: hoy() });
        aviso(`Pregunta #${id} creada (sin guardar todavía).`);
    }
    renderTodo();
});

// ---------- Render general y eventos ----------

function renderTodo() {
    renderFiltros();
    renderTemas();
    renderPreguntas();
    renderCambios();
}

function mostrarTab(nombre) {
    document.querySelectorAll(".tab").forEach(b => b.classList.toggle("activa", b.dataset.tab === nombre));
    $("tabTemas").hidden = nombre !== "temas";
    $("tabPreguntas").hidden = nombre !== "preguntas";
}

document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => mostrarTab(b.dataset.tab)));

$("cuerpoTemas").addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.toggleTema) toggleTema(Number(b.dataset.toggleTema));
    if (b.dataset.editarTema) abrirTema(Number(b.dataset.editarTema));
    if (b.dataset.verTema) {
        $("fTema").value = b.dataset.verTema;
        pagina = 0;
        renderPreguntas();
        mostrarTab("preguntas");
    }
});

$("cuerpoPreguntas").addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.togglePregunta) togglePregunta(Number(b.dataset.togglePregunta));
    if (b.dataset.editarPregunta) abrirPregunta(Number(b.dataset.editarPregunta));
});

["fTexto", "fTema", "fEstado", "fOrigen"].forEach(id =>
    $(id).addEventListener("input", () => { pagina = 0; renderPreguntas(); }));
$("pagAnterior").addEventListener("click", () => { pagina--; renderPreguntas(); });
$("pagSiguiente").addEventListener("click", () => { pagina++; renderPreguntas(); });

$("btnNuevoTema").addEventListener("click", () => abrirTema(null));
$("btnNuevaPregunta").addEventListener("click", () => abrirPregunta(null));
$("btnDesactivarFiltradas").addEventListener("click", () => cambiarFiltradas(false));
$("btnActivarFiltradas").addEventListener("click", () => cambiarFiltradas(true));
$("btnGuardar").addEventListener("click", guardarEnGithub);
$("btnDescargar").addEventListener("click", descargarJSON);
$("btnDescartar").addEventListener("click", descartar);

$("btnConectar").addEventListener("click", async () => {
    if (archivosModificados().length && !confirm("Tenés cambios sin guardar que se van a perder al recargar desde GitHub. ¿Continuar?")) return;
    guardarConfig();
    estadoConexion("Conectando…");
    try {
        await cargarDesdeGithub();
        $("bloqueGithub").open = false;
        aviso("");
    } catch (err) {
        console.error(err);
        estadoConexion("Error", "error");
        aviso(`❌ ${escaparHTML(err.message)}`, "error");
    }
});

$("btnOlvidar").addEventListener("click", () => {
    $("ghToken").value = "";
    $("ghRecordar").checked = false;
    guardarConfig();
    fuente = "sitio";
    estadoConexion("Sin conectar");
    renderCambios();
});

window.addEventListener("beforeunload", e => {
    if (archivosModificados().length) { e.preventDefault(); e.returnValue = ""; }
});

// Inicio: si hay token recordado se conecta a GitHub; si no, lee los JSON publicados
(async () => {
    const cfg = leerConfig();
    try {
        if (cfg.token) {
            await cargarDesdeGithub();
        } else {
            await cargarDesdeSitio();
            $("bloqueGithub").open = true;
            aviso("Sin conexión a GitHub: podés editar y usar «Descargar JSON», o conectá GitHub para guardar directo.");
        }
    } catch (err) {
        console.error(err);
        estadoConexion("Error", "error");
        aviso(`❌ ${escaparHTML(err.message)}`, "error");
        if (fuente !== "github" && !temas.length) await cargarDesdeSitio().catch(() => {});
    }
})();
