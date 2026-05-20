// Cyber Photo Booth - Futuristic AI Portrait Studio
const canvas = document.getElementById('boothCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const videoElement = document.querySelector('.input_video');
const flashOverlay = document.getElementById('cameraFlash');
const countdownDisplay = document.getElementById('countdownDisplay');
const captureBtn = document.getElementById('captureBtn');

// Estado da Cabine
let activeFaceFilter = 'visor'; // visor, horns, halo, none
let activeImageFilter = 'glitch'; // glitch, matrix, thermal, normal
let activeFrame = 'tokyo'; // tokyo, glitch, none
let faceCalibrating = true;
let calibrationProgress = 0; // 0 a 100
let faceLandmarks = null;
let landmarksDetected = false;
let isCapturing = false;

// Configuração do Filtro Matrix
const fontSize = 14;
const matrixColumns = Math.floor(canvas.width / fontSize);
const matrixDrops = Array(matrixColumns).fill(0);

// Configuração do Flash
let flashOpacity = 0;

// Configurações do Particle System para efeito de sucesso
const particleManager = new ParticleManager();

// Inicialização dos botões de filtros faciais
document.querySelectorAll('.sidebar-left .booth-option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (isCapturing) return;
        document.querySelectorAll('.sidebar-left .booth-option-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeFaceFilter = btn.getAttribute('data-type');
        Sound.playBeep(700, 0.05);
    });
});

// Inicialização dos botões de filtros de imagem
document.querySelectorAll('.sidebar-right .booth-option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (isCapturing) return;
        document.querySelectorAll('.sidebar-right .booth-option-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeImageFilter = btn.getAttribute('data-filter');
        Sound.playBeep(600, 0.05);
    });
});

// Inicialização dos botões de moldura
document.querySelectorAll('.sidebar-right .btn-secondary').forEach(btn => {
    btn.addEventListener('click', () => {
        if (isCapturing) return;
        document.querySelectorAll('.sidebar-right .btn-secondary').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeFrame = btn.getAttribute('data-frame');
        Sound.playBeep(800, 0.05);
        
        // Aplica o estilo neon do botão selecionado
        document.querySelectorAll('.sidebar-right .btn-secondary').forEach(b => {
            b.style.borderColor = '';
            b.style.color = '';
            b.style.textShadow = '';
        });
        if (activeFrame === 'tokyo') {
            btn.style.borderColor = '#00f3ff';
            btn.style.color = '#00f3ff';
            btn.style.textShadow = '0 0 5px #00f3ff';
        } else if (activeFrame === 'glitch') {
            btn.style.borderColor = '#ff0055';
            btn.style.color = '#ff0055';
            btn.style.textShadow = '0 0 5px #ff0055';
        } else {
            btn.style.borderColor = '#ffffff';
            btn.style.color = '#ffffff';
        }
    });
});

// Evento do botão de captura
captureBtn.addEventListener('click', () => {
    if (isCapturing || faceCalibrating) return;
    triggerCapture();
});

// Criar botão de voltar no canto
createBackButton();

// Simulação de Calibração Sci-Fi de 3 segundos
function startCalibration() {
    faceCalibrating = true;
    calibrationProgress = 0;
    const interval = setInterval(() => {
        calibrationProgress += 2;
        if (calibrationProgress >= 100) {
            clearInterval(interval);
            faceCalibrating = false;
            Sound.playPowerup();
            // Criar explosão de partículas virtuais no centro para celebrar a carga completa
            particleManager.createExplosion(canvas.width / 2, canvas.height / 2, '#00f3ff', 35);
        }
    }, 60);
}

// Iniciar calibração ao carregar
startCalibration();

// Mapeamento de coordenadas tridimensionais da face espelhadas horizontalmente
function getFaceCoordinates(landmarks) {
    if (!landmarks) return null;

    // Coordenadas das pupilas (refineLandmarks: true nos dá 468 e 473)
    const pupilaDirReal = landmarks[468]; // Esquerda do canvas
    const pupilaEsqReal = landmarks[473]; // Direita do canvas

    // Converter para coordenadas de pixel no canvas 800x600
    // Como a câmera está espelhada horizontalmente no display principal, espelhamos o X:
    const eyeRight = {
        x: (1 - pupilaDirReal.x) * canvas.width,
        y: pupilaDirReal.y * canvas.height,
        z: pupilaDirReal.z * canvas.width
    };

    const eyeLeft = {
        x: (1 - pupilaEsqReal.x) * canvas.width,
        y: pupilaEsqReal.y * canvas.height,
        z: pupilaEsqReal.z * canvas.width
    };

    // Testa superior e pontos de contorno superiores
    const foreheadCenter = {
        x: (1 - landmarks[10].x) * canvas.width,
        y: landmarks[10].y * canvas.height
    };

    // Sobrancelhas extremas para orientar chifres
    const foreheadLeft = {
        x: (1 - landmarks[338].x) * canvas.width,
        y: landmarks[338].y * canvas.height
    };
    const foreheadRight = {
        x: (1 - landmarks[109].x) * canvas.width,
        y: landmarks[109].y * canvas.height
    };

    const noseTip = {
        x: (1 - landmarks[1].x) * canvas.width,
        y: landmarks[1].y * canvas.height
    };

    // Distância ocular e ângulo
    const eyeDist = Math.sqrt(Math.pow(eyeLeft.x - eyeRight.x, 2) + Math.pow(eyeLeft.y - eyeRight.y, 2));
    const angle = Math.atan2(eyeLeft.y - eyeRight.y, eyeLeft.x - eyeRight.x);

    return {
        eyeLeft,
        eyeRight,
        foreheadCenter,
        foreheadLeft,
        foreheadRight,
        noseTip,
        eyeDist,
        angle
    };
}

// ----------------------------------------------------
// SHADERS & FILTROS DE IMAGEM (CANVAS 2D)
// ----------------------------------------------------

// Filtro 1: Glitch RGB Split
function applyGlitchRGB() {
    // Deslocar fatias horizontais randômicas da tela
    if (Math.random() < 0.25) {
        const sliceCount = Math.floor(Math.random() * 3) + 1;
        for (let s = 0; s < sliceCount; s++) {
            const h = Math.random() * 45 + 15;
            const y = Math.random() * (canvas.height - h);
            const shift = (Math.random() - 0.5) * 28;
            ctx.drawImage(canvas, 0, y, canvas.width, h, shift, y, canvas.width, h);
        }
    }

    // Sobreposição rápida de canais de cor simulando RGB Split
    if (Math.random() < 0.12) {
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.globalCompositeOperation = 'screen';
        
        // Canal Magenta deslocado para a esquerda
        ctx.drawImage(canvas, -6, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(255, 0, 85, 0.15)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Canal Ciano deslocado para a direita
        ctx.drawImage(canvas, 6, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(0, 243, 255, 0.15)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.restore();
    }

    // Linhas horizontais de escaneamento instáveis
    if (Math.random() < 0.08) {
        ctx.fillStyle = 'rgba(0, 243, 255, 0.25)';
        ctx.fillRect(0, Math.random() * canvas.height, canvas.width, Math.random() * 4 + 1);
    }
}

// Filtro 2: Chuva de Códigos Matrix
function applyMatrixDigitalRain() {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 243, 255, 0.18)'; // Translúcido ciano
    ctx.font = `bold ${fontSize}px Orbitron`;

    for (let i = 0; i < matrixDrops.length; i++) {
        // Apenas desenhar de vez em quando para não saturar
        if (Math.random() > 0.45) {
            const char = Math.random() > 0.5 ? '1' : '0';
            const x = i * fontSize;
            const y = matrixDrops[i] * fontSize;

            ctx.fillText(char, x, y);

            if (y > canvas.height && Math.random() > 0.975) {
                matrixDrops[i] = 0;
            }
            matrixDrops[i]++;
        }
    }
    ctx.restore();
}

// Filtro 3: Visão Térmica Científica (Mapeamento de Brilho de Pixels)
function applyThermalVision() {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    // Loop otimizado pixel a pixel
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i+1];
        const b = data[i+2];

        // Luminância perceptiva do pixel
        const v = 0.299 * r + 0.587 * g + 0.114 * b;

        // Esquema térmico: Frio (azul) -> Médio (azul-escuro/roxo/vermelho) -> Quente (amarelo/branco)
        if (v < 50) {
            // Tons muito frios: azul profundo
            data[i] = 5;
            data[i+1] = 5;
            data[i+2] = v * 4;
        } else if (v < 120) {
            // Tons frios-médios: roxo a vermelho-alaranjado
            const ratio = (v - 50) / 70;
            data[i] = ratio * 200;
            data[i+1] = 0;
            data[i+2] = 200 * (1 - ratio);
        } else if (v < 200) {
            // Tons quentes: vermelho vivo a amarelo brilhante
            const ratio = (v - 120) / 80;
            data[i] = 255;
            data[i+1] = ratio * 220;
            data[i+2] = 0;
        } else {
            // Tons extremamente quentes: amarelo a branco puro de calor
            const ratio = (v - 200) / 55;
            data[i] = 255;
            data[i+1] = 255;
            data[i+2] = ratio * 255;
        }
    }
    ctx.putImageData(imgData, 0, 0);
}

// ----------------------------------------------------
// FILTROS FACIAIS NEON 3D (STICKERS FACIAIS)
// ----------------------------------------------------

// Filtro Facial A: Visor Cyberpunk Ciano/Rosa Holográfico
function drawCyberpunkVisor(coords) {
    const { eyeLeft, eyeRight, eyeDist, angle } = coords;

    // Ponto médio entre as pupilas
    const midX = (eyeLeft.x + eyeRight.x) / 2;
    const midY = (eyeLeft.y + eyeRight.y) / 2;

    ctx.save();
    ctx.translate(midX, midY);
    ctx.rotate(angle);

    // Efeito de brilho neon
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#00f3ff';

    // 1. Desenhar a lente do visor holográfico (Polígono alongado sci-fi)
    const visorWidth = eyeDist * 2.5;
    const visorHeight = visorWidth * 0.32;

    const grad = ctx.createLinearGradient(-visorWidth / 2, 0, visorWidth / 2, 0);
    grad.addColorStop(0, 'rgba(0, 243, 255, 0.45)');
    grad.addColorStop(0.5, 'rgba(255, 0, 85, 0.35)');
    grad.addColorStop(1, 'rgba(0, 243, 255, 0.45)');

    ctx.fillStyle = grad;
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.moveTo(-visorWidth * 0.48, -visorHeight * 0.4);
    ctx.lineTo(visorWidth * 0.48, -visorHeight * 0.4);
    ctx.lineTo(visorWidth * 0.5, visorHeight * 0.1);
    ctx.lineTo(visorWidth * 0.42, visorHeight * 0.5);
    ctx.lineTo(-visorWidth * 0.42, visorHeight * 0.5);
    ctx.lineTo(-visorWidth * 0.5, visorHeight * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 2. Linhas tecnológicas internas do HUD
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1;
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.moveTo(-visorWidth * 0.4, 0);
    ctx.lineTo(-visorWidth * 0.2, 0);
    ctx.moveTo(visorWidth * 0.2, 0);
    ctx.lineTo(visorWidth * 0.4, 0);
    ctx.stroke();

    // Marcador reticular central do HUD
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.8)';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.moveTo(-12, 0); ctx.lineTo(-4, 0);
    ctx.moveTo(4, 0); ctx.lineTo(12, 0);
    ctx.moveTo(0, -12); ctx.lineTo(0, -4);
    ctx.moveTo(0, 4); ctx.lineTo(0, 12);
    ctx.stroke();

    // 3. Telemetria e Texto Holográfico nas bordas
    ctx.fillStyle = '#00f3ff';
    ctx.font = 'bold 7px Orbitron';
    ctx.textAlign = 'right';
    ctx.fillText('SYS_OK', visorWidth * 0.38, -visorHeight * 0.05);
    ctx.textAlign = 'left';
    ctx.fillText('SCANNING...', -visorWidth * 0.38, -visorHeight * 0.05);

    ctx.restore();
}

// Filtro Facial B: Chifres de Energia Neon Vermelhos
function drawEnergyHorns(coords) {
    const { foreheadCenter, foreheadLeft, foreheadRight, eyeDist, angle } = coords;

    ctx.save();
    ctx.translate(foreheadCenter.x, foreheadCenter.y);
    ctx.rotate(angle);

    ctx.shadowBlur = 22;
    ctx.shadowColor = '#ff0055'; // Vermelho Neon brilhante

    const hornScale = eyeDist * 0.95;

    // Chifre Esquerdo da tela (Direito real do usuário)
    ctx.fillStyle = 'rgba(255, 0, 85, 0.45)';
    ctx.strokeStyle = '#ff0055';
    ctx.lineWidth = 3;
    ctx.beginPath();
    // Iniciar na base do chifre à esquerda
    ctx.moveTo(-hornScale * 0.6, -hornScale * 0.1);
    // Curvar até a ponta afiada superior externa
    ctx.bezierCurveTo(-hornScale * 1.2, -hornScale * 0.9, -hornScale * 1.6, -hornScale * 1.4, -hornScale * 1.5, -hornScale * 2.1);
    // Curvar de volta descendo por dentro até a base do chifre
    ctx.bezierCurveTo(-hornScale * 0.9, -hornScale * 1.2, -hornScale * 0.4, -hornScale * 0.7, -hornScale * 0.2, -hornScale * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Chifre Direito da tela (Esquerdo real do usuário)
    ctx.beginPath();
    ctx.moveTo(hornScale * 0.6, -hornScale * 0.1);
    ctx.bezierCurveTo(hornScale * 1.2, -hornScale * 0.9, hornScale * 1.6, -hornScale * 1.4, hornScale * 1.5, -hornScale * 2.1);
    ctx.bezierCurveTo(hornScale * 0.9, -hornScale * 1.2, hornScale * 0.4, -hornScale * 0.7, hornScale * 0.2, -hornScale * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Detalhe de conexão de energia rúnica entre as bases
    ctx.strokeStyle = 'rgba(255, 0, 85, 0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-hornScale * 0.25, -hornScale * 0.1);
    ctx.lineTo(0, -hornScale * 0.2);
    ctx.lineTo(hornScale * 0.25, -hornScale * 0.1);
    ctx.stroke();

    ctx.restore();
}

// Filtro Facial C: Ciber Auréola Neon Amarela Pulsante e Flutuante
function drawCyberHalo(coords) {
    const { foreheadCenter, eyeDist, angle } = coords;

    ctx.save();
    // Colocar a auréola consideravelmente acima da testa baseado na proporção do rosto
    const haloYOffset = eyeDist * 1.4;
    ctx.translate(foreheadCenter.x, foreheadCenter.y - haloYOffset);
    ctx.rotate(angle);

    // Efeito de pulso temporal
    const timePulse = Math.sin(Date.now() / 250);
    const scaleFactor = 1 + timePulse * 0.05;
    const blur = 18 + timePulse * 6;

    ctx.shadowBlur = blur;
    ctx.shadowColor = '#ffeb3b'; // Amarelo Neon

    const rx = eyeDist * 1.25 * scaleFactor;
    const ry = rx * 0.32; // Ângulo elíptico 3D

    // 1. Desenhar a elipse base da auréola
    ctx.strokeStyle = '#ffeb3b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    // 2. Adicionar pequenos anéis e segmentos de escaneamento tecnológico orbitando ao redor
    ctx.strokeStyle = 'rgba(255, 235, 59, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx + 14, ry + 5, 0, Date.now() / 1000, Date.now() / 1000 + Math.PI * 0.4);
    ctx.ellipse(0, 0, rx + 14, ry + 5, 0, Date.now() / 1000 + Math.PI, Date.now() / 1000 + Math.PI * 1.4);
    ctx.stroke();

    // 3. Partículas flutuantes de dados (quadrados ciber-holográficos)
    ctx.fillStyle = '#ffeb3b';
    ctx.shadowBlur = 8;
    for (let i = 0; i < 4; i++) {
        const pAngle = (Date.now() / 800 + (i * Math.PI / 2)) % (Math.PI * 2);
        const px = Math.cos(pAngle) * rx;
        const py = Math.sin(pAngle) * ry - 5;
        ctx.fillRect(px - 2, py - 2, 4, 4);
    }

    ctx.restore();
}

// ----------------------------------------------------
// MOLDURAS SCI-FI COM TELEMETRIA DINÂMICA
// ----------------------------------------------------

function drawSciFiFrame(type) {
    if (type === 'none') return;

    ctx.save();
    ctx.shadowBlur = 0; // Desativar sombra global para economizar recursos e garantir bordas afiadas

    const margin = 20;
    const w = canvas.width;
    const h = canvas.height;

    // Telemetria Comum: Data e Hora real formatada
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '/');

    if (type === 'tokyo') {
        const frameColor = '#00f3ff';
        const accentColor = '#ff0055';

        // Bordas finas ciano neon
        ctx.strokeStyle = frameColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(margin, margin, w - margin * 2, h - margin * 2);

        // Cantos recortados estilizados de ficção científica
        ctx.fillStyle = frameColor;
        // Superior esquerdo
        ctx.beginPath();
        ctx.moveTo(margin - 2, margin - 2);
        ctx.lineTo(margin + 30, margin - 2);
        ctx.lineTo(margin - 2, margin + 30);
        ctx.closePath();
        ctx.fill();

        // Superior direito
        ctx.beginPath();
        ctx.moveTo(w - margin + 2, margin - 2);
        ctx.lineTo(w - margin - 30, margin - 2);
        ctx.lineTo(w - margin + 2, margin + 30);
        ctx.closePath();
        ctx.fill();

        // Inferior esquerdo
        ctx.beginPath();
        ctx.moveTo(margin - 2, h - margin + 2);
        ctx.lineTo(margin + 30, h - margin + 2);
        ctx.lineTo(margin - 2, h - margin - 30);
        ctx.closePath();
        ctx.fill();

        // Inferior direito
        ctx.beginPath();
        ctx.moveTo(w - margin + 2, h - margin + 2);
        ctx.lineTo(w - margin - 30, h - margin + 2);
        ctx.lineTo(w - margin + 2, h - margin - 30);
        ctx.closePath();
        ctx.fill();

        // Telemetria textual Tokyo
        ctx.font = 'bold 9px Orbitron';
        
        // Superior Esquerda: Gravador piscante REC [•]
        const isBlinking = Math.floor(Date.now() / 500) % 2 === 0;
        ctx.fillStyle = frameColor;
        ctx.fillText('REC', margin + 40, margin + 15);
        ctx.fillStyle = isBlinking ? accentColor : 'rgba(255, 0, 85, 0.2)';
        ctx.beginPath();
        ctx.arc(margin + 75, margin + 12, 4, 0, Math.PI * 2);
        ctx.fill();

        // Superior Direita: Canal de Câmera
        ctx.fillStyle = frameColor;
        ctx.textAlign = 'right';
        ctx.fillText('CAM_01 // SYSTEM_NET_LIVE', w - margin - 15, margin + 15);

        // Inferior Esquerda: Distrito e Subtexto
        ctx.textAlign = 'left';
        ctx.fillText('TOKYO // SECTOR 09', margin + 15, h - margin - 15);
        ctx.font = '9px Orbitron';
        ctx.fillStyle = 'rgba(0, 243, 255, 0.6)';
        ctx.fillText('INDEX_VAL: ' + dateStr, margin + 15, h - margin - 3);

        // Inferior Direita: Estampa de tempo real
        ctx.fillStyle = frameColor;
        ctx.textAlign = 'right';
        ctx.fillText('SYS_TIME: ' + timeStr, w - margin - 15, h - margin - 15);
        ctx.font = '9px Orbitron';
        ctx.fillStyle = 'rgba(0, 243, 255, 0.6)';
        ctx.fillText('PROTOTYPE AI PORTRAIT V2.5', w - margin - 15, h - margin - 3);

    } else if (type === 'glitch') {
        const frameColor = '#ff0055'; // Magenta Cyber

        // Linhas externas de enquadramento
        ctx.strokeStyle = frameColor;
        ctx.lineWidth = 3;
        ctx.strokeRect(margin, margin, w - margin * 2, h - margin * 2);

        // Borda de moldura interna tracejada
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([10, 15]);
        ctx.strokeRect(margin + 8, margin + 8, w - (margin + 8) * 2, h - (margin + 8) * 2);
        ctx.setLineDash([]); // Reset do tracejado

        // Elementos de aviso sci-fi nos cantos
        ctx.fillStyle = frameColor;
        ctx.font = '9px Orbitron';

        // Superior Esquerda: Alerta Crítico
        ctx.fillText('WARNING: SYSTEM OVERRIDE ACTIVE', margin + 15, margin + 20);

        // Superior Direita: Código de erro
        ctx.textAlign = 'right';
        ctx.fillText('PROTOCOL_ID // HACK_MODE', w - margin - 15, margin + 20);

        // Inferior Esquerda: Syndicate
        ctx.textAlign = 'left';
        ctx.fillText('SYNDICATE_NET // DECRYPTED_VAL', margin + 15, h - margin - 20);
        
        // Pequena barra de progresso digital desenhada no canto inferior esquerdo
        ctx.strokeStyle = frameColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(margin + 15, h - margin - 14, 100, 6);
        ctx.fillStyle = frameColor;
        // Progresso pulsando e enchendo ligeiramente
        const fillWidth = 85 + Math.sin(Date.now() / 150) * 10;
        ctx.fillRect(margin + 17, h - margin - 12, fillWidth, 2);

        // Inferior Direita: Time
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'right';
        ctx.fillText('SEC_LOG: ' + dateStr + ' ' + timeStr, w - margin - 15, h - margin - 20);
    }

    ctx.restore();
}

// ----------------------------------------------------
// SISTEMA PRINCIPAL DE CONTROLE E CAPTURA DE TELA
// ----------------------------------------------------

// Função que inicia a contagem e tira a foto
function triggerCapture() {
    isCapturing = true;
    captureBtn.disabled = true;
    captureBtn.style.opacity = '0.5';
    captureBtn.textContent = 'PREPARANDO...';

    let count = 3;
    countdownDisplay.textContent = count;
    countdownDisplay.style.display = 'block';
    Sound.playBeep(600, 0.15);

    const timer = setInterval(() => {
        count--;
        if (count > 0) {
            countdownDisplay.textContent = count;
            Sound.playBeep(600, 0.15);
            
            // Efeito visual de pulso no contador
            countdownDisplay.style.transform = 'translate(-50%, -50%) scale(1.3)';
            setTimeout(() => {
                countdownDisplay.style.transform = 'translate(-50%, -50%) scale(1.0)';
            }, 150);
        } else {
            clearInterval(timer);
            countdownDisplay.style.display = 'none';

            // 1. Efeito de Flash na Tela (Branco brilhante instantâneo)
            flashOverlay.style.opacity = '1';
            Sound.playShutter();

            // 2. Captura imediata do frame do Canvas
            setTimeout(() => {
                const link = document.createElement('a');
                link.download = `cyber-booth-selfie-${Date.now()}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();

                // Efeito sonoro de comemoração após salvar a selfie
                setTimeout(() => {
                    Sound.playPowerup();
                    // Partículas neon comemorativas
                    particleManager.createExplosion(canvas.width / 2, canvas.height / 2, '#00f3ff', 35);
                }, 500);

                // 3. Restaurar UI
                isCapturing = false;
                captureBtn.disabled = false;
                captureBtn.style.opacity = '1';
                captureBtn.textContent = '📸 CAPTURAR SELFIE';
            }, 80);

            // Desvanecer o flash progressivamente
            setTimeout(() => {
                flashOverlay.style.opacity = '0';
            }, 150);
        }
    }, 1000);
}

// ----------------------------------------------------
// PROCESSAMENTO DO MEDIAPIPE E LOOP DE RENDERIZAÇÃO
// ----------------------------------------------------

function onResults(results) {
    // 1. Limpar canvas principal
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 2. Pintar feed da Webcam no Canvas
    if (results.image) {
        ctx.save();
        // Espelhamento horizontal para que se pareça com um espelho
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
        ctx.restore();
    }

    // 3. Aplicar Filtros Digitais de Pós-Processamento se aplicável
    if (!faceCalibrating) {
        if (activeImageFilter === 'glitch') {
            applyGlitchRGB();
        } else if (activeImageFilter === 'matrix') {
            applyMatrixDigitalRain();
        } else if (activeImageFilter === 'thermal') {
            applyThermalVision();
        }
    }

    // 4. Se a calibração de IA estiver ativa, exibe interface tecnológica de carga
    if (faceCalibrating) {
        ctx.save();
        ctx.fillStyle = 'rgba(5, 5, 8, 0.65)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Barra de progresso centralizada
        const barWidth = 350;
        const barHeight = 8;
        const bx = (canvas.width - barWidth) / 2;
        const by = canvas.height / 2 + 10;

        ctx.strokeStyle = '#00f3ff';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, barWidth, barHeight);

        ctx.fillStyle = '#00f3ff';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00f3ff';
        ctx.fillRect(bx + 2, by + 2, (barWidth - 4) * (calibrationProgress / 100), barHeight - 4);

        // Textos Sci-Fi de carregamento
        ctx.fillStyle = '#00f3ff';
        ctx.font = 'bold 15px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText('INICIALIZANDO SISTEMAS DE IA...', canvas.width / 2, canvas.height / 2 - 25);
        ctx.font = '10px Orbitron';
        ctx.fillStyle = 'rgba(0, 243, 255, 0.7)';
        ctx.fillText(`CALIBRANDO DETECTOR FACIAL 3D: ${calibrationProgress}%`, canvas.width / 2, canvas.height / 2 - 5);
        
        ctx.restore();
    } else if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        // Calibração concluída e rosto detectado
        landmarksDetected = true;
        faceLandmarks = results.multiFaceLandmarks[0];

        // Extrair coordenadas tridimensionais
        const coords = getFaceCoordinates(faceLandmarks);

        if (coords) {
            // Desenhar Sticker Facial Neon selecionado
            if (activeFaceFilter === 'visor') {
                drawCyberpunkVisor(coords);
            } else if (activeFaceFilter === 'horns') {
                drawEnergyHorns(coords);
            } else if (activeFaceFilter === 'halo') {
                drawCyberHalo(coords);
            }
        }
    } else {
        landmarksDetected = false;
        
        // Mensagem de aviso caso o rosto saia do enquadramento
        ctx.save();
        ctx.fillStyle = 'rgba(255, 0, 85, 0.08)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.strokeStyle = '#ff0055';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);

        ctx.fillStyle = '#ff0055';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ff0055';
        ctx.font = 'bold 16px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText('⚠️ ROSTO NÃO DETECTADO', canvas.width / 2, canvas.height / 2 - 10);
        ctx.font = '11px Orbitron';
        ctx.fillStyle = '#f1f3f5';
        ctx.fillText('POR FAVOR, ALINHE SEU ROSTO EM FRENTE À CÂMERA', canvas.width / 2, canvas.height / 2 + 15);
        ctx.restore();
    }

    // 5. Aplicar Moldura Sci-Fi por cima de tudo
    if (!faceCalibrating) {
        drawSciFiFrame(activeFrame);
    }

    // 6. Atualizar e desenhar partículas virtuais comemorativas
    particleManager.update();
    particleManager.draw(ctx);
}

// Configurações do MediaPipe FaceMesh
const faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
});

faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.55,
    minTrackingConfidence: 0.55
});

faceMesh.onResults(onResults);

// Setup da câmera externa do MediaPipe
const camera = new Camera(videoElement, {
    onFrame: async () => {
        await faceMesh.send({ image: videoElement });
    },
    width: 640,
    height: 480
});

// Inicialização da câmera
camera.start().then(() => {
    console.log('MediaPipe Camera Started Successfully.');
}).catch(err => {
    console.error('Failed to start camera:', err);
    alert('Erro ao inicializar a câmera. Verifique as permissões de acesso!');
});
