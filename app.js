// ========== CARGA DE DATOS (data/temas.json y data/preguntas.json) ==========
// Solo se muestran temas y preguntas con "activo": true.
// Con sesión de administración se ven también los inactivos y se pueden eliminar (activo = false) o restaurar.

const ARCHIVOS = { temas: "data/temas.json", preguntas: "data/preguntas.json" };

let temas = [], preguntas = [];
let shas = { temas: null, preguntas: null };

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

const preguntasDeTema = id => preguntas.filter(p => p.tema_id === id && (p.activo || esAdmin()));

// ========== GUARDADO (solo admin) ==========

let colaGuardado = Promise.resolve();

function guardar(tipo, mensaje, revertir) {
    colaGuardado = colaGuardado.then(async () => {
        aviso("⏳ Guardando…");
        try {
            shas[tipo] = await Acceso.guardarArchivo(ARCHIVOS[tipo], tipo === "temas" ? temas : preguntas, shas[tipo], mensaje);
            aviso("✅ Guardado. Se publica en 1–2 minutos.", "ok");
        } catch (err) {
            console.error(err);
            revertir();
            renderTemas();
            if ($("quizScreen").style.display === "block") renderPregunta();
            aviso(`❌ No se guardó: ${escaparHTML(err.message)}`, "error");
        }
    });
}

function cambiarTema(id, activo) {
    const t = temas.find(x => x.id === id);
    if (!activo && !confirm(`¿Eliminar el módulo "${t.nombre}"?\nDeja de verse junto con todas sus preguntas. Se puede restaurar.`)) return;
    const anterior = { activo: t.activo, updated_at: t.updated_at };
    t.activo = activo;
    t.updated_at = hoy();
    renderTemas();
    guardar("temas", `${activo ? "Restauro" : "Elimino"} módulo ${id}: ${t.nombre}`, () => Object.assign(t, anterior));
}

function cambiarPregunta(id, activo) {
    const p = preguntas.find(x => x.id === id);
    if (!activo && !confirm("¿Eliminar esta pregunta?\nDeja de verse en el simulador. Se puede restaurar.")) return;
    const anterior = { activo: p.activo, updated_at: p.updated_at };
    p.activo = activo;
    p.updated_at = hoy();
    renderPregunta();
    renderTemas();
    guardar("preguntas", `${activo ? "Restauro" : "Elimino"} pregunta ${id}`, () => Object.assign(p, anterior));
}

let avisoTimer = null;
function aviso(texto, tipo = "") {
    const div = $("toast");
    div.className = "toast visible " + tipo;
    div.innerHTML = texto;
    clearTimeout(avisoTimer);
    if (tipo) avisoTimer = setTimeout(() => div.classList.remove("visible"), tipo === "error" ? 8000 : 3500);
}

// ========== PANTALLA PRINCIPAL ==========

function renderTemas() {
    const temasGridDiv = $("temasGrid");
    temasGridDiv.innerHTML = "";
    const admin = esAdmin();
    $("bannerAdmin").hidden = !admin;
    $("btnSesion").textContent = admin ? "🔓 Salir de administración" : "🔒 Administrar";

    temas.forEach(tema => {
        const todas = preguntas.filter(p => p.tema_id === tema.id);
        const activas = todas.filter(p => p.activo).length;
        if (!admin && (!tema.activo || !activas)) return;

        const card = document.createElement("div");
        card.className = "tema-card" + (tema.activo ? "" : " inactivo");
        card.setAttribute("data-tema", tema.id);
        const eliminadas = todas.length - activas;
        card.innerHTML = `
            <h3>${escaparHTML(tema.nombre)}</h3>
            <p>${escaparHTML(tema.descripcion)}</p>
            <span class="badge">📋 ${activas} preguntas</span>
            ${admin && eliminadas ? `<span class="badge badge-gris">🚫 ${eliminadas} eliminadas</span>` : ""}
            ${admin && !tema.activo ? `<span class="badge badge-rojo">Módulo eliminado</span>` : ""}
        `;
        if (admin) {
            const btn = document.createElement("button");
            btn.className = "btn-icono " + (tema.activo ? "eliminar" : "restaurar");
            btn.title = tema.activo ? "Eliminar módulo" : "Restaurar módulo";
            btn.textContent = tema.activo ? "🗑️" : "♻️";
            btn.addEventListener("click", e => { e.stopPropagation(); cambiarTema(tema.id, !tema.activo); });
            card.appendChild(btn);
        }
        card.addEventListener("click", () => {
            if (todas.length) iniciarQuiz(tema.id, tema.nombre);
        });
        temasGridDiv.appendChild(card);
    });
}

