document.addEventListener('DOMContentLoaded', () => {

    // --- CONFIGURACIÓN INICIAL ---
    const canvas = document.getElementById('simCanvas');
    const ctx = canvas.getContext('2d');

    // Constantes físicas
    const k = 8.9875517923e9; // Constante de Coulomb (N·m²/C²)
    const ε0 = 8.854e-12; // Permitividad del vacío (F/m)

    // Estado de la simulación
    let cargas = [];
    let cargaSeleccionada = null;
    let arrastrando = false;
    let mostrarSuperficieGaussiana = false;

    // Objeto para la superficie gaussiana (un círculo)
    let superficieGaussiana = { x: canvas.width / 2, y: canvas.height / 2, radio: 150 };

    // --- CLASE PARA LAS CARGAS ---
    class Carga {
        constructor(x, y, q) {
            this.id = Date.now(); // ID único para cada carga
            this.x = x;
            this.y = y;
            this.q = q; // Carga en micro-Coulombs (µC)
            this.radio = 12; // Radio visual
        }

        // Dibuja la carga en el canvas
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

        // Comprueba si un punto (px, py) está dentro de la carga
        contiene(px, py) {
            const dist = Math.sqrt((px - this.x) ** 2 + (py - this.y) ** 2);
            return dist < this.radio;
        }
    }

    // --- FUNCIONES DE CÁLCULO FÍSICO ---

    // Calcula el vector de campo eléctrico en un punto (x, y) por superposición
    function calcularCampoElectricoEn(x, y) {
        let Ex = 0, Ey = 0;

        cargas.forEach(c => {
            const dx = x - c.x;
            const dy = y - c.y;
            const r2 = dx * dx + dy * dy;
            
            // Evitar división por cero si el punto está sobre la carga
            if (r2 < 1) return;

            const r = Math.sqrt(r2);
            const E = (k * c.q * 1e-6) / r2; // Convertir µC a C para el cálculo
            Ex += E * (dx / r);
            Ey += E * (dy / r);
        });

        return { x: Ex, y: Ey };
    }

    // Calcula la fuerza de Coulomb entre dos cargas
    function calcularFuerzaCoulomb(c1, c2) {
        const dx = c1.x - c2.x;
        const dy = c1.y - c2.y;
        const r2 = dx * dx + dy * dy;
        
        if (r2 < 1) return 0; // Evitar división por cero
        
        // F = k * |q1 * q2| / r^2
        const fuerza = (k * Math.abs(c1.q * 1e-6 * c2.q * 1e-6)) / r2;
        return fuerza;
    }

    // Calcula la carga total encerrada por la superficie gaussiana
    function calcularCargaEncerrada() {
        let cargaTotal = 0;
        cargas.forEach(c => {
            const dist = Math.sqrt((c.x - superficieGaussiana.x) ** 2 + (c.y - superficieGaussiana.y) ** 2);
            if (dist < superficieGaussiana.radio) {
                cargaTotal += c.q;
            }
        });
        return cargaTotal;
    }

    // --- FUNCIONES DE DIBUJO Y ACTUALIZACIÓN ---

    // Dibuja el campo eléctrico como una cuadrícula de vectores
    function dibujarCampoElectrico() {
        const paso = 40; // Espaciado de la cuadrícula
        for (let x = paso / 2; x < canvas.width; x += paso) {
            for (let y = paso / 2; y < canvas.height; y += paso) {
                const E = calcularCampoElectricoEn(x, y);
                const magnitud = Math.sqrt(E.x ** 2 + E.y ** 2);
                
                if (magnitud < 1) continue;

                // Normalizar y escalar el vector para visualización
                const Ex_norm = E.x / magnitud;
                const Ey_norm = E.y / magnitud;
                
                // El color y la longitud dependen de la intensidad del campo
                const logMag = Math.log10(magnitud);
                const longitud = Math.min(logMag * 5, paso / 2);
                const alpha = Math.min(logMag / 8, 0.8);

                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x + Ex_norm * longitud, y + Ey_norm * longitud);
                ctx.strokeStyle = `rgba(144, 238, 144, ${alpha})`; // Verde claro transparente
                ctx.stroke();
            }
        }
    }

    // Dibuja la superficie gaussiana
    function dibujarSuperficieGaussiana() {
        if (!mostrarSuperficieGaussiana) return;
        ctx.beginPath();
        ctx.arc(superficieGaussiana.x, superficieGaussiana.y, superficieGaussiana.radio, 0, 2 * Math.PI);
        ctx.strokeStyle = '#ffde59'; // Amarillo
        ctx.setLineDash([5, 5]); // Línea punteada
        ctx.stroke();
        ctx.setLineDash([]); // Restablecer
    }

    // Bucle principal de dibujo
    function dibujar() {
        ctx.clearRect(0, 0, canvas.width, canvas.height); // Limpiar canvas
        dibujarCampoElectrico();
        cargas.forEach(c => c.dibujar());
        dibujarSuperficieGaussiana();
        actualizarPanelInfo();
    }

    // Actualiza el panel de información (Ley de Gauss y lista de cargas)
    function actualizarPanelInfo() {
        // Actualizar Ley de Gauss
        if (mostrarSuperficieGaussiana) {
            const cargaEncerrada = calcularCargaEncerrada();
            const flujo = (cargaEncerrada * 1e-6) / ε0; // Flujo = Q_enc / ε₀
            document.getElementById('carga-encerrada').textContent = cargaEncerrada.toFixed(2);
            document.getElementById('flujo-electrico').textContent = flujo.toExponential(2);
            document.getElementById('info-gauss').classList.remove('hidden');
        } else {
            document.getElementById('info-gauss').classList.add('hidden');
        }

        // Actualizar lista de cargas
        const listaCargasUI = document.getElementById('lista-cargas');
        listaCargasUI.innerHTML = '';
        cargas.forEach((c, index) => {
            const item = document.createElement('li');
            item.dataset.id = c.id;
            
            const colorBox = document.createElement('div');
            colorBox.className = 'color-box';
            colorBox.style.backgroundColor = c.q > 0 ? 'crimson' : 'royalblue';

            item.appendChild(colorBox);
            item.append(`Carga ${index + 1} (${c.q.toFixed(1)} µC)`);
            
            listaCargasUI.appendChild(item);
        });

        // Actualizar Ley de Coulomb
        const cargasSeleccionadasCoulomb = document.querySelectorAll('#lista-cargas li.selected');
        const infoCoulombUI = document.getElementById('info-coulomb');

        if (cargasSeleccionadasCoulomb.length === 2) {
            const id1 = Number(cargasSeleccionadasCoulomb[0].dataset.id);
            const id2 = Number(cargasSeleccionadasCoulomb[1].dataset.id);
            const carga1 = cargas.find(c => c.id === id1);
            const carga2 = cargas.find(c => c.id === id2);

            if (carga1 && carga2) {
                const fuerza = calcularFuerzaCoulomb(carga1, carga2);
                document.getElementById('coulomb-c1').textContent = Array.from(listaCargasUI.children).indexOf(cargasSeleccionadasCoulomb[0]) + 1;
                document.getElementById('coulomb-c2').textContent = Array.from(listaCargasUI.children).indexOf(cargasSeleccionadasCoulomb[1]) + 1;
                document.getElementById('fuerza-coulomb').textContent = fuerza.toExponential(2);
                infoCoulombUI.classList.remove('hidden');
            }
        } else {
            infoCoulombUI.classList.add('hidden');
        }
    }

    // --- MANEJO DE EVENTOS ---

    // Clic del ratón
    canvas.addEventListener('mousedown', e => {
        const { x, y } = getMousePos(e);
        cargaSeleccionada = cargas.find(c => c.contiene(x, y)) || null;
        arrastrando = !!cargaSeleccionada;
    });

    // Mover el ratón
    canvas.addEventListener('mousemove', e => {
        if (arrastrando && cargaSeleccionada) {
            const { x, y } = getMousePos(e);
            cargaSeleccionada.x = x;
            cargaSeleccionada.y = y;
            dibujar();
        }
    });

    // Soltar el clic del ratón
    canvas.addEventListener('mouseup', e => {
        // Si no estábamos arrastrando, significa que fue un clic simple para crear una carga
        if (!arrastrando) {
            const { x, y } = getMousePos(e);
            // Pide al usuario el valor de la carga
            const q_str = prompt('Introduce el valor de la carga en micro-Coulombs (µC).\nUsa un valor negativo para una carga negativa.', '1.0');
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

    // Clic en los botones y la lista
    document.getElementById('btn-reiniciar').addEventListener('click', () => {
        cargas = [];
        dibujar();
    });

    document.getElementById('btn-gauss').addEventListener('click', () => {
        mostrarSuperficieGaussiana = !mostrarSuperficieGaussiana;
        dibujar();
    });

    document.getElementById('lista-cargas').addEventListener('click', e => {
        if (e.target.tagName === 'LI') {
            const seleccionados = document.querySelectorAll('#lista-cargas li.selected');
            if (e.target.classList.contains('selected')) {
                e.target.classList.remove('selected');
            } else {
                if (seleccionados.length < 2) {
                    e.target.classList.add('selected');
                } else {
                    // Si ya hay dos, quita el primero y añade el nuevo
                    seleccionados[0].classList.remove('selected');
                    e.target.classList.add('selected');
                }
            }
            actualizarPanelInfo();
        }
    });

    // Obtiene las coordenadas del ratón relativas al canvas
    function getMousePos(evt) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: evt.clientX - rect.left,
            y: evt.clientY - rect.top
        };
    }

    // Iniciar la simulación
    dibujar();
});