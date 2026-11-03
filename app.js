// ========== CARGA DE DATOS (data/temas.json y data/preguntas.json) ==========
// Solo se muestran temas y preguntas con "activo": true.

let temasInfo = [];
let preguntasPorTema = {};

function escaparHTML(texto) {
    return String(texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

async function cargarDatos() {
    // "no-cache" revalida contra el servidor para no mostrar una versión vieja tras un push
    const leer = archivo => fetch(`data/${archivo}`, { cache: "no-cache" })
        .then(r => { if (!r.ok) throw new Error(`${archivo}: ${r.status}`); return r.json(); });
    const [temas, preguntas] = await Promise.all([leer("temas.json"), leer("preguntas.json")]);

    preguntasPorTema = {};
    preguntas.filter(p => p.activo).forEach(p => {
        (preguntasPorTema[p.tema_id] = preguntasPorTema[p.tema_id] || []).push(p);
    });

    temasInfo = temas
        .filter(t => t.activo)
        .map(t => ({ ...t, total: (preguntasPorTema[t.id] || []).length }))
        .filter(t => t.total > 0);
}

// Renderizar pantalla principal
function renderTemas() {
    const temasGridDiv = document.getElementById("temasGrid");
    temasGridDiv.innerHTML = "";
    temasInfo.forEach(tema => {
        const card = document.createElement("div");
        card.className = "tema-card";
        card.setAttribute("data-tema", tema.id);
        card.innerHTML = `
            <h3>${escaparHTML(tema.nombre)}</h3>
            <p>${escaparHTML(tema.descripcion)}</p>
            <span class="badge">📋 ${tema.total} preguntas</span>
        `;
        card.addEventListener("click", () => iniciarQuiz(tema.id, tema.nombre));
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
    preguntasActuales = [...preguntasPorTema[temaId]];
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

    document.getElementById("mainScreen").style.display = "none";
    document.getElementById("quizScreen").style.display = "block";
    document.getElementById("quizTitulo").innerHTML = escaparHTML(temaNombre) + ` · ${preguntasActuales.length} preguntas`;
    actualizarPuntaje();
    renderPregunta();
    actualizarProgreso();
}

function volverPrincipal() {
    document.getElementById("quizScreen").style.display = "none";
    document.getElementById("mainScreen").style.display = "block";
}

function renderPregunta() {
    if (!preguntasActuales.length) return;
    const q = preguntasActuales[currentIndex];
    const isAnswered = answerStatus[currentIndex];
    const selectedIdx = userAnswers[currentIndex];
    const isCorrect = (selectedIdx !== null && selectedIdx === q.correcta);

    let html = `<div class="pregunta-texto">${currentIndex+1}. ${escaparHTML(q.pregunta)}</div><div class="opciones-area">`;
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
    document.getElementById("cuerpoQuiz").innerHTML = html;

    document.querySelectorAll('.opcion-boton').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!answerStatus[currentIndex]) handleAnswer(currentIndex, parseInt(btn.dataset.optIndex));
        });
    });
    document.getElementById('prevBtn')?.addEventListener('click', () => { if (currentIndex > 0) { currentIndex--; renderPregunta(); actualizarProgreso(); } });
    document.getElementById('nextBtn')?.addEventListener('click', () => { if (currentIndex < preguntasActuales.length-1) { currentIndex++; renderPregunta(); actualizarProgreso(); } });
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
    document.getElementById("puntajeDisplay").innerText = `✅ ${scoreCorrect} · ❌ ${scoreIncorrect}`;
}

function actualizarProgreso() {
    const respondidas = answerStatus.filter(v=>v===true).length;
    document.getElementById("barraProgreso").style.width = (respondidas/preguntasActuales.length)*100+"%";
    document.getElementById("textoContador").innerText = `Pregunta ${currentIndex+1} / ${preguntasActuales.length}`;
}

// Resultado final
function mostrarResultado() {
    const respondidas = scoreCorrect + scoreIncorrect;
    const sinResponder = preguntasActuales.length - respondidas;
    const porcentaje = respondidas ? Math.round((scoreCorrect / respondidas) * 100) : 0;
    document.getElementById("cuerpoQuiz").innerHTML = `
        <div class="resultado">
            <h3>🏁 Resultado · ${escaparHTML(temaActualNombre)}</h3>
            <div class="porcentaje">${porcentaje}%</div>
            <p>✅ ${scoreCorrect} correctas · ❌ ${scoreIncorrect} incorrectas · ⏳ ${sinResponder} sin responder</p>
            <div class="botonera-extra">
                <button class="btn" id="btnReintentar">🔁 Reintentar tema</button>
                <button class="btn btn-sec" id="btnRevisar">👀 Revisar respuestas</button>
            </div>
        </div>`;
    document.getElementById("btnReintentar").addEventListener("click", () => iniciarQuiz(temaActualId, temaActualNombre));
    document.getElementById("btnRevisar").addEventListener("click", () => { currentIndex = 0; renderPregunta(); actualizarProgreso(); });
}

// Descargas
document.getElementById("btnDescargarCSV")?.addEventListener("click", () => {
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

document.getElementById("btnDescargarPDF")?.addEventListener("click", () => {
    alert("📄 Para guardar como PDF: presione Ctrl+P (Windows) o Cmd+P (Mac) y seleccione 'Guardar como PDF'.");
});

document.getElementById("btnFinalizar").addEventListener("click", mostrarResultado);
document.getElementById("btnVolverPrincipal").addEventListener("click", volverPrincipal);

// Inicio
cargarDatos()
    .then(renderTemas)
    .catch(err => {
        console.error(err);
        document.getElementById("temasGrid").innerHTML =
            `<div class="mensaje error">No se pudieron cargar las preguntas (${escaparHTML(err.message)}).<br>` +
            `Si abriste el archivo con doble clic, usá un servidor local o la página de GitHub Pages.</div>`;
    });
