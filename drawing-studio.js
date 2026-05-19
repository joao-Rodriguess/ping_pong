// Drawing Studio Logic - Upgraded & Fully Polished
const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
const videoElement = document.querySelector('.input_video');
const canvasElement = document.querySelector('.output_canvas');
const canvasCtx = canvasElement.getContext('2d');

// Drawing State
let isDrawing = false;
let brushMode = 'neon'; // 'neon', 'rainbow', 'sparks', 'eraser'
let currentColor = '#ff0055';
let brushSize = 8;
let lastPoint = null;

// Sparks list
const drawingSparks = [];

// Set up initial canvas background
ctx.fillStyle = '#0a0a12';
ctx.fillRect(0, 0, canvas.width, canvas.height);

class DrawingSpark {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 5;
        this.vy = (Math.random() - 0.5) * 5 - 1; // Sobe levemente
        this.color = color;
        this.alpha = 1;
        this.decay = Math.random() * 0.03 + 0.025;
        this.size = Math.random() * 4 + 2;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.08; // Gravidade
        this.alpha -= this.decay;
    }

    draw(context) {
        if (this.alpha <= 0) return;
        context.save();
        context.globalAlpha = Math.max(0, this.alpha);
        context.fillStyle = this.color;
        context.shadowBlur = 10;
        context.shadowColor = this.color;
        context.beginPath();
        context.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        context.fill();
        context.restore();
    }
}

// UI Setup: Color Palette
const colorButtons = document.querySelectorAll('.color-btn');
colorButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        // Se estiver em modo borracha, muda de volta para neon
        if (brushMode === 'eraser') {
            setBrushMode('neon');
        }
        colorButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentColor = btn.dataset.color;
        Sound.playBeep(650, 0.06);
    });
});

// UI Setup: Brush Modes
const brushModes = {
    neon: document.getElementById('brushNeon'),
    rainbow: document.getElementById('brushRainbow'),
    sparks: document.getElementById('brushSparks'),
    eraser: document.getElementById('brushEraser')
};

function setBrushMode(mode) {
    brushMode = mode;
    Object.keys(brushModes).forEach(m => {
        if (brushModes[m]) {
            brushModes[m].style.background = 'transparent';
            brushModes[m].style.color = brushModes[m].style.borderColor;
        }
    });

    const activeBtn = brushModes[mode];
    if (activeBtn) {
        activeBtn.style.background = activeBtn.style.borderColor;
        activeBtn.style.color = '#0a0a12';
    }
    Sound.playBeep(700, 0.08);
}

// Bind Brush Clicks
if (brushModes.neon) brushModes.neon.addEventListener('click', () => setBrushMode('neon'));
if (brushModes.rainbow) brushModes.rainbow.addEventListener('click', () => setBrushMode('rainbow'));
if (brushModes.sparks) brushModes.sparks.addEventListener('click', () => setBrushMode('sparks'));
if (brushModes.eraser) brushModes.eraser.addEventListener('click', () => setBrushMode('eraser'));

// Iniciar com modo Neon ativo visualmente
setBrushMode('neon');

// Clear button
document.getElementById('clearBtn').addEventListener('click', () => {
    ctx.save();
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    drawingSparks.length = 0;
    Sound.playBeep(400, 0.15);
});

// Photo button
document.getElementById('photoBtn').addEventListener('click', () => {
    Sound.playShutter();
    flashScreen();

    // Criar um canvas temporário para fundir o feed da câmera com o desenho
    const photoCanvas = document.createElement('canvas');
    photoCanvas.width = canvas.width;
    photoCanvas.height = canvas.height;
    const photoCtx = photoCanvas.getContext('2d');

    // Desenhar feed da webcam espelhado
    photoCtx.save();
    photoCtx.scale(-1, 1);
    photoCtx.drawImage(videoElement, -canvas.width, 0, canvas.width, canvas.height);
    photoCtx.restore();

    // Desenhar o que foi desenhado por cima (respeitando a transparência caso tenha apagado)
    photoCtx.drawImage(canvas, 0, 0);

    // Convert to image and download
    photoCanvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `camera-art-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
    });
});

function flashScreen() {
    const flash = document.createElement('div');
    flash.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: white;
        opacity: 0.9;
        pointer-events: none;
        z-index: 9999;
        animation: fadeOut 0.4s ease-out;
    `;
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 400);
}