// Variables del quiz
let preguntasActuales = [];
let currentIndex = 0, userAnswers = [], answerStatus = [], scoreCorrect = 0, scoreIncorrect = 0;
let temaActualId = "", temaActualNombre = "";

function iniciarQuiz(temaId, temaNombre) {
    temaActualId = temaId;
    temaActualNombre = temaNombre;
    preguntasActuales = preguntasDeTema(temaId);
    // Mezclar
    for (let i = preguntasActuales.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [preguntasActuales[i], preguntasActuales[j]] = [preguntasActuales[j], preguntasActuales[i]];
    }
    currentIndex = 0;
    userAnswers = new Array(preguntasActuales.length).fill(null);
    answerStatus = new Array(preguntasActuales.length).fill(false);
    scoreCorrect = 0;
    scoreIncorrect = 0;

    $("mainScreen").style.display = "none";
    $("quizScreen").style.display = "block";
    $("quizTitulo").innerHTML = escaparHTML(temaNombre) + ` · ${preguntasActuales.length} preguntas`;
    actualizarPuntaje();
    renderPregunta();
    actualizarProgreso();
    window.scrollTo(0, 0);
}

function volverPrincipal() {
    $("quizScreen").style.display = "none";
    $("mainScreen").style.display = "block";
    renderTemas();
}

function renderPregunta() {
    if (!preguntasActuales.length) return;
    const q = preguntasActuales[currentIndex];
    const isAnswered = answerStatus[currentIndex];
    const selectedIdx = userAnswers[currentIndex];
    const isCorrect = (selectedIdx !== null && selectedIdx === q.correcta);

    let html = "";
    if (esAdmin()) {
        html += q.activo
            ? `<div class="admin-pregunta"><span>ID ${q.id}</span><button class="btn btn-mini btn-pdf" id="btnEliminarPregunta">🗑️ Eliminar pregunta</button></div>`
            : `<div class="admin-pregunta eliminada"><span>🚫 Eliminada · ID ${q.id}</span><button class="btn btn-mini btn-download" id="btnRestaurarPregunta">♻️ Restaurar</button></div>`;
    }
    html += `<div class="pregunta-texto">${currentIndex+1}. ${escaparHTML(q.pregunta)}</div><div class="opciones-area">`;
    q.opciones.forEach((opt, idx) => {
        let cls = "opcion-boton";
        if (isAnswered) {
            if (idx === q.correcta) cls += " correcta";
            else if (idx === selectedIdx && selectedIdx !== q.correcta) cls += " incorrecta";
        }
        let prefix = q.tipo === "vf" ? "" : String.fromCharCode(65+idx) + ". ";
        html += `<button class="${cls}" data-opt-index="${idx}" ${isAnswered ? 'disabled' : ''}>${prefix}${escaparHTML(opt)}</button>`;
    });
    html += `</div>`;
    if (isAnswered) {
        const explicacion = q.explicacion ? `<br>${escaparHTML(q.explicacion)}` : "";
        html += `<div class="retro-card"><div class="${isCorrect ? 'retro-titulo-correcto' : 'retro-titulo-incorrecto'}">${isCorrect ? '✅ Correcto' : '❌ Incorrecto'}</div><div class="retro-detalle"><strong>${escaparHTML(q.opciones[q.correcta])}</strong>${explicacion}</div></div>`;
    }
    html += `<div class="navegacion"><button class="btn btn-sec" id="prevBtn" ${currentIndex===0?'disabled':''}>⮜ Anterior</button><span class="indice-preg">${currentIndex+1} / ${preguntasActuales.length}</span><button class="btn" id="nextBtn" ${currentIndex===preguntasActuales.length-1?'disabled':''}>Siguiente ⮞</button></div>`;
    $("cuerpoQuiz").innerHTML = html;

    document.querySelectorAll('.opcion-boton').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!answerStatus[currentIndex]) handleAnswer(currentIndex, parseInt(btn.dataset.optIndex));
        });
    });
    $('prevBtn')?.addEventListener('click', () => { if (currentIndex > 0) { currentIndex--; renderPregunta(); actualizarProgreso(); } });
    $('nextBtn')?.addEventListener('click', () => { if (currentIndex < preguntasActuales.length-1) { currentIndex++; renderPregunta(); actualizarProgreso(); } });
    $('btnEliminarPregunta')?.addEventListener('click', () => cambiarPregunta(q.id, false));
    $('btnRestaurarPregunta')?.addEventListener('click', () => cambiarPregunta(q.id, true));
}

