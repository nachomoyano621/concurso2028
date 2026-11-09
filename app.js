// ========== SIMULADOR CONCURSO 2028 ==========
// Datos: data/temas.json y data/preguntas.json. Solo se muestra lo activo (y de módulos activos).
// Progreso de estudio (respuestas, marcadas, intentos): localStorage de cada dispositivo.
// Administración (con login): eliminar = "activo": false; lo eliminado se ve solo en la Papelera.

const ARCHIVOS = { temas: "data/temas.json", preguntas: "data/preguntas.json" };
const CLAVE_PROGRESO = "simulador2028.progreso";
const CLAVE_TEMA = "simulador2028.tema";

let temas = [], preguntas = [];
let shas = { temas: null, preguntas: null };
let progreso = cargarProgreso();
let quiz = null;
const estado = { busqueda: "", filtroModulo: "", busquedaPapelera: "" };

const $ = id => document.getElementById(id);
const esAdmin = () => Acceso.logueado();
const hoy = () => new Date().toLocaleDateString("sv-SE");   // AAAA-MM-DD en hora local

function escaparHTML(texto) {
    return String(texto ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function mezclar(lista) {
    const a = [...lista];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

const normalizar = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const temaPorId = id => temas.find(t => t.id === id);
const nombreTema = id => temaPorId(id)?.nombre ?? `Módulo ${id}`;
const preguntasVisibles = () => preguntas.filter(p => p.activo && temaPorId(p.tema_id)?.activo);
const preguntasDeTema = id => preguntasVisibles().filter(p => p.tema_id === id);
const temasVisibles = () => temas.filter(t => t.activo && (esAdmin() || preguntasDeTema(t.id).length));
const temasEliminados = () => temas.filter(t => !t.activo);
const preguntasEliminadas = () => preguntas.filter(p => !p.activo);

// ========== PROGRESO (por dispositivo) ==========

function cargarProgreso() {
    const vacio = { respuestas: {}, marcadas: [], intentos: [] };
    try { return { ...vacio, ...JSON.parse(localStorage.getItem(CLAVE_PROGRESO) || "{}") }; }
    catch (e) { return vacio; }
}

function guardarProgreso() {
    try { localStorage.setItem(CLAVE_PROGRESO, JSON.stringify(progreso)); } catch (e) { /* sin storage */ }
}

function registrarRespuesta(id, acierto) {
    const r = progreso.respuestas[id] || { ok: 0, mal: 0 };
    if (acierto) r.ok++; else r.mal++;
    r.ultima = acierto;
    r.fecha = Date.now();
    progreso.respuestas[id] = r;
    guardarProgreso();
}

const esMarcada = id => progreso.marcadas.includes(id);
const preguntasConError = () => preguntasVisibles().filter(p => progreso.respuestas[p.id]?.ultima === false);
const preguntasMarcadas = () => preguntasVisibles().filter(p => esMarcada(p.id));

function toggleMarcada(id) {
    progreso.marcadas = esMarcada(id) ? progreso.marcadas.filter(x => x !== id) : [...progreso.marcadas, id];
    guardarProgreso();
}

// Cobertura = % de preguntas respondidas alguna vez; dominio = % cuya última respuesta fue correcta
function resumen(lista) {
    let respondidas = 0, bien = 0;
    lista.forEach(p => {
        const r = progreso.respuestas[p.id];
        if (r) { respondidas++; if (r.ultima) bien++; }
    });
    return {
        total: lista.length,
        respondidas,
        cobertura: lista.length ? Math.round(respondidas * 100 / lista.length) : 0,
        dominio: respondidas ? Math.round(bien * 100 / respondidas) : null
    };
}

// ========== CARGA DE DATOS ==========

async function cargarDatos() {
    if (esAdmin()) {
        // En modo admin se lee directo del repo: GitHub Pages puede tardar en reflejar el último cambio
        const [t, p] = await Promise.all([Acceso.leerArchivo(ARCHIVOS.temas), Acceso.leerArchivo(ARCHIVOS.preguntas)]);
        temas = t.datos;
        preguntas = p.datos;
        shas = { temas: t.sha, preguntas: p.sha };
        return;
    }
    // "no-cache" revalida contra el servidor para no mostrar una versión vieja tras un push
    const leer = archivo => fetch(archivo, { cache: "no-cache" })
        .then(r => { if (!r.ok) throw new Error(`${archivo}: ${r.status}`); return r.json(); });
    [temas, preguntas] = await Promise.all([leer(ARCHIVOS.temas), leer(ARCHIVOS.preguntas)]);
}

async function recargar() {
    try {
        await cargarDatos();
    } catch (err) {
        if (!esAdmin() || err.status !== 401) throw err;
        Acceso.salir();
        aviso("La sesión de administración venció. Volvé a ingresar.", "error");
        await cargarDatos();
    }
    $("chipAdmin").hidden = !esAdmin();
    navegar();
}

// ========== GUARDADO (solo admin) ==========

let colaGuardado = Promise.resolve();
let pendientes = 0;

function estadoGuardado(texto) {
    $("estadoGuardado").textContent = texto;
}

function guardar(tipo, mensaje, revertir) {
    pendientes++;
    estadoGuardado("⏳ Guardando…");
    colaGuardado = colaGuardado.then(async () => {
        try {
            shas[tipo] = await Acceso.guardarArchivo(ARCHIVOS[tipo], tipo === "temas" ? temas : preguntas, shas[tipo], mensaje);
        } catch (err) {
            console.error(err);
            revertir();
            refrescar();
            aviso(`❌ No se guardó: ${escaparHTML(err.message)}`, "error");
        } finally {
            pendientes--;
            estadoGuardado(pendientes ? "⏳ Guardando…" : "✓ Guardado");
        }
    });
}

window.addEventListener("beforeunload", e => {
    if (pendientes) { e.preventDefault(); e.returnValue = ""; }
});

function cambiarPregunta(id, activo) {
    const p = preguntas.find(x => x.id === id);
    const anterior = { activo: p.activo, updated_at: p.updated_at };
    p.activo = activo;
    p.updated_at = hoy();
    guardar("preguntas", `${activo ? "Restauro" : "Elimino"} pregunta ${id}`, () => Object.assign(p, anterior));
    if (!activo) quitarDelQuiz(id);
    refrescar();
    aviso(activo ? "♻️ Pregunta restaurada." : "🗑️ Pregunta eliminada. Está en la Papelera.", "ok",
        activo ? null : { texto: "Deshacer", fn: () => cambiarPregunta(id, true) });
}

function cambiarTema(id, activo) {
    const t = temaPorId(id);
    if (!activo && !confirm(`¿Eliminar el módulo "${t.nombre}"?\nDeja de verse junto con sus preguntas. Queda en la Papelera.`)) return;
    const anterior = { activo: t.activo, updated_at: t.updated_at };
    t.activo = activo;
    t.updated_at = hoy();
    guardar("temas", `${activo ? "Restauro" : "Elimino"} módulo ${id}: ${t.nombre}`, () => Object.assign(t, anterior));
    refrescar();
    aviso(activo ? "♻️ Módulo restaurado." : "🗑️ Módulo eliminado. Está en la Papelera.", "ok",
        activo ? null : { texto: "Deshacer", fn: () => cambiarTema(id, true) });
}

// ========== AVISOS ==========

let avisoTimer = null;
function aviso(texto, tipo = "", accion = null) {
    const div = $("toast");
    div.className = "toast visible " + tipo;
    div.innerHTML = `<span>${texto}</span>` + (accion ? `<button class="toast-accion">${escaparHTML(accion.texto)}</button>` : "");
    if (accion) div.querySelector("button").addEventListener("click", () => { div.classList.remove("visible"); accion.fn(); });
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => div.classList.remove("visible"), tipo === "error" ? 8000 : accion ? 6000 : 3000);
}

// ========== MENÚ LATERAL ==========

function rutaActual() {
    const [nombre, param] = location.hash.replace(/^#\/?/, "").split("/");
    return { nombre: nombre || "inicio", param };
}

function renderMenu() {
    const { nombre, param } = rutaActual();
    const item = (ruta, icono, texto, contador = "", rojo = false) => {
        const [r, p] = ruta.split("/");
        const activo = r === nombre && (p === undefined || p === param);
        return `<a href="#/${ruta}" class="menu-item ${activo ? "activo" : ""}">${icono} <span>${escaparHTML(texto)}</span>${contador !== "" ? `<span class="contador ${rojo ? "rojo" : ""}">${contador}</span>` : ""}</a>`;
    };
    const visibles = temasVisibles();
    const errores = preguntasConError().length;
    const enModulo = nombre === "modulo";

    let html = `<div class="menu-seccion">Estudio</div>
        ${item("inicio", "🏠", "Inicio")}
        <details class="submenu" ${enModulo ? "open" : ""}>
            <summary class="menu-item ${nombre === "modulos" ? "activo" : ""}">📚 <span>Módulos</span><span class="contador">${visibles.length}</span><span class="flecha">▶</span></summary>
            <div class="submenu-lista">
                ${item("modulos", "🗂️", "Ver todos")}
                ${visibles.map(t => item(`modulo/${t.id}`, "", t.nombre, preguntasDeTema(t.id).length)).join("")}
            </div>
        </details>
        ${item("aleatorio", "🎯", "Test aleatorio (50)")}
        ${item("simulacro", "🎲", "Simulacro de examen")}
        ${item("errores", "❌", "Repasar errores", errores || "", true)}
        ${item("marcadas", "⭐", "Marcadas", preguntasMarcadas().length || "")}
        ${item("buscar", "🔍", "Buscar preguntas")}
        ${item("estadisticas", "📊", "Mis estadísticas")}
        <div class="menu-seccion">Administración</div>`;

    if (esAdmin()) {
        const eliminados = temasEliminados().length + preguntasEliminadas().length;
        html += `${item("papelera", "🗑️", "Papelera", eliminados || "")}
            <button class="menu-item" data-menu="nuevaPregunta">➕ <span>Nueva pregunta</span></button>
            <button class="menu-item" data-menu="nuevoModulo">📁 <span>Nuevo módulo</span></button>
            <button class="menu-item" data-menu="salir">🔓 <span>Cerrar sesión</span></button>`;
    } else {
        html += `<button class="menu-item" data-menu="ingresar">🔒 <span>Ingresar</span></button>`;
    }
    $("menu").innerHTML = html;
}

$("menu").addEventListener("click", e => {
    const b = e.target.closest("[data-menu]");
    if (b) {
        ({ nuevaPregunta: () => abrirPregunta(null), nuevoModulo: () => abrirModulo(null), salir: cerrarSesion, ingresar: abrirLogin })[b.dataset.menu]();
    }
    if (e.target.closest("a, [data-menu]")) cerrarMenu();
});

function cerrarMenu() { $("app").classList.remove("menu-abierto"); }
$("btnMenu").addEventListener("click", () => $("app").classList.toggle("menu-abierto"));
$("overlay").addEventListener("click", cerrarMenu);

// Tema claro / oscuro / automático
const TEMAS_VISUALES = ["auto", "light", "dark"];
function aplicarTemaVisual(valor) {
    if (valor === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", valor);
    $("textoTema").textContent = "Tema: " + { auto: "automático", light: "claro", dark: "oscuro" }[valor];
}
let temaVisual = "auto";
try { temaVisual = localStorage.getItem(CLAVE_TEMA) || "auto"; } catch (e) { /* sin storage */ }
aplicarTemaVisual(temaVisual);
$("btnTema").addEventListener("click", () => {
    temaVisual = TEMAS_VISUALES[(TEMAS_VISUALES.indexOf(temaVisual) + 1) % TEMAS_VISUALES.length];
    try { localStorage.setItem(CLAVE_TEMA, temaVisual); } catch (e) { /* sin storage */ }
    aplicarTemaVisual(temaVisual);
});

// ========== RUTEO ==========

const VISTAS = {
    inicio: vistaInicio, modulos: vistaModulos, modulo: vistaModulo, aleatorio: vistaAleatorio, simulacro: vistaSimulacro,
    errores: vistaErrores, marcadas: vistaMarcadas, buscar: vistaBuscar, estadisticas: vistaEstadisticas,
    papelera: vistaPapelera
};

function setTitulo(texto) {
    $("tituloVista").textContent = texto;
    document.title = `${texto} · Concurso 2028`;
}

function navegar() {
    detenerReloj();
    quiz = null;
    const { nombre, param } = rutaActual();
    if (nombre === "papelera" && !esAdmin()) { location.hash = "#/inicio"; return; }
    renderMenu();
    (VISTAS[nombre] || vistaInicio)(param);
    window.scrollTo(0, 0);
}

// Vuelve a dibujar después de un cambio de datos sin perder el examen en curso
function refrescar() {
    renderMenu();
    if (quiz) {
        if (!quiz.terminado) renderQuiz();
        return;
    }
    const { nombre, param } = rutaActual();
    (VISTAS[nombre] || vistaInicio)(param);
}

window.addEventListener("hashchange", navegar);

// Clicks dentro de la vista: cada botón declara su acción con data-accion
const ACCIONES = {
    iniciarModulo: d => { location.hash = `#/modulo/${d.id}`; },
    responder: d => responder(Number(d.opcion)),
    anterior: () => moverQuiz(-1),
    siguiente: () => moverQuiz(1),
    finalizar: () => finalizarQuiz(false),
    reintentar: () => iniciarQuiz(quiz.config.generar ? { ...quiz.config, lista: quiz.config.generar() } : quiz.config),
    repasarIncorrectas: () => {
        const lista = quiz.preguntas.filter((p, i) => quiz.respuestas[i] !== p.correcta);
        iniciarQuiz({ ...quiz.config, titulo: "Repaso de incorrectas", lista, generar: null });
    },
    exportarCSV: () => exportarCSV(quiz.preguntas, quiz.config.titulo),
    marcar: d => { toggleMarcada(Number(d.id)); refrescar(); },
    editarPregunta: d => abrirPregunta(Number(d.id)),
    eliminarPregunta: d => cambiarPregunta(Number(d.id), false),
    restaurarPregunta: d => cambiarPregunta(Number(d.id), true),
    editarModulo: d => abrirModulo(Number(d.id)),
    eliminarModulo: d => cambiarTema(Number(d.id), false),
    restaurarModulo: d => cambiarTema(Number(d.id), true),
    repasarErrores: () => iniciarQuiz({ titulo: "Repaso de errores", lista: preguntasConError(), mostrarModulo: true }),
    practicarMarcadas: () => iniciarQuiz({ titulo: "Preguntas marcadas", lista: preguntasMarcadas(), mostrarModulo: true }),
    todosModulos: () => document.querySelectorAll('#formSimulacro input[name="tema"]').forEach(c => { c.checked = true; }),
    ningunModulo: () => document.querySelectorAll('#formSimulacro input[name="tema"]').forEach(c => { c.checked = false; }),
    reiniciarEstadisticas: () => {
        if (!confirm("¿Borrar todas tus estadísticas, marcadas e intentos de este dispositivo?")) return;
        progreso = { respuestas: {}, marcadas: [], intentos: [] };
        guardarProgreso();
        refrescar();
        aviso("Estadísticas reiniciadas.", "ok");
    }
};

$("vista").addEventListener("click", e => {
    const el = e.target.closest("[data-accion]");
    if (!el || el.disabled) return;
    const fn = ACCIONES[el.dataset.accion];
    if (fn) { e.preventDefault(); e.stopPropagation(); fn(el.dataset); }
});

// ========== VISTAS ==========

// Color por módulo y emoji del nombre separado para mostrarlo en su recuadro
const PALETA = ["#2563eb", "#7c3aed", "#ea580c", "#059669", "#db2777", "#0891b2", "#ca8a04", "#4f46e5", "#dc2626", "#0d9488"];
const colorTema = id => PALETA[(id - 1) % PALETA.length];

function separarEmoji(nombre) {
    const m = String(nombre).match(/^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*)\s*/u);
    return m ? [m[1], nombre.slice(m[0].length)] : ["📘", nombre];
}

function htmlStat(icono, color, valor, nombre) {
    return `<div class="stat" style="--c:${color}"><span class="stat-icono">${icono}</span>
        <div><div class="valor">${valor}</div><div class="nombre">${nombre}</div></div></div>`;
}

function htmlModuloCard(t) {
    const r = resumen(preguntasDeTema(t.id));
    const [emoji, nombre] = separarEmoji(t.nombre);
    const admin = esAdmin() ? `
        <button class="icono" data-accion="editarModulo" data-id="${t.id}" title="Editar módulo">✏️</button>
        <button class="icono peligro" data-accion="eliminarModulo" data-id="${t.id}" title="Eliminar módulo">🗑️</button>` : "";
    return `<div class="modulo-card" style="--c:${colorTema(t.id)}" data-accion="iniciarModulo" data-id="${t.id}">
        <div class="modulo-top"><span class="modulo-emoji">${emoji}</span><h3>${escaparHTML(nombre)}</h3>${admin}</div>
        <p>${escaparHTML(t.descripcion)}</p>
        <div class="barra"><div style="width:${r.cobertura}%"></div></div>
        <div class="modulo-pie">
            <span>📋 ${r.total} preguntas</span>
            <span>${r.cobertura}% visto${r.dominio !== null ? ` · ${r.dominio}% bien` : ""}</span>
        </div>
    </div>`;
}

function htmlModulos() {
    const lista = temasVisibles();
    return lista.length
        ? `<div class="modulos-grid">${lista.map(htmlModuloCard).join("")}</div>`
        : `<div class="vacio"><span class="grande">📭</span>No hay módulos activos.</div>`;
}

function vistaInicio() {
    setTitulo("Inicio");
    const todas = preguntasVisibles();
    const r = resumen(todas);
    const errores = preguntasConError().length;
    $("vista").innerHTML = `
        <section class="hero">
            <h2>¡A estudiar! 📚</h2>
            <p>${todas.length} preguntas en ${temasVisibles().length} módulos. Tu progreso se guarda en este dispositivo.</p>
            <div class="fila">
                <a class="btn" href="#/aleatorio">🎯 Test aleatorio (50)</a>
                <a class="btn sec" href="#/simulacro">⚙️ Armar simulacro</a>
                ${errores ? `<button class="btn sec" data-accion="repasarErrores">❌ Repasar ${errores} errores</button>` : ""}
            </div>
        </section>
        <div class="stats">
            ${htmlStat("👁️", "#2563eb", r.respondidas, `Preguntas vistas de ${r.total}`)}
            ${htmlStat("🧭", "#7c3aed", `${r.cobertura}%`, "Cobertura del temario")}
            ${htmlStat("🎯", "#16a34a", r.dominio !== null ? `${r.dominio}%` : "–", "Respondidas bien")}
            ${htmlStat("❌", "#dc2626", errores, "Para repasar")}
        </div>
        <h2 class="seccion-titulo">📚 Módulos</h2>
        ${htmlModulos()}`;
}

function vistaModulos() {
    setTitulo("Módulos");
    $("vista").innerHTML = htmlModulos();
}

function vistaModulo(param) {
    const t = temaPorId(Number(param));
    if (!t || !t.activo) { location.hash = "#/modulos"; return; }
    const lista = preguntasDeTema(t.id);
    if (!lista.length) {
        setTitulo(t.nombre);
        $("vista").innerHTML = `<div class="vacio"><span class="grande">📭</span>Este módulo no tiene preguntas activas.</div>`;
        return;
    }
    iniciarQuiz({ titulo: t.nombre, lista });
}

// 50 preguntas al azar de todos los módulos activos; "Reintentar" saca otras 50
function vistaAleatorio() {
    const generar = () => mezclar(preguntasVisibles()).slice(0, 50);
    iniciarQuiz({ titulo: "Test aleatorio (50)", lista: generar(), generar, mostrarModulo: true });
}

function vistaSimulacro() {
    setTitulo("Simulacro de examen");
    const lista = temasVisibles().filter(t => preguntasDeTema(t.id).length);
    $("vista").innerHTML = `
        <form id="formSimulacro" class="panel">
            <h3>1. Elegí los módulos</h3>
            <div class="fila">
                <button type="button" class="btn sec chico" data-accion="todosModulos">Todos</button>
                <button type="button" class="btn sec chico" data-accion="ningunModulo">Ninguno</button>
            </div>
            <div class="checks">
                ${lista.map(t => `<label class="check"><input type="checkbox" name="tema" value="${t.id}" checked> ${escaparHTML(t.nombre)} <small>${preguntasDeTema(t.id).length}</small></label>`).join("")}
            </div>
            <h3>2. Configurá el examen</h3>
            <div class="form-grid">
                <label>Cantidad de preguntas
                    <select name="cantidad">
                        <option value="10">10</option>
                        <option value="25">25</option>
                        <option value="50" selected>50</option>
                        <option value="100">100</option>
                        <option value="0">Todas</option>
                    </select>
                </label>
                <label>Tiempo límite
                    <select name="tiempo">
                        <option value="0">Sin límite</option>
                        <option value="15">15 minutos</option>
                        <option value="30">30 minutos</option>
                        <option value="60" selected>60 minutos</option>
                        <option value="90">90 minutos</option>
                        <option value="120">120 minutos</option>
                    </select>
                </label>
            </div>
            <label class="check"><input type="checkbox" name="nuevas"> Priorizar preguntas que todavía no respondí</label>
            <p id="simError" class="error-form" hidden></p>
            <div class="fila" style="margin-top:16px;"><button class="btn grande">🎲 Empezar simulacro</button></div>
        </form>`;

    $("formSimulacro").addEventListener("submit", e => {
        e.preventDefault();
        const f = new FormData(e.target);
        const ids = f.getAll("tema").map(Number);
        if (!ids.length) {
            $("simError").textContent = "Elegí al menos un módulo.";
            $("simError").hidden = false;
            return;
        }
        let pool = mezclar(preguntasVisibles().filter(p => ids.includes(p.tema_id)));
        if (f.get("nuevas")) {
            const sinVer = pool.filter(p => !progreso.respuestas[p.id]);
            pool = [...sinVer, ...pool.filter(p => progreso.respuestas[p.id])];
        }
        const cantidad = Number(f.get("cantidad"));
        iniciarQuiz({
            titulo: "Simulacro de examen", tipo: "simulacro", mostrarModulo: true,
            lista: cantidad ? pool.slice(0, cantidad) : pool,
            limiteMin: Number(f.get("tiempo"))
        });
    });
}

function htmlItemPregunta(p, { papelera = false } = {}) {
    const marcada = esMarcada(p.id);
    const r = progreso.respuestas[p.id];
    const acciones = papelera
        ? `<button class="icono" data-accion="editarPregunta" data-id="${p.id}" title="Editar">✏️</button>
           <button class="btn ok chico" data-accion="restaurarPregunta" data-id="${p.id}">♻️ Restaurar</button>`
        : `<button class="icono ${marcada ? "activo" : ""}" data-accion="marcar" data-id="${p.id}" title="${marcada ? "Quitar de marcadas" : "Marcar"}">${marcada ? "★" : "☆"}</button>
           ${esAdmin() ? `<button class="icono" data-accion="editarPregunta" data-id="${p.id}" title="Editar">✏️</button>
           <button class="icono peligro" data-accion="eliminarPregunta" data-id="${p.id}" title="Eliminar">🗑️</button>` : ""}`;
    return `<div class="item-pregunta">
        <div class="pregunta-acciones">
            <span class="etiqueta">${escaparHTML(nombreTema(p.tema_id))}</span>
            <span class="etiqueta">#${p.id}</span>
            ${r ? `<span class="etiqueta">${r.ultima ? "✅" : "❌"} ${r.ok}/${r.ok + r.mal}</span>` : ""}
            <span class="espaciador"></span>
            ${acciones}
        </div>
        <div class="texto">${escaparHTML(p.pregunta)}</div>
        <div class="respuesta">✔ ${escaparHTML(p.opciones[p.correcta])}</div>
        ${p.explicacion ? `<div class="ayuda">${escaparHTML(p.explicacion)}</div>` : ""}
    </div>`;
}

function vistaErrores() {
    setTitulo("Repasar errores");
    const lista = preguntasConError();
    if (!lista.length) {
        $("vista").innerHTML = `<div class="vacio"><span class="grande">🎉</span>No tenés preguntas para repasar.<br>Las que respondas mal aparecen acá hasta que las aciertes.</div>`;
        return;
    }
    const porModulo = temasVisibles()
        .map(t => ({ t, n: lista.filter(p => p.tema_id === t.id).length }))
        .filter(x => x.n);
    $("vista").innerHTML = `
        <div class="panel">
            <h3>Tenés ${lista.length} pregunta(s) que respondiste mal la última vez</h3>
            <p class="ayuda" style="margin-bottom:14px;">Cuando la respondés bien, sale de esta lista.</p>
            <button class="btn grande" data-accion="repasarErrores">❌ Repasar ${lista.length} preguntas</button>
        </div>
        <h2 class="seccion-titulo">Por módulo</h2>
        <div class="panel tabla-scroll">
            <table class="tabla">
                <thead><tr><th>Módulo</th><th>Errores</th></tr></thead>
                <tbody>${porModulo.map(x => `<tr><td>${escaparHTML(x.t.nombre)}</td><td>${x.n}</td></tr>`).join("")}</tbody>
            </table>
        </div>`;
}

function vistaMarcadas() {
    setTitulo("Marcadas");
    const lista = preguntasMarcadas();
    if (!lista.length) {
        $("vista").innerHTML = `<div class="vacio"><span class="grande">⭐</span>Todavía no marcaste preguntas.<br>Tocá ☆ en cualquier pregunta para guardarla acá.</div>`;
        return;
    }
    $("vista").innerHTML = `
        <div class="panel fila">
            <span>${lista.length} pregunta(s) marcadas</span>
            <span class="espaciador"></span>
            <button class="btn" data-accion="practicarMarcadas">⭐ Practicar marcadas</button>
        </div>
        <div class="lista-preguntas">${lista.map(p => htmlItemPregunta(p)).join("")}</div>`;
}

function vistaBuscar() {
    setTitulo("Buscar preguntas");
    $("vista").innerHTML = `
        <div class="buscador">
            <input id="inputBuscar" type="search" placeholder="Buscar en ${preguntasVisibles().length} preguntas… (texto, opción o #ID)" value="${escaparHTML(estado.busqueda)}">
            <select id="filtroModulo">
                <option value="">Todos los módulos</option>
                ${temasVisibles().map(t => `<option value="${t.id}" ${String(t.id) === estado.filtroModulo ? "selected" : ""}>${escaparHTML(t.nombre)}</option>`).join("")}
            </select>
        </div>
        <div id="resultados"></div>`;
    $("inputBuscar").addEventListener("input", e => { estado.busqueda = e.target.value; renderResultados(); });
    $("filtroModulo").addEventListener("change", e => { estado.filtroModulo = e.target.value; renderResultados(); });
    renderResultados();
}

function renderResultados() {
    const q = normalizar(estado.busqueda.trim()).replace(/^#/, "");
    const modulo = Number(estado.filtroModulo);
    if (q.length < 2 && !modulo) {
        $("resultados").innerHTML = `<div class="vacio"><span class="grande">🔍</span>Escribí al menos 2 letras o elegí un módulo.</div>`;
        return;
    }
    const lista = preguntasVisibles().filter(p =>
        (!modulo || p.tema_id === modulo) &&
        (q.length < 2 || String(p.id) === q || normalizar(p.pregunta).includes(q) || p.opciones.some(o => normalizar(o).includes(q))));
    const max = 60;
    $("resultados").innerHTML = lista.length
        ? `<p class="ayuda" style="margin-bottom:10px;">${lista.length} resultado(s)${lista.length > max ? ` · mostrando ${max}` : ""}</p>
           <div class="lista-preguntas">${lista.slice(0, max).map(p => htmlItemPregunta(p)).join("")}</div>`
        : `<div class="vacio">Sin resultados.</div>`;
}

function vistaEstadisticas() {
    setTitulo("Mis estadísticas");
    const total = resumen(preguntasVisibles());
    const filas = temasVisibles().map(t => ({ t, r: resumen(preguntasDeTema(t.id)) }));
    const intentos = progreso.intentos;
    $("vista").innerHTML = `
        <div class="stats">
            ${htmlStat("👁️", "#2563eb", total.respondidas, `Preguntas vistas de ${total.total}`)}
            ${htmlStat("🎯", "#16a34a", total.dominio !== null ? `${total.dominio}%` : "–", "Respondidas bien")}
            ${htmlStat("🏁", "#7c3aed", intentos.length, "Exámenes terminados")}
            ${htmlStat("⭐", "#ca8a04", preguntasMarcadas().length, "Marcadas")}
        </div>
        <h2 class="seccion-titulo">Por módulo</h2>
        <div class="panel tabla-scroll">
            <table class="tabla">
                <thead><tr><th>Módulo</th><th>Visto</th><th>Bien</th></tr></thead>
                <tbody>${filas.map(({ t, r }) => `<tr>
                    <td>${escaparHTML(t.nombre)}</td>
                    <td><div class="barra"><div style="width:${r.cobertura}%"></div></div><span class="ayuda">${r.respondidas}/${r.total}</span></td>
                    <td><div class="barra ok"><div style="width:${r.dominio ?? 0}%"></div></div><span class="ayuda">${r.dominio !== null ? r.dominio + "%" : "–"}</span></td>
                </tr>`).join("")}</tbody>
            </table>
        </div>
        <h2 class="seccion-titulo">Últimos exámenes</h2>
        ${intentos.length ? `<div class="panel tabla-scroll"><table class="tabla">
            <thead><tr><th>Fecha</th><th>Examen</th><th>Resultado</th><th>Tiempo</th></tr></thead>
            <tbody>${intentos.map(i => `<tr>
                <td>${new Date(i.fecha).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</td>
                <td>${escaparHTML(i.titulo)}</td>
                <td><strong>${i.porcentaje}%</strong> <span class="ayuda">(${i.correctas}/${i.total})</span></td>
                <td>${formatoTiempo(i.segundos)}</td>
            </tr>`).join("")}</tbody></table></div>`
            : `<div class="vacio">Cuando termines un examen aparece acá.</div>`}
        <div class="fila" style="margin-top:20px;"><button class="btn sec" data-accion="reiniciarEstadisticas">🧹 Reiniciar estadísticas</button></div>`;
}

function vistaPapelera() {
    setTitulo("Papelera");
    const modulos = temasEliminados();
    $("vista").innerHTML = `
        <p class="ayuda" style="margin-bottom:16px;">Lo eliminado no se ve en el simulador. Nada se borra del todo: podés restaurarlo cuando quieras.</p>
        <h2 class="seccion-titulo">📚 Módulos eliminados <span class="etiqueta">${modulos.length}</span></h2>
        ${modulos.length ? `<div class="lista-preguntas">${modulos.map(t => `
            <div class="item-pregunta fila">
                <div style="flex:1;min-width:200px;"><div class="texto">${escaparHTML(t.nombre)}</div>
                <span class="ayuda">${preguntas.filter(p => p.tema_id === t.id).length} preguntas · ${escaparHTML(t.descripcion)}</span></div>
                <button class="btn ok chico" data-accion="restaurarModulo" data-id="${t.id}">♻️ Restaurar</button>
            </div>`).join("")}</div>` : `<div class="vacio">No hay módulos eliminados.</div>`}
        <h2 class="seccion-titulo">❓ Preguntas eliminadas <span class="etiqueta">${preguntasEliminadas().length}</span></h2>
        <div class="buscador" style="grid-template-columns:1fr;">
            <input id="inputPapelera" type="search" placeholder="Filtrar preguntas eliminadas…" value="${escaparHTML(estado.busquedaPapelera)}">
        </div>
        <div id="listaPapelera"></div>`;
    $("inputPapelera").addEventListener("input", e => { estado.busquedaPapelera = e.target.value; renderPapelera(); });
    renderPapelera();
}

function renderPapelera() {
    const q = normalizar(estado.busquedaPapelera.trim());
    const lista = preguntasEliminadas().filter(p => !q || normalizar(p.pregunta).includes(q) || String(p.id) === q);
    $("listaPapelera").innerHTML = lista.length
        ? `<div class="lista-preguntas">${lista.slice(0, 100).map(p => htmlItemPregunta(p, { papelera: true })).join("")}</div>`
        : `<div class="vacio">No hay preguntas eliminadas.</div>`;
}

// ========== EXAMEN / PRÁCTICA ==========

function iniciarQuiz(config) {
    if (!config.lista.length) { aviso("No hay preguntas para practicar.", "error"); return; }
    detenerReloj();
    quiz = {
        config,
        preguntas: mezclar(config.lista),
        idx: 0,
        inicio: Date.now(),
        limiteSeg: (config.limiteMin || 0) * 60,
        terminado: false
    };
    quiz.respuestas = new Array(quiz.preguntas.length).fill(null);
    setTitulo(config.titulo);
    if (quiz.limiteSeg) quiz.reloj = setInterval(tickReloj, 1000);
    renderQuiz();
    window.scrollTo(0, 0);
}

function detenerReloj() {
    if (quiz?.reloj) clearInterval(quiz.reloj);
}

function formatoTiempo(seg) {
    seg = Math.max(0, Math.round(seg));
    const h = Math.floor(seg / 3600), m = Math.floor(seg % 3600 / 60), s = seg % 60;
    return (h ? `${h}:` : "") + `${String(m).padStart(h ? 2 : 1, "0")}:${String(s).padStart(2, "0")}`;
}

function tickReloj() {
    const restante = quiz.limiteSeg - (Date.now() - quiz.inicio) / 1000;
    const el = $("reloj");
    if (el) {
        el.textContent = `⏱ ${formatoTiempo(restante)}`;
        el.classList.toggle("poco", restante < 120);
    }
    if (restante <= 0) finalizarQuiz(true);
}

function contarQuiz() {
    let correctas = 0, respondidas = 0;
    quiz.respuestas.forEach((r, i) => {
        if (r !== null) { respondidas++; if (r === quiz.preguntas[i].correcta) correctas++; }
    });
    return { correctas, respondidas, incorrectas: respondidas - correctas, total: quiz.preguntas.length };
}

function renderQuiz() {
    const q = quiz.preguntas[quiz.idx];
    const sel = quiz.respuestas[quiz.idx];
    const respondida = sel !== null;
    const c = contarQuiz();
    const marcada = esMarcada(q.id);
    const ultima = quiz.idx === c.total - 1;
    const restante = quiz.limiteSeg ? quiz.limiteSeg - (Date.now() - quiz.inicio) / 1000 : 0;

    const opciones = q.opciones.map((opt, i) => {
        let cls = "opcion";
        if (respondida && i === q.correcta) cls += " correcta";
        else if (respondida && i === sel) cls += " incorrecta";
        const letra = q.tipo === "vf" ? opt.trim().charAt(0).toUpperCase() : String.fromCharCode(65 + i);
        return `<button class="${cls}" data-accion="responder" data-opcion="${i}" ${respondida ? "disabled" : ""}><span class="letra">${escaparHTML(letra)}</span><span>${escaparHTML(opt)}</span></button>`;
    }).join("");

    const retro = respondida ? `<div class="retro ${sel === q.correcta ? "bien" : "mal"}">
        <strong>${sel === q.correcta ? "✅ ¡Correcto!" : "❌ Incorrecto"}</strong>
        Respuesta correcta: ${escaparHTML(q.opciones[q.correcta])}
        ${q.explicacion ? `<br><span class="ayuda">${escaparHTML(q.explicacion)}</span>` : ""}
    </div>` : "";

    const admin = esAdmin() ? `
        <button class="icono" data-accion="editarPregunta" data-id="${q.id}" title="Editar pregunta">✏️</button>
        <button class="icono peligro" data-accion="eliminarPregunta" data-id="${q.id}" title="Eliminar pregunta">🗑️</button>` : "";

    $("vista").innerHTML = `
        <div class="quiz">
            <div class="quiz-cabecera">
                <div class="quiz-meta">
                    <span>Pregunta <strong>${quiz.idx + 1}</strong> de ${c.total}</span>
                    ${quiz.limiteSeg ? `<span class="reloj ${restante < 120 ? "poco" : ""}" id="reloj">⏱ ${formatoTiempo(restante)}</span>` : ""}
                    <span>✅ ${c.correctas} · ❌ ${c.incorrectas}</span>
                </div>
                <div class="barra"><div style="width:${c.respondidas * 100 / c.total}%"></div></div>
            </div>
            <article class="tarjeta-pregunta">
                <div class="pregunta-acciones">
                    ${quiz.config.mostrarModulo ? `<span class="etiqueta">${escaparHTML(nombreTema(q.tema_id))}</span>` : ""}
                    <span class="etiqueta">#${q.id}</span>
                    <span class="espaciador"></span>
                    <button class="icono ${marcada ? "activo" : ""}" data-accion="marcar" data-id="${q.id}" title="${marcada ? "Quitar de marcadas" : "Marcar para repasar"}">${marcada ? "★" : "☆"}</button>
                    ${admin}
                </div>
                <h2 class="pregunta-texto">${escaparHTML(q.pregunta)}</h2>
                <div class="opciones">${opciones}</div>
                ${retro}
            </article>
            <div class="quiz-nav">
                <button class="btn sec" data-accion="anterior" ${quiz.idx === 0 ? "disabled" : ""}>← Anterior</button>
                <button class="btn sec" data-accion="finalizar">🏁 Terminar</button>
                ${ultima
                    ? `<button class="btn ok" data-accion="finalizar">Ver resultado</button>`
                    : `<button class="btn" data-accion="siguiente">Siguiente →</button>`}
            </div>
            <p class="atajos">Atajos: 1–${q.opciones.length} responder · ← → moverse · M marcar</p>
        </div>`;
}

function responder(opcion) {
    if (!quiz || quiz.terminado || quiz.respuestas[quiz.idx] !== null) return;
    const q = quiz.preguntas[quiz.idx];
    quiz.respuestas[quiz.idx] = opcion;
    registrarRespuesta(q.id, opcion === q.correcta);
    renderQuiz();
    renderMenu();
}

function moverQuiz(delta) {
    const nuevo = quiz.idx + delta;
    if (nuevo < 0 || nuevo >= quiz.preguntas.length) return;
    quiz.idx = nuevo;
    renderQuiz();
}

// Una pregunta eliminada desde el examen sale del recorrido actual
function quitarDelQuiz(id) {
    if (!quiz || quiz.terminado) return;
    const i = quiz.preguntas.findIndex(p => p.id === id);
    if (i < 0) return;
    quiz.preguntas.splice(i, 1);
    quiz.respuestas.splice(i, 1);
    if (!quiz.preguntas.length) { quiz = null; return; }
    quiz.idx = Math.min(quiz.idx, quiz.preguntas.length - 1);
}

function finalizarQuiz(porTiempo) {
    if (!quiz || quiz.terminado) return;
    const c = contarQuiz();
    const sinResponder = c.total - c.respondidas;
    if (!porTiempo && sinResponder && !confirm(`Te quedan ${sinResponder} sin responder. ¿Terminar igual?`)) return;
    detenerReloj();
    quiz.terminado = true;
    const segundos = (Date.now() - quiz.inicio) / 1000;
    const porcentaje = c.total ? Math.round(c.correctas * 100 / c.total) : 0;

    if (c.respondidas) {
        progreso.intentos = [{
            fecha: Date.now(), titulo: quiz.config.titulo, total: c.total,
            correctas: c.correctas, porcentaje, segundos: Math.round(segundos)
        }, ...progreso.intentos].slice(0, 30);
        guardarProgreso();
    }

    const malas = quiz.preguntas
        .map((p, i) => ({ p, r: quiz.respuestas[i] }))
        .filter(x => x.r !== x.p.correcta);

    $("vista").innerHTML = `
        <div class="quiz">
            <div class="panel resultado">
                ${porTiempo ? `<p class="etiqueta" style="margin-bottom:10px;">⏱ Se terminó el tiempo</p>` : ""}
                <div class="anillo ${porcentaje >= 70 ? "alto" : porcentaje < 50 ? "bajo" : ""}" style="--p:${porcentaje}"><span>${porcentaje}%</span></div>
                <p class="detalle">✅ ${c.correctas} correctas · ❌ ${c.incorrectas} incorrectas · ⏳ ${sinResponder} sin responder · ⏱ ${formatoTiempo(segundos)}</p>
                <div class="fila">
                    <button class="btn" data-accion="reintentar">🔁 Reintentar</button>
                    ${malas.length ? `<button class="btn sec" data-accion="repasarIncorrectas">❌ Repasar ${malas.length} ${sinResponder ? "falladas y sin responder" : "incorrectas"}</button>` : ""}
                    <button class="btn sec" data-accion="exportarCSV">📥 CSV</button>
                    <a class="btn sec" href="#/inicio">🏠 Inicio</a>
                </div>
            </div>
            ${c.incorrectas ? `<h2 class="seccion-titulo">Para revisar</h2>
            <div class="lista-preguntas">${malas.filter(x => x.r !== null).map(({ p, r }) => `
                <div class="item-pregunta">
                    <div class="pregunta-acciones"><span class="etiqueta">${escaparHTML(nombreTema(p.tema_id))}</span><span class="etiqueta">#${p.id}</span></div>
                    <div class="texto">${escaparHTML(p.pregunta)}</div>
                    <div class="respuesta mal">✘ Tu respuesta: ${escaparHTML(p.opciones[r])}</div>
                    <div class="respuesta">✔ ${escaparHTML(p.opciones[p.correcta])}</div>
                    ${p.explicacion ? `<div class="ayuda">${escaparHTML(p.explicacion)}</div>` : ""}
                </div>`).join("")}</div>` : ""}
        </div>`;
    renderMenu();
    window.scrollTo(0, 0);
}

function exportarCSV(lista, titulo) {
    const campo = s => `"${String(s ?? "").replace(/"/g, '""')}"`;
    let csv = "ID;MODULO;PREGUNTA;RESPUESTA_CORRECTA;EXPLICACION\n";
    lista.forEach(p => {
        csv += [p.id, campo(nombreTema(p.tema_id)), campo(p.pregunta), campo(p.opciones[p.correcta]), campo(p.explicacion)].join(";") + "\n";
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
    link.download = `${titulo.replace(/[^\w]+/g, "_")}_${hoy()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

// Atajos de teclado durante el examen
document.addEventListener("keydown", e => {
    if (!quiz || quiz.terminado || document.querySelector("dialog[open]")) return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
    const q = quiz.preguntas[quiz.idx];
    const n = Number(e.key);
    if (n >= 1 && n <= q.opciones.length) responder(n - 1);
    else if (e.key === "ArrowRight") moverQuiz(1);
    else if (e.key === "ArrowLeft") moverQuiz(-1);
    else if (e.key.toLowerCase() === "m") { toggleMarcada(q.id); renderQuiz(); renderMenu(); }
});

// ========== EDITOR DE MÓDULO (admin) ==========

let moduloEditando = null;

function abrirModulo(id) {
    moduloEditando = id ? temaPorId(id) : null;
    $("tituloModulo").textContent = moduloEditando ? "✏️ Editar módulo" : "📁 Nuevo módulo";
    $("mNombre").value = moduloEditando?.nombre ?? "";
    $("mDescripcion").value = moduloEditando?.descripcion ?? "";
    $("dlgModulo").showModal();
}

$("formModulo").addEventListener("submit", e => {
    if (e.submitter?.value !== "ok") return;
    const datos = { nombre: $("mNombre").value.trim(), descripcion: $("mDescripcion").value.trim() };
    if (moduloEditando) {
        const t = moduloEditando, anterior = { ...t };
        Object.assign(t, datos, { updated_at: hoy() });
        guardar("temas", `Edito módulo ${t.id}: ${t.nombre}`, () => { Object.keys(t).forEach(k => delete t[k]); Object.assign(t, anterior); });
        aviso("Módulo actualizado.", "ok");
    } else {
        const nuevo = { id: Math.max(0, ...temas.map(t => t.id)) + 1, ...datos, activo: true, created_at: hoy(), updated_at: hoy() };
        temas.push(nuevo);
        guardar("temas", `Creo módulo ${nuevo.id}: ${nuevo.nombre}`, () => { temas = temas.filter(t => t !== nuevo); });
        aviso("Módulo creado. Agregale preguntas con ➕ Nueva pregunta.", "ok");
    }
    refrescar();
});

// ========== EDITOR DE PREGUNTA (admin) ==========

let preguntaEditando = null;

function filaOpcion(texto, correcta) {
    const fila = document.createElement("div");
    fila.className = "opcion-fila";
    fila.innerHTML = `<span class="letra-edit"></span>
        <input type="radio" name="pCorrecta" ${correcta ? "checked" : ""} title="Correcta">
        <input type="text" value="${escaparHTML(texto)}">
        <button type="button" class="icono peligro" title="Quitar opción">✕</button>`;
    fila.querySelector("button").addEventListener("click", () => { fila.remove(); letrasOpciones(); });
    $("pOpciones").appendChild(fila);
    letrasOpciones();
}

function letrasOpciones() {
    [...$("pOpciones").children].forEach((f, i) => { f.querySelector(".letra-edit").textContent = String.fromCharCode(65 + i); });
}

function abrirPregunta(id) {
    preguntaEditando = id ? preguntas.find(p => p.id === id) : null;
    const temaSugerido = quiz ? quiz.preguntas[quiz.idx]?.tema_id : Number(rutaActual().param) || temasVisibles()[0]?.id;
    const p = preguntaEditando || {
        tema_id: temaSugerido, tipo: "mc", pregunta: "", opciones: ["", "", "", ""],
        correcta: 0, explicacion: "", origen: "panel"
    };
    $("tituloPregunta").textContent = preguntaEditando ? `✏️ Editar pregunta #${id}` : "➕ Nueva pregunta";
    $("pTema").innerHTML = temas.map(t => `<option value="${t.id}">${escaparHTML(t.nombre)}${t.activo ? "" : " (eliminado)"}</option>`).join("");
    $("pTema").value = p.tema_id;
    $("pTipo").value = p.tipo;
    $("pTexto").value = p.pregunta;
    $("pExplicacion").value = p.explicacion || "";
    $("pOrigen").value = p.origen || "";
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
        explicacion: $("pExplicacion").value.trim(), origen: $("pOrigen").value.trim()
    };
    if (preguntaEditando) {
        const p = preguntaEditando, anterior = structuredClone(p);
        Object.assign(p, datos, { updated_at: hoy() });
        guardar("preguntas", `Edito pregunta ${p.id}`, () => Object.assign(p, anterior));
        aviso("Pregunta actualizada.", "ok");
    } else {
        const nueva = { id: Math.max(0, ...preguntas.map(p => p.id)) + 1, ...datos, activo: true, created_at: hoy(), updated_at: hoy() };
        preguntas.push(nueva);
        guardar("preguntas", `Agrego pregunta ${nueva.id}`, () => { preguntas = preguntas.filter(p => p !== nueva); });
        aviso(`Pregunta #${nueva.id} creada en ${escaparHTML(nombreTema(nueva.tema_id))}.`, "ok");
    }
    refrescar();
});

// ========== LOGIN ==========

function errorLogin(texto) {
    $("loginError").textContent = texto;
    $("loginError").hidden = !texto;
}

async function abrirLogin() {
    errorLogin("");
    $("loginPassword").value = "";
    let configurado = true;
    try { configurado = !!(await Acceso.leerConfiguracion()); } catch (e) { /* se muestra el login */ }
    $("bloqueConfigurar").hidden = configurado;
    $("loginTitulo").textContent = configurado ? "🔒 Administración" : "🔧 Configuración inicial";
    if (!configurado && location.hostname.endsWith(".github.io")) {
        $("cfgOwner").value = location.hostname.split(".")[0];
        $("cfgRepo").value = location.pathname.split("/")[1] || location.hostname;
    }
    $("dlgLogin").showModal();
    $("loginPassword").focus();
}

async function cerrarSesion() {
    if (pendientes && !confirm("Hay cambios guardándose. ¿Salir igual?")) return;
    Acceso.salir();
    await recargar();
    aviso("Sesión cerrada.");
}

$("formLogin").addEventListener("submit", async e => {
    if (e.submitter?.value !== "ok") return;
    e.preventDefault();
    const password = $("loginPassword").value;
    if (!password) return errorLogin("Ingresá la contraseña.");
    $("btnIngresar").disabled = true;
    errorLogin("");
    try {
        if ($("bloqueConfigurar").hidden) {
            await Acceso.ingresar(password);
        } else {
            if (password !== $("cfgPassword2").value) throw new Error("Las contraseñas no coinciden.");
            const token = $("cfgToken").value.trim(), owner = $("cfgOwner").value.trim(), repo = $("cfgRepo").value.trim();
            if (!token || !owner || !repo) throw new Error("Completá usuario, repositorio y token.");
            await Acceso.configurar(password, token, owner, repo, $("cfgBranch").value.trim() || "main");
            $("cfgToken").value = "";
        }
        $("dlgLogin").close();
        await recargar();
        aviso("🔓 Modo administración activo.", "ok");
    } catch (err) {
        console.error(err);
        errorLogin(err.message);
    } finally {
        $("btnIngresar").disabled = false;
    }
});

// ========== INICIO ==========

recargar().catch(err => {
    console.error(err);
    $("vista").innerHTML =
        `<div class="vacio"><span class="grande">⚠️</span>No se pudieron cargar las preguntas (${escaparHTML(err.message)}).<br>` +
        `Si abriste el archivo con doble clic, usá un servidor local o la página de GitHub Pages.</div>`;
});