// MediaPipe Hands Setup
function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];

        // Desenhar esqueleto da mão no preview
        drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: '#00ff88', lineWidth: 2 });
        drawLandmarks(canvasCtx, landmarks, { color: '#b537ff', lineWidth: 1 });

        // Coordenadas da ponta do indicador (landmark 8) e polegar (landmark 4)
        const indexTip = landmarks[8];
        const thumbTip = landmarks[4];
        
        const drawPoint = {
            x: (1 - indexTip.x) * canvas.width, // Espelhar
            y: indexTip.y * canvas.height
        };

        const thumbPoint = {
            x: (1 - thumbTip.x) * canvas.width,
            y: thumbTip.y * canvas.height
        };

        // Medir distância entre polegar e indicador
        const distThumbIndex = distance(drawPoint, thumbPoint);
        const isPinching = distThumbIndex < 35; // Gesto de Beliscar (desenhar)

        // Forçar borracha temporária se o usuário fechar o punho (Closed Fist)
        const handClosed = isClosedFist(landmarks);
        const activeMode = handClosed ? 'eraser' : brushMode;

        // Se NÃO estiver desenhando, atualizar dinamicamente o tamanho do pincel com a pinça
        if (!isPinching && !handClosed) {
            brushSize = Math.max(3, Math.min(40, distThumbIndex * 0.35));
        }

        // Definir cor se for modo Arco-íris
        if (activeMode === 'rainbow') {
            currentColor = `hsl(${(Date.now() / 9) % 360}, 100%, 55%)`;
        }

        // Executar desenho se estiver beliscando ou com punho fechado (apagando)
        if (isPinching || handClosed) {
            if (!isDrawing) {
                isDrawing = true;
                lastPoint = drawPoint;
            } else {
                ctx.save();
                ctx.lineWidth = activeMode === 'eraser' ? brushSize * 2.5 : brushSize;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                if (activeMode === 'eraser') {
                    // Borracha real que apaga para revelar a câmera de fundo!
                    ctx.globalCompositeOperation = 'destination-out';
                    ctx.beginPath();
                    ctx.moveTo(lastPoint.x, lastPoint.y);
                    ctx.lineTo(drawPoint.x, drawPoint.y);
                    ctx.stroke();
                } else if (activeMode === 'sparks') {
                    // Pincel de Faíscas! Adiciona partículas e desenha um traço leve
                    ctx.strokeStyle = `rgba(255, 255, 255, 0.15)`;
                    ctx.beginPath();
                    ctx.moveTo(lastPoint.x, lastPoint.y);
                    ctx.lineTo(drawPoint.x, drawPoint.y);
                    ctx.stroke();

                    // Adicionar partículas de faísca
                    const sparksColor = currentColor;
                    for (let k = 0; k < 2; k++) {
                        drawingSparks.push(new DrawingSpark(drawPoint.x, drawPoint.y, sparksColor));
                    }
                } else {
                    // Neon e Arco-Íris
                    ctx.strokeStyle = currentColor;
                    ctx.shadowBlur = brushSize * 1.8;
                    ctx.shadowColor = currentColor;
                    ctx.beginPath();
                    ctx.moveTo(lastPoint.x, lastPoint.y);
                    ctx.lineTo(drawPoint.x, drawPoint.y);
                    ctx.stroke();
                }
                ctx.restore();
                lastPoint = drawPoint;
            }

            // cursor visual desenhando
            ctx.save();
            ctx.strokeStyle = activeMode === 'eraser' ? '#ffffff' : currentColor;
            ctx.lineWidth = 2;
            if (activeMode !== 'eraser') {
                ctx.shadowBlur = 10;
                ctx.shadowColor = currentColor;
            }
            ctx.beginPath();
            ctx.arc(drawPoint.x, drawPoint.y, activeMode === 'eraser' ? brushSize * 2.5 : brushSize + 3, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        } else {
            isDrawing = false;
            lastPoint = null;

            // cursor visual navegando (sem desenhar)
            ctx.save();
            ctx.strokeStyle = activeMode === 'eraser' ? '#ffffff' : 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(drawPoint.x, drawPoint.y, brushSize, 0, Math.PI * 2);
            ctx.stroke();
            
            // Desenha linha de referência de tamanho do polegar ao indicador
            ctx.strokeStyle = 'rgba(0, 243, 255, 0.3)';
            ctx.beginPath();
            ctx.moveTo(drawPoint.x, drawPoint.y);
            ctx.lineTo(thumbPoint.x, thumbPoint.y);
            ctx.stroke();
            ctx.restore();
        }
    } else {
        isDrawing = false;
        lastPoint = null;
    }

    canvasCtx.restore();
}

const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

hands.onResults(onResults);

const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({ image: videoElement });
    },
    width: 640,
    height: 480
});

// Start button trigger
document.getElementById('startBtn').addEventListener('click', async () => {
    document.getElementById('controls').style.display = 'none';
    createBackButton();
    Sound.playPowerup();
    await camera.start();
});

// Loop para animar as faíscas continuamente por cima do canvas
function animationLoop() {
    // Atualizar e desenhar as faíscas
    if (drawingSparks.length > 0) {
        // Desenhamos diretamente sobre o canvas de desenho para persistir ou apenas na tela?
        // Se desenharmos no canvas, as faíscas ficam gravadas no desenho. Isso é legal!
        ctx.save();
        for (let i = drawingSparks.length - 1; i >= 0; i--) {
            const spark = drawingSparks[i];
            spark.update();
            spark.draw(ctx);
            if (spark.alpha <= 0) {
                drawingSparks.splice(i, 1);
            }
        }
        ctx.restore();
    }

    requestAnimationFrame(animationLoop);
}

// Iniciar Loop
animationLoop();

// Add flash animation
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeOut {
        from { opacity: 0.9; }
        to { opacity: 0; }
    }
`;
document.head.appendChild(style);