function handleAnswer(idx, optIdx) {
    if (answerStatus[idx]) return;
    answerStatus[idx] = true;
    userAnswers[idx] = optIdx;
    if (optIdx === preguntasActuales[idx].correcta) scoreCorrect++;
    else scoreIncorrect++;
    actualizarPuntaje();
    renderPregunta();
    actualizarProgreso();
    if (answerStatus.every(v => v)) setTimeout(mostrarResultado, 600);
}

function actualizarPuntaje() {
    $("puntajeDisplay").innerText = `✅ ${scoreCorrect} · ❌ ${scoreIncorrect}`;
}

function actualizarProgreso() {
    const respondidas = answerStatus.filter(v=>v===true).length;
    $("barraProgreso").style.width = (respondidas/preguntasActuales.length)*100+"%";
    $("textoContador").innerText = `Pregunta ${currentIndex+1} / ${preguntasActuales.length}`;
}

// Resultado final
function mostrarResultado() {
    const respondidas = scoreCorrect + scoreIncorrect;
    const sinResponder = preguntasActuales.length - respondidas;
    const porcentaje = respondidas ? Math.round((scoreCorrect / respondidas) * 100) : 0;
    $("cuerpoQuiz").innerHTML = `
        <div class="resultado">
            <h3>🏁 Resultado · ${escaparHTML(temaActualNombre)}</h3>
            <div class="porcentaje">${porcentaje}%</div>
            <p>✅ ${scoreCorrect} correctas · ❌ ${scoreIncorrect} incorrectas · ⏳ ${sinResponder} sin responder</p>
            <div class="botonera-extra">
                <button class="btn" id="btnReintentar">🔁 Reintentar tema</button>
                <button class="btn btn-sec" id="btnRevisar">👀 Revisar respuestas</button>
            </div>
        </div>`;
    $("btnReintentar").addEventListener("click", () => iniciarQuiz(temaActualId, temaActualNombre));
    $("btnRevisar").addEventListener("click", () => { currentIndex = 0; renderPregunta(); actualizarProgreso(); });
}

// Descargas
$("btnDescargarCSV")?.addEventListener("click", () => {
    const csvCampo = s => `"${String(s).replace(/"/g, '""')}"`;
    let csv = "ID;PREGUNTA;RESPUESTA_CORRECTA;EXPLICACION\n";
    preguntasActuales.forEach(p => {
        csv += `${p.id};${csvCampo(p.pregunta)};${csvCampo(p.opciones[p.correcta])};${csvCampo(p.explicacion)}\n`;
    });
    const blob = new Blob(["﻿"+csv], {type:"text/csv;charset=utf-8;"});
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `tema${temaActualId}_${new Date().toISOString().slice(0,19)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
});

$("btnDescargarPDF")?.addEventListener("click", () => {
    alert("📄 Para guardar como PDF: presione Ctrl+P (Windows) o Cmd+P (Mac) y seleccione 'Guardar como PDF'.");
});

$("btnFinalizar").addEventListener("click", mostrarResultado);
$("btnVolverPrincipal").addEventListener("click", volverPrincipal);

// ========== LOGIN ==========

function errorLogin(texto) {
    $("loginError").textContent = texto;
    $("loginError").hidden = !texto;
}

async function abrirLogin() {
    if (esAdmin()) {
        Acceso.salir();
        await recargar();
        return;
    }
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

$("btnSesion").addEventListener("click", abrirLogin);

// ========== INICIO ==========

async function recargar() {
    try {
        await cargarDatos();
    } catch (err) {
        if (esAdmin() && err.status === 401) {
            Acceso.salir();
            aviso("La sesión de administración venció. Volvé a ingresar.", "error");
            await cargarDatos();
        } else {
            throw err;
        }
    }
    if ($("quizScreen").style.display === "block") volverPrincipal();
    else renderTemas();
}

recargar().catch(err => {
    console.error(err);
    $("temasGrid").innerHTML =
        `<div class="mensaje error">No se pudieron cargar las preguntas (${escaparHTML(err.message)}).<br>` +
        `Si abriste el archivo con doble clic, usá un servidor local o la página de GitHub Pages.</div>`;
});
