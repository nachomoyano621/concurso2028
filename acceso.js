// ========== ACCESO DE ADMINISTRACIÓN ==========
// El token de GitHub se guarda en data/acceso.json cifrado con AES-GCM usando una clave derivada
// de la contraseña (PBKDF2). La contraseña no está en el código: es correcta si logra descifrar el token.

const Acceso = (() => {
    const ARCHIVO = "data/acceso.json";
    const CLAVE_SESION = "simulador2028.sesion";
    const ITERACIONES = 600000;
    let sesion = null;   // { owner, repo, branch, token }

    try { sesion = JSON.parse(localStorage.getItem(CLAVE_SESION) || "null"); } catch (e) { /* sin storage */ }

    const aB64 = bytes => btoa(String.fromCharCode(...bytes));
    const deB64 = texto => Uint8Array.from(atob(texto), c => c.charCodeAt(0));

    function base64Largo(texto) {
        const bytes = new TextEncoder().encode(texto);
        let binario = "";
        for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(binario);
    }

    async function derivarClave(password, salt, iteraciones) {
        const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
        return crypto.subtle.deriveKey(
            { name: "PBKDF2", salt, iterations: iteraciones, hash: "SHA-256" },
            base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    }

    function guardarSesion() {
        try {
            if (sesion) localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
            else localStorage.removeItem(CLAVE_SESION);
        } catch (e) { /* sin storage: la sesión dura hasta recargar */ }
    }

    async function api(ruta, opciones = {}) {
        if (!/^[\x21-\x7e]+$/.test(sesion.token)) throw new Error("El token tiene espacios o caracteres raros. Copialo de nuevo desde GitHub.");
        let resp;
        try {
            // Sin barra final: "repos/usuario/repo/" da 404 y el navegador lo reporta como "Failed to fetch"
            const url = `https://api.github.com/repos/${sesion.owner}/${sesion.repo}` + (ruta ? `/${ruta}` : "");
            resp = await fetch(url, {
                ...opciones,
                cache: "no-store",
                headers: {
                    "Authorization": `Bearer ${sesion.token}`,
                    "Accept": opciones.accept || "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                    ...(opciones.body ? { "Content-Type": "application/json" } : {})
                }
            });
        } catch (e) {
            throw new Error(`No se pudo conectar con api.github.com (${e.message}). Suele ser un bloqueador de anuncios, VPN o la red de la oficina: probá con datos móviles u otro navegador.`);
        }
        if (!resp.ok) {
            let detalle = "";
            try { detalle = (await resp.json()).message; } catch (e) { /* sin cuerpo */ }
            const err = new Error(resp.status === 409 || resp.status === 422
                ? "El archivo cambió en GitHub. Recargá la página y volvé a intentar."
                : resp.status === 401 ? "El token de GitHub venció o fue revocado."
                : `GitHub ${resp.status}: ${detalle || resp.statusText}`);
            err.status = resp.status;
            throw err;
        }
        return resp;
    }

    // Lee un JSON del repo. El sha sale del listado de la carpeta (funciona aunque el archivo pese más de 1 MB)
    async function leerArchivo(ruta) {
        const carpeta = ruta.split("/").slice(0, -1).join("/");
        const ref = encodeURIComponent(sesion.branch);
        const listado = await (await api(`contents/${carpeta}?ref=${ref}`)).json();
        const meta = listado.find(f => f.path === ruta);
        if (!meta) { const err = new Error(`No existe ${ruta}`); err.status = 404; throw err; }
        const texto = await (await api(`contents/${ruta}?ref=${ref}`, { accept: "application/vnd.github.raw+json" })).text();
        return { datos: JSON.parse(texto), sha: meta.sha };
    }

    async function guardarArchivo(ruta, datos, sha, mensaje) {
        const resp = await api(`contents/${ruta}`, {
            method: "PUT",
            body: JSON.stringify({
                message: mensaje,
                content: base64Largo(JSON.stringify(datos, null, 2) + "\n"),
                sha: sha || undefined,
                branch: sesion.branch
            })
        });
        return (await resp.json()).content.sha;
    }

    async function leerConfiguracion() {
        const resp = await fetch(ARCHIVO, { cache: "no-cache" });
        if (resp.status === 404) return null;
        if (!resp.ok) throw new Error(`${ARCHIVO}: ${resp.status}`);
        return resp.json();
    }

    async function ingresar(password) {
        const cfg = await leerConfiguracion();
        if (!cfg) return false;   // falta la configuración inicial
        const clave = await derivarClave(password, deB64(cfg.salt), cfg.iteraciones);
        let token;
        try {
            token = new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(cfg.iv) }, clave, deB64(cfg.token)));
        } catch (e) {
            throw new Error("Contraseña incorrecta.");
        }
        sesion = { owner: cfg.owner, repo: cfg.repo, branch: cfg.branch, token };
        guardarSesion();
        return true;
    }

    // Configuración inicial: verifica el token, lo cifra con la contraseña y sube data/acceso.json
    async function configurar(password, token, owner, repo, branch) {
        sesion = { owner, repo, branch, token };
        try {
            const info = await (await api("")).json();
            if (!info.permissions?.push) throw new Error("El token no tiene permiso de escritura en el repositorio.");
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const clave = await derivarClave(password, salt, ITERACIONES);
            const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, clave, new TextEncoder().encode(token)));
            const contenido = { owner, repo, branch, iteraciones: ITERACIONES, salt: aB64(salt), iv: aB64(iv), token: aB64(cifrado) };
            const actual = await leerArchivo(ARCHIVO).catch(err => { if (err.status === 404) return null; throw err; });
            await guardarArchivo(ARCHIVO, contenido, actual?.sha, "Configuro acceso de administración");
            guardarSesion();
        } catch (err) {
            sesion = null;
            throw err;
        }
    }

    function salir() {
        sesion = null;
        guardarSesion();
    }

    return {
        logueado: () => !!sesion,
        leerConfiguracion, ingresar, configurar, salir, leerArchivo, guardarArchivo
    };
})();
