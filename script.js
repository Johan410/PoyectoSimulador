document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURACIÓN INICIAL ---
    const canvas = document.getElementById('simCanvas');
    const ctx = canvas.getContext('2d');

    // Ajustar tamaño del canvas al tamaño del CSS/DOM (si quieres responsivo)
    function ajustarCanvas() {
        // conserva el tamaño del canvas en pixeles igual al tamaño en CSS para evitar distorsión
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        dibujar();
    }
    window.addEventListener('resize', ajustarCanvas);
    ajustarCanvas();

    // Constantes físicas
    const k = 8.9875517923e9; // Constante de Coulomb (N·m²/C²)

    // Estado de la simulación
    let cargas = [];
    let cargaSeleccionada = null;
    let arrastrando = false;

    // Parámetros de visualización de líneas de campo (E2)
    const seedPaso = 40;      // separación entre semillas de trazado
    const stepSize = 4;       // paso en píxeles para el trazado (menor = más suave)
    const maxSteps = 500;     // longitud máxima por línea
    const minDistToCharge = 14; // distancia a partir de la cual consideramos que la línea "termina" al acercarse a una carga
    const arrowEvery = 18;    // cada cuántos píxels (aprox) dibujar una flecha en la línea

    // --- CLASE PARA LAS CARGAS ---
    class Carga {
        constructor(x, y, q) {
            this.id = Date.now() + Math.random(); // ID único para cada carga
            this.x = x;
            this.y = y;
            this.q = q; // en µC
            this.radio = 12;
        }

        dibujar() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radio, 0, 2 * Math.PI);
            ctx.fillStyle = this.q > 0 ? 'crimson' : 'royalblue';
            ctx.fill();
            ctx.fillStyle = 'white';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.q > 0 ? '+' : '−', this.x, this.y);
        }

        contiene(px, py) {
            const dist = Math.hypot(px - this.x, py - this.y);
            return dist < this.radio;
        }
    }

    // --- CÁLCULOS FÍSICOS ---
    function calcularCampoElectricoEn(x, y) {
        let Ex = 0, Ey = 0;
        for (const c of cargas) {
            const dx = x - c.x;
            const dy = y - c.y;
            const r2 = dx * dx + dy * dy;
            if (r2 < 0.5) continue; // evita singularidad y contribuciones gigantes
            const r = Math.sqrt(r2);
            // E = k * q / r^2 (q en C)
            const E = (k * c.q * 1e-6) / r2;
            Ex += E * (dx / r);
            Ey += E * (dy / r);
        }
        return { x: Ex, y: Ey };
    }

    function campoNormalizadoEn(x, y) {
        const E = calcularCampoElectricoEn(x, y);
        const mag = Math.hypot(E.x, E.y);
        if (mag === 0) return { x: 0, y: 0, mag: 0 };
        return { x: E.x / mag, y: E.y / mag, mag };
    }

    function calcularFuerzaCoulomb(c1, c2) {
        const dx = c1.x - c2.x;
        const dy = c1.y - c2.y;
        const r2 = dx * dx + dy * dy;
        if (r2 < 1) return 0;
        return (k * Math.abs(c1.q * 1e-6 * c2.q * 1e-6)) / r2;
    }

    // --- DIBUJO DE LÍNEAS DE CAMPO (E2) ---
    // Dibuja una flecha triangular en (x,y) orientada según angle, con tamaño size
    function dibujarFlechaTriangular(x, y, angle, size, alpha = 1) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-size, size / 2);
        ctx.lineTo(-size, -size / 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    // Comprueba si un punto está demasiado cerca de cualquier carga (para terminar la línea)
    function cercaDeCarga(x, y, threshold = minDistToCharge) {
        for (const c of cargas) {
            if (Math.hypot(x - c.x, y - c.y) < threshold) return true;
        }
        return false;
    }

    // Traza una única línea de campo desde (sx,sy) en la dirección dada (forward = true) usando integración simple (RK2)
    function trazarLineaDesde(sx, sy, forward = true) {
        const puntos = [];
        let x = sx, y = sy;

        for (let step = 0; step < maxSteps; step++) {
            const { x: nx, y: ny, mag } = campoNormalizadoEn(x, y);
            if (mag === 0) break;

            // si estamos trazando en sentido opuesto invertimos la dirección
            const dirx = forward ? nx : -nx;
            const diry = forward ? ny : -ny;

            // RK2 (Heun) para mayor estabilidad
            const k1x = dirx * stepSize;
            const k1y = diry * stepSize;

            const midx = x + k1x * 0.5;
            const midy = y + k1y * 0.5;
            const mid = campoNormalizadoEn(midx, midy);
            const dirMidx = forward ? mid.x : -mid.x;
            const dirMidy = forward ? mid.y : -mid.y;

            const k2x = dirMidx * stepSize;
            const k2y = dirMidy * stepSize;

            const nxp = x + k2x;
            const nyp = y + k2y;

            // parar si salimos del canvas
            if (nxp < 0 || nxp > canvas.width || nyp < 0 || nyp > canvas.height) break;

            // añadir segmento
            puntos.push({ x1: x, y1: y, x2: nxp, y2: nyp, dirx: dirMidx, diry: dirMidy });

            // actualizar posición
            x = nxp; y = nyp;

            // terminar si nos acercamos mucho a una carga
            if (cercaDeCarga(x, y)) break;
        }

        return puntos;
    }

    // Dibuja todas las líneas de campo usando semillas en una cuadrícula y evita repetir
    function dibujarLineasDeCampo() {
        // color y estilo
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(60, 180, 75, 0.9)'; // tono verde
        ctx.fillStyle = 'rgba(60, 180, 75, 0.9)';

        const visitedSeeds = new Set();

        for (let sx = seedPaso / 2; sx < canvas.width; sx += seedPaso) {
            for (let sy = seedPaso / 2; sy < canvas.height; sy += seedPaso) {
                // evitar semillas que estén encima de una carga
                if (cargas.some(c => Math.hypot(sx - c.x, sy - c.y) < c.radio + 6)) continue;

                // use forward and backward traces to get a fuller line
                const forward = trazarLineaDesde(sx, sy, true);
                const backward = trazarLineaDesde(sx, sy, false).reverse();

                // concatenamos: backward + forward para hacer una linea continua
                const line = backward.concat(forward);

                if (line.length < 1) continue;

                // simple check para evitar dibujar casi-duplicados: hash del primer segmento
                const hash = `${Math.round(line[0].x1/4)}_${Math.round(line[0].y1/4)}_${Math.round(line[line.length-1].x2/4)}_${Math.round(line[line.length-1].y2/4)}`;
                if (visitedSeeds.has(hash)) continue;
                visitedSeeds.add(hash);

                // dibujar segmentos
                ctx.beginPath();
                for (let i = 0; i < line.length; i++) {
                    const seg = line[i];
                    ctx.moveTo(seg.x1, seg.y1);
                    ctx.lineTo(seg.x2, seg.y2);
                }
                ctx.stroke();

                // dibujar flechas a lo largo de la línea (cada cierto "avance" aproximado)
                let acum = 0;
                for (let i = 0; i < line.length; i++) {
                    const seg = line[i];
                    const segLen = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
                    acum += segLen;
                    if (acum >= arrowEvery) {
                        acum = 0;
                        const midx = (seg.x1 + seg.x2) / 2;
                        const midy = (seg.y1 + seg.y2) / 2;
                        const angle = Math.atan2(seg.diry, seg.dirx);
                        // flecha proporcional al tamaño de segment (pero limitada)
                        const asize = Math.min(10, Math.max(4, arrowEvery * 0.4));
                        ctx.fillStyle = 'rgba(60, 180, 75, 0.95)';
                        dibujarFlechaTriangular(midx, midy, angle, asize, 0.95);
                    }
                }
            }
        }
    }

    // --- DIBUJOS AUXILIARES ---
    // Dibuja también pequeños vectores de referencia (opcionalmente)
    function dibujarMiniVectores() {
        // Esto queda opcional/desactivado para E2 (dejamos solo las líneas)
    }

    // Bucle principal de dibujo
    function dibujar() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // dibujar líneas de campo (E2)
        if (cargas.length > 0) dibujarLineasDeCampo();
        // dibujar cargas encima
        for (const c of cargas) c.dibujar();
        // actualizar panel (si existe)
        actualizarPanelInfo();
    }

    // --- PANEL DE INFORMACIÓN (solo cosas útiles) ---
    function actualizarPanelInfo() {
        // Lista de cargas
        const listaCargasUI = document.getElementById('lista-cargas');
        if (listaCargasUI) {
            listaCargasUI.innerHTML = '';
            cargas.forEach((c, idx) => {
                const item = document.createElement('li');
                item.dataset.id = c.id;
                item.style.display = 'flex';
                item.style.alignItems = 'center';
                item.style.gap = '8px';

                const colorBox = document.createElement('div');
                colorBox.className = 'color-box';
                colorBox.style.width = '12px';
                colorBox.style.height = '12px';
                colorBox.style.borderRadius = '3px';
                colorBox.style.backgroundColor = c.q > 0 ? 'crimson' : 'royalblue';

                item.appendChild(colorBox);
                item.append(`Carga ${idx + 1} (${c.q.toFixed(1)} µC) — x:${Math.round(c.x)}, y:${Math.round(c.y)}`);
                listaCargasUI.appendChild(item);
            });
        }

        // Ley de Coulomb: si hay 2 seleccionadas
        const cargasSeleccionadas = document.querySelectorAll('#lista-cargas li.selected');
        const infoCoulombUI = document.getElementById('info-coulomb');
        if (cargasSeleccionadas.length === 2 && infoCoulombUI) {
            const id1 = Number(cargasSeleccionadas[0].dataset.id);
            const id2 = Number(cargasSeleccionadas[1].dataset.id);
            const c1 = cargas.find(c => c.id === id1);
            const c2 = cargas.find(c => c.id === id2);
            if (c1 && c2) {
                const fuerza = calcularFuerzaCoulomb(c1, c2);
                const el1 = document.getElementById('coulomb-c1');
                const el2 = document.getElementById('coulomb-c2');
                const elF = document.getElementById('fuerza-coulomb');
                if (el1) el1.textContent = Array.from(listaCargasUI.children).indexOf(cargasSeleccionadas[0]) + 1;
                if (el2) el2.textContent = Array.from(listaCargasUI.children).indexOf(cargasSeleccionadas[1]) + 1;
                if (elF) elF.textContent = fuerza.toExponential(2);
                infoCoulombUI.classList.remove('hidden');
            }
        } else if (infoCoulombUI) {
            infoCoulombUI.classList.add('hidden');
        }
    }

    // --- MANEJO DE EVENTOS ---
    canvas.addEventListener('mousedown', e => {
        const { x, y } = getMousePos(e);
        cargaSeleccionada = cargas.find(c => c.contiene(x, y)) || null;
        arrastrando = !!cargaSeleccionada;
    });

    canvas.addEventListener('mousemove', e => {
        if (arrastrando && cargaSeleccionada) {
            const { x, y } = getMousePos(e);
            cargaSeleccionada.x = x;
            cargaSeleccionada.y = y;
            dibujar();
        } else {
            // Si quieres mostrar la magnitud del campo bajo el cursor en algún elemento
            const pos = getMousePos(e);
            const campo = calcularCampoElectricoEn(pos.x, pos.y);
            const mag = Math.hypot(campo.x, campo.y);
            const elMag = document.getElementById('campo-magnitud');
            if (elMag) elMag.textContent = `|E|(x,y) = ${mag.toExponential(2)} N/C`;
        }
    });

    canvas.addEventListener('mouseup', e => {
    if (!arrastrando) {
        const { x, y } = getMousePos(e);
        const q_str = prompt('Introduce el valor de la carga en micro-Coulombs (µC). Usa negativo para carga negativa.', '1.0');
        const q = parseFloat(q_str);
        if (!isNaN(q)) {
            cargas.push(new Carga(x, y, q));
        }
    }
    arrastrando = false;
    cargaSeleccionada = null;
    dibujar();
});


    // Doble clic para eliminar una carga
    canvas.addEventListener('dblclick', e => {
        const { x, y } = getMousePos(e);
        cargas = cargas.filter(c => !c.contiene(x, y));
        dibujar();
    });

    // Botón reiniciar (si existe en el DOM)
    const btnReiniciar = document.getElementById('btn-reiniciar');
    if (btnReiniciar) {
        btnReiniciar.addEventListener('click', () => {
            cargas = [];
            dibujar();
        });
    }

    // Manejo de selección en la lista de cargas (para la Ley de Coulomb)
    const listaCargasEl = document.getElementById('lista-cargas');
    if (listaCargasEl) {
        listaCargasEl.addEventListener('click', e => {
            // permitir seleccionar solo li
            let target = e.target;
            while (target && target.tagName !== 'LI') {
                target = target.parentElement;
            }
            if (!target) return;
            const seleccionados = document.querySelectorAll('#lista-cargas li.selected');
            if (target.classList.contains('selected')) {
                target.classList.remove('selected');
            } else {
                if (seleccionados.length < 2) {
                    target.classList.add('selected');
                } else {
                    // quita el primero y añade el nuevo
                    seleccionados[0].classList.remove('selected');
                    target.classList.add('selected');
                }
            }
            actualizarPanelInfo();
        });
    }

    // Obtiene las coordenadas del ratón relativas al canvas
    function getMousePos(evt) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (evt.clientX - rect.left) * (canvas.width / rect.width),
            y: (evt.clientY - rect.top) * (canvas.height / rect.height)
        };
    }

    // Iniciar la simulación (primer dibujado)
    dibujar();
});

