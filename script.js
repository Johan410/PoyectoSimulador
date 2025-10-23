document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('simCanvas');
    const ctx = canvas.getContext('2d');

    const k = 8.9875517923e9;
    const ε0 = 8.854e-12;

    let cargas = [];
    let cargaSeleccionada = null;
    let arrastrando = false;
    let mostrarSuperficieGaussiana = false;

    class Carga {
        constructor(x, y, q) {
            this.id = Date.now();
            this.x = x;
            this.y = y;
            this.q = q;
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
            return Math.hypot(px - this.x, py - this.y) < this.radio;
        }
    }

    function calcularCampoElectricoEn(x, y) {
        let Ex = 0, Ey = 0;
        cargas.forEach(c => {
            const dx = x - c.x;
            const dy = y - c.y;
            const r2 = dx*dx + dy*dy;
            if (r2 < 1) return;
            const r = Math.sqrt(r2);
            const E = (k * c.q * 1e-6) / r2;
            Ex += E * (dx / r);
            Ey += E * (dy / r);
        });
        return { x: Ex, y: Ey };
    }

    function dibujarFlecha(x1, y1, x2, y2, color, alpha = 1.0) {
        const headLength = 6;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const angle = Math.atan2(dy, dx);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLength * Math.cos(angle - Math.PI/6), y2 - headLength * Math.sin(angle - Math.PI/6));
        ctx.lineTo(x2 - headLength * Math.cos(angle + Math.PI/6), y2 - headLength * Math.sin(angle + Math.PI/6));
        ctx.lineTo(x2, y2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }

    function dibujarCampoElectrico() {
        const paso = 40;
        for (let x = paso/2; x < canvas.width; x+=paso) {
            for (let y = paso/2; y < canvas.height; y+=paso) {
                const E = calcularCampoElectricoEn(x, y);
                const mag = Math.hypot(E.x, E.y);
                if (mag < 1) continue;
                const nx = E.x / mag;
                const ny = E.y / mag;
                const logMag = Math.log10(mag);
                const len = Math.min(logMag * 5, paso/2);
                const alpha = Math.min(logMag/8, 0.8);
                dibujarFlecha(x, y, x + nx*len, y + ny*len, 'lightgreen', alpha);
            }
        }
    }

    function dibujar() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        dibujarCampoElectrico();
        cargas.forEach(c => c.dibujar());
    }

    canvas.addEventListener('mousedown', e => {
        const {x,y} = getMousePos(e);
        cargaSeleccionada = cargas.find(c => c.contiene(x,y)) || null;
        arrastrando = !!cargaSeleccionada;
    });

    canvas.addEventListener('mousemove', e => {
        if (arrastrando && cargaSeleccionada) {
            const {x,y} = getMousePos(e);
            cargaSeleccionada.x = x;
            cargaSeleccionada.y = y;
            dibujar();
        }
    });

    canvas.addEventListener('mouseup', e => {
        if (!arrastrando) {
            const {x,y} = getMousePos(e);
            const q_str = prompt('Valor de la carga en μC:', '1.0');
            const q = parseFloat(q_str);
            if (!isNaN(q)) cargas.push(new Carga(x,y,q));
        }
        arrastrando = false;
        cargaSeleccionada = null;
        dibujar();
    });

    canvas.addEventListener('dblclick', e => {
        const {x,y}=getMousePos(e);
        cargas = cargas.filter(c=>!c.contiene(x,y));
        dibujar();
    });

    document.getElementById('btn-reiniciar').addEventListener('click', () => {
        cargas = [];
        dibujar();
    });

    document.getElementById('btn-gauss').addEventListener('click', () => {
        mostrarSuperficieGaussiana = !mostrarSuperficieGaussiana;
        dibujar();
    });

    function getMousePos(evt) {
        const rect = canvas.getBoundingClientRect();
        return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
    }

    dibujar();
});
