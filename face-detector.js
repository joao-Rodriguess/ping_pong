// Face Expression Detector Logic - Upgraded & Fully Polished
const canvas = document.getElementById('faceCanvas');
const ctx = canvas.getContext('2d');
const videoElement = document.querySelector('.input_video');
const canvasElement = document.querySelector('.output_canvas');
const canvasCtx = canvasElement.getContext('2d');

// Expression history
const expressionHistory = [];
const MAX_HISTORY = 5;

// Tear particles for Sad filter
const tearParticles = [];

// Spark/Shock lines for Surprised filter
const electricLines = [];

// Expression mapping
const expressions = {
    happy: { label: 'FELIZ', color: '#00d9ff', icon: '◉' },
    sad: { label: 'TRISTE', color: '#6b7aff', icon: '◎' },
    surprised: { label: 'SURPRESO', color: '#ffaa00', icon: '◈' },
    angry: { label: 'BRAVO', color: '#ff6b6b', icon: '◆' },
    neutral: { label: 'NEUTRO', color: '#8aa29e', icon: '○' }
};

let currentExpression = 'neutral';
let expressionConfidenceBuffer = [];
const BUFFER_SIZE = 5;

class TearParticle {
    constructor(x, y) {
        this.x = x + (Math.random() - 0.5) * 6;
        this.y = y;
        this.vy = Math.random() * 2 + 2.5;
        this.vx = (Math.random() - 0.5) * 1;
        this.alpha = 1;
        this.size = Math.random() * 3 + 2;
    }

    update() {
        this.y += this.vy;
        this.x += this.vx;
        this.alpha -= 0.03;
    }

    draw(context) {
        if (this.alpha <= 0) return;
        context.save();
        context.globalAlpha = Math.max(0, this.alpha);
        context.fillStyle = '#6b7aff';
        context.shadowBlur = 10;
        context.shadowColor = '#6b7aff';
        context.beginPath();
        context.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        context.fill();
        context.restore();
    }
}

// Função de Cálculo de Distância Euclidiana 3D
function getDistance3D(p1, p2) {
    return Math.sqrt(
        Math.pow(p2.x - p1.x, 2) +
        Math.pow(p2.y - p1.y, 2) +
        Math.pow(p2.z - p1.z, 2)
    );
}

// Improved expression analysis with robust 3D landmarks metrics (CK+/JAFFE)
function analyzeExpression(landmarks) {
    if (!landmarks || landmarks.length < 468) {
        return { 
            expression: 'neutral', 
            confidence: 50, 
            confidences: { happy: 0, sad: 0, surprised: 0, angry: 0, neutral: 100 },
            metrics: null 
        };
    }

    // Key landmarks
    const leftEyeTop = landmarks[159];
    const leftEyeBottom = landmarks[145];
    const rightEyeTop = landmarks[386];
    const rightEyeBottom = landmarks[374];

    const mouthLeft = landmarks[61];
    const mouthRight = landmarks[291];
    const mouthTop = landmarks[13];
    const mouthBottom = landmarks[14];

    const leftEyebrowInner = landmarks[70];
    const rightEyebrowInner = landmarks[300];

    // Reference distance (Normalizer) - Cantos externos dos olhos
    const faceReference = getDistance3D(landmarks[33], landmarks[263]);

    // Calculate metrics in 3D normal space
    const eyeOpenness = (
        getDistance3D(leftEyeTop, leftEyeBottom) +
        getDistance3D(rightEyeTop, rightEyeBottom)
    ) / (2 * faceReference);

    const mouthHeight = getDistance3D(mouthTop, mouthBottom) / faceReference;
    const mouthWidth = getDistance3D(mouthLeft, mouthRight) / faceReference;

    // Smile metric based on vertical position of lip corners relative to lip center, normalized
    // Em y da tela, subir o canto diminui o valor de y, então (center.y - corner.y) é positivo para sorriso
    const smileLeft = mouthTop.y - mouthLeft.y;
    const smileRight = mouthTop.y - mouthRight.y;
    const smileMetric = ((smileLeft + smileRight) / 2) / faceReference;

    // Eye to eyebrow distance (brow center to eye center)
    const leftEyeCenter = {
        x: (leftEyeTop.x + leftEyeBottom.x) / 2,
        y: (leftEyeTop.y + leftEyeBottom.y) / 2,
        z: (leftEyeTop.z + leftEyeBottom.z) / 2
    };
    const rightEyeCenter = {
        x: (rightEyeTop.x + rightEyeBottom.x) / 2,
        y: (rightEyeTop.y + rightEyeBottom.y) / 2,
        z: (rightEyeTop.z + rightEyeBottom.z) / 2
    };

    const eyeToBrowDist = (
        getDistance3D(leftEyebrowInner, leftEyeCenter) +
        getDistance3D(rightEyebrowInner, rightEyeCenter)
    ) / (2 * faceReference);

    // Calculando Confianças das Emoções Baseadas em Limiares do CK+
    // 1. Feliz: Mapeamento linear a partir do sorriso ativado (threshold: > 0.012, pico > 0.057)
    let happyConf = Math.max(0, Math.min(100, Math.round((smileMetric - 0.012) * 2200)));
    
    // 2. Triste: Mapeamento linear a partir do sorriso de canto caído (threshold: < -0.008, pico < -0.048)
    let sadConf = Math.max(0, Math.min(100, Math.round((-0.008 - smileMetric) * 2500)));
    
    // 3. Surpreso: Olhos arregalados (> 0.046) e boca bem aberta verticalmente (> 0.04)
    let eyeOpenBonus = Math.max(0, (eyeOpenness - 0.046) * 4000);
    let mouthOpenBonus = Math.max(0, (mouthHeight - 0.04) * 1200);
    let surprisedConf = Math.max(0, Math.min(100, Math.round(eyeOpenBonus * 0.45 + mouthOpenBonus * 0.55)));
    
    // 4. Bravo: Distância sobrancelha-olho encolhendo devido ao franzido (repouso ~0.125, raiva < 0.118)
    let angryConf = Math.max(0, Math.min(100, Math.round((0.118 - eyeToBrowDist) * 3500)));

    // Modificadores de exclusão mútua natural
    if (happyConf > 15) { sadConf = 0; angryConf = 0; }
    if (angryConf > 15) { happyConf = 0; surprisedConf = 0; }
    if (surprisedConf > 20) { sadConf = 0; }

    const sum = happyConf + surprisedConf + sadConf + angryConf;
    let neutralConf = Math.max(0, Math.min(100, 100 - sum));

    // Determinar a expressão principal
    let expression = 'neutral';
    let confidence = neutralConf;

    const confArray = [
        { name: 'happy', val: happyConf },
        { name: 'surprised', val: surprisedConf },
        { name: 'sad', val: sadConf },
        { name: 'angry', val: angryConf },
        { name: 'neutral', val: neutralConf }
    ];

    confArray.sort((a, b) => b.val - a.val);
    expression = confArray[0].name;
    confidence = confArray[0].val;

    // Buffer de suavização
    expressionConfidenceBuffer.push({ expression, confidence, confVal: confArray, metrics: { eyeOpenness, mouthHeight, mouthWidth, smileMetric, eyeToBrowDist } });
    if (expressionConfidenceBuffer.length > BUFFER_SIZE) {
        expressionConfidenceBuffer.shift();
    }

    // Achar mais comum no buffer
    const expressionCounts = {};
    expressionConfidenceBuffer.forEach(item => {
        expressionCounts[item.expression] = (expressionCounts[item.expression] || 0) + 1;
    });

    let mostCommon = expression;
    let maxCount = 0;
    Object.keys(expressionCounts).forEach(exp => {
        if (expressionCounts[exp] > maxCount) {
            maxCount = expressionCounts[exp];
            mostCommon = exp;
        }
    });

    // Média de todas as confianças do buffer para suavidade visual nas barras
    const smoothConfidences = { happy: 0, sad: 0, surprised: 0, angry: 0, neutral: 0 };
    const smoothMetrics = { eyeOpenness: 0, mouthHeight: 0, mouthWidth: 0, smileMetric: 0, eyeToBrowDist: 0 };
    
    expressionConfidenceBuffer.forEach(item => {
        item.confVal.forEach(c => {
            smoothConfidences[c.name] += c.val / expressionConfidenceBuffer.length;
        });
        smoothMetrics.eyeOpenness += item.metrics.eyeOpenness / expressionConfidenceBuffer.length;
        smoothMetrics.mouthHeight += item.metrics.mouthHeight / expressionConfidenceBuffer.length;
        smoothMetrics.mouthWidth += item.metrics.mouthWidth / expressionConfidenceBuffer.length;
        smoothMetrics.smileMetric += item.metrics.smileMetric / expressionConfidenceBuffer.length;
        smoothMetrics.eyeToBrowDist += item.metrics.eyeToBrowDist / expressionConfidenceBuffer.length;
    });

    return { 
        expression: mostCommon, 
        confidence: smoothConfidences[mostCommon], 
        confidences: smoothConfidences,
        metrics: smoothMetrics
    };
}

function updateExpressionDisplay(expression, confidence, confAll, metrics) {
    const data = expressions[expression];
    document.getElementById('emoji').textContent = data.icon;
    document.getElementById('label').textContent = data.label;
    document.getElementById('label').style.color = data.color;
    document.getElementById('confidence').textContent = `${Math.round(confidence)}% confiança`;

    // Atualizar barras de progresso neon da telemetria
    updateTelemetryBar('Happy', confAll.happy);
    updateTelemetryBar('Sad', confAll.sad);
    updateTelemetryBar('Surprised', confAll.surprised);
    updateTelemetryBar('Angry', confAll.angry);
    updateTelemetryBar('Neutral', confAll.neutral);

    // Atualizar valores do Laboratório Científico em tempo real
    if (metrics) {
        updateScientificMetric('eyeOpen', metrics.eyeOpenness, 0.046, 'Olhos Arregalados (> 0.065)');
        updateScientificMetric('smile', metrics.smileMetric, 0.012, 'Sorriso Ativo (> 0.040)');
        updateScientificMetric('mouthHeight', metrics.mouthHeight, 0.040, 'Boca Aberta (> 0.090)');
        updateScientificMetric('eyeToBrow', metrics.eyeToBrowDist, 0.118, 'Franzido de Raiva (< 0.100)');
    }
}

function updateScientificMetric(id, value, threshold, labelText) {
    const valueEl = document.getElementById(`sciVal_${id}`);
    const barEl = document.getElementById(`sciBar_${id}`);
    if (valueEl && barEl) {
        valueEl.textContent = value.toFixed(4);
        
        // Mapear o valor físico para um percentual visual da barra
        let visualPercent = 0;
        if (id === 'smile') {
            visualPercent = ((value + 0.04) / 0.10) * 100;
        } else if (id === 'eyeOpen') {
            visualPercent = (value / 0.090) * 100;
        } else if (id === 'mouthHeight') {
            visualPercent = (value / 0.15) * 100;
        } else if (id === 'eyeToBrow') {
            visualPercent = ((0.160 - value) / 0.08) * 100; // Invertido, menor distância = mais percentual
        }
        
        barEl.style.width = `${Math.max(2, Math.min(100, visualPercent))}%`;
        
        // Cor do brilho se cruzar o limiar de ativação
        let isActivated = false;
        if (id === 'smile' && (value > 0.035 || value < -0.025)) isActivated = true;
        if (id === 'eyeOpen' && value > 0.060) isActivated = true;
        if (id === 'mouthHeight' && value > 0.075) isActivated = true;
        if (id === 'eyeToBrow' && value < 0.110) isActivated = true;

        if (isActivated) {
            barEl.style.background = '#00d9ff';
            barEl.style.boxShadow = '0 0 10px #00d9ff, 0 0 20px rgba(0, 217, 255, 0.5)';
        } else {
            barEl.style.background = 'rgba(232, 234, 237, 0.35)';
            barEl.style.boxShadow = 'none';
        }
    }
}

function updateTelemetryBar(name, val) {
    const bar = document.getElementById(`bar${name}`);
    const label = document.getElementById(`barVal${name}`);
    if (bar && label) {
        const rounded = Math.round(val);
        bar.style.width = `${rounded}%`;
        label.textContent = `${rounded}%`;
    }
}

function addToHistory(expression) {
    const timestamp = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    expressionHistory.unshift({ expression, timestamp });

    if (expressionHistory.length > MAX_HISTORY) {
        expressionHistory.pop();
    }

    const historyDiv = document.getElementById('history');
    historyDiv.innerHTML = expressionHistory.map(item => {
        const data = expressions[item.expression];
        return `<div style="margin: 0.3rem 0; color: ${data.color}; font-weight: 600;">${data.icon} ${data.label} - ${item.timestamp}</div>`;
    }).join('');
}

// AR Filters drawing
function drawARFilters(landmarks, expression) {
    if (!landmarks || landmarks.length < 468) return;

    // Referências dos olhos e rosto
    const leftEyeOuter = landmarks[33];   // Canto externo do olho esquerdo
    const rightEyeOuter = landmarks[263]; // Canto externo do olho direito
    const foreheadCenter = landmarks[10]; // Centro superior da testa
    const leftEyebrowCorner = landmarks[109]; // Acima da sobrancelha esquerda
    const rightEyebrowCorner = landmarks[338];// Acima da sobrancelha direita

    // Canvas coordenadas
    const lex = (1 - leftEyeOuter.x) * canvas.width;
    const ley = leftEyeOuter.y * canvas.height;
    const rex = (1 - rightEyeOuter.x) * canvas.width;
    const rey = rightEyeOuter.y * canvas.height;

    // Distância dos olhos e ponto médio
    const eyeDist = Math.sqrt(Math.pow(rex - lex, 2) + Math.pow(rey - ley, 2));
    const midX = (lex + rex) / 2;
    const midY = (ley + rey) / 2;
    const angle = Math.atan2(rey - ley, rex - lex);

    if (expression === 'happy') {
        // Óculos escuros neon AR
        ctx.save();
        ctx.translate(midX, midY);
        ctx.rotate(angle);

        ctx.fillStyle = 'rgba(10, 10, 15, 0.9)';
        ctx.strokeStyle = '#00d9ff';
        ctx.lineWidth = 3.5;
        ctx.shadowBlur = 18;
        ctx.shadowColor = '#00d9ff';

        const w = eyeDist * 0.58;
        const h = eyeDist * 0.32;
        const offset = eyeDist * 0.28;

        // Lente esquerda
        ctx.beginPath();
        ctx.rect(-offset - w / 2, -h / 2, w, h);
        ctx.fill();
        ctx.stroke();

        // Lente direita
        ctx.beginPath();
        ctx.rect(offset - w / 2, -h / 2, w, h);
        ctx.fill();
        ctx.stroke();

        // Haste central
        ctx.beginPath();
        ctx.moveTo(-offset + w / 2, -h / 6);
        ctx.lineTo(offset - w / 2, -h / 6);
        ctx.stroke();

        // Linhas de design cibernético nos óculos
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-offset - w/2.5, -h/3);
        ctx.lineTo(-offset + w/2.5, -h/3);
        ctx.moveTo(offset - w/2.5, -h/3);
        ctx.lineTo(offset + w/2.5, -h/3);
        ctx.stroke();

        ctx.restore();
    }
    else if (expression === 'sad') {
        // Lágrimas neon descendo dos olhos
        const eyeL = landmarks[159]; // Centro do olho esquerdo
        const eyeR = landmarks[386]; // Centro do olho direito
        const elx = (1 - eyeL.x) * canvas.width;
        const ely = eyeL.y * canvas.height;
        const erx = (1 - eyeR.x) * canvas.width;
        const ery = eyeR.y * canvas.height;

        // Gerar novas partículas de lágrima
        if (Math.random() < 0.25) {
            tearParticles.push(new TearParticle(elx, ely + 10));
            tearParticles.push(new TearParticle(erx, ery + 10));
        }
    }
    else if (expression === 'angry') {
        // Chifres de fogo vermelho neon
        const headTopX = (1 - foreheadCenter.x) * canvas.width;
        const headTopY = foreheadCenter.y * canvas.height;
        const browLX = (1 - leftEyebrowCorner.x) * canvas.width;
        const browLY = leftEyebrowCorner.y * canvas.height;
        const browRX = (1 - rightEyebrowCorner.x) * canvas.width;
        const browRY = rightEyebrowCorner.y * canvas.height;

        ctx.save();
        ctx.strokeStyle = '#ff0055';
        ctx.fillStyle = '#ff3300';
        ctx.lineWidth = 4;
        ctx.shadowBlur = 25;
        ctx.shadowColor = '#ff0055';

        // Chifre Esquerdo
        ctx.beginPath();
        ctx.moveTo(browLX, browLY - 10);
        ctx.bezierCurveTo(browLX - eyeDist * 0.4, browLY - eyeDist * 0.6, browLX - eyeDist * 0.2, browLY - eyeDist * 1.1, headTopX - eyeDist * 0.4, headTopY - eyeDist * 0.8);
        ctx.bezierCurveTo(browLX - eyeDist * 0.1, browLY - eyeDist * 0.6, browLX + 5, browLY - eyeDist * 0.3, browLX, browLY - 10);
        ctx.fill();
        ctx.stroke();

        // Chifre Direito
        ctx.beginPath();
        ctx.moveTo(browRX, browRY - 10);
        ctx.bezierCurveTo(browRX + eyeDist * 0.4, browRY - eyeDist * 0.6, browRX + eyeDist * 0.2, browRY - eyeDist * 1.1, headTopX + eyeDist * 0.4, headTopY - eyeDist * 0.8);
        ctx.bezierCurveTo(browRX + eyeDist * 0.1, browRY - eyeDist * 0.6, browRX - 5, browRY - eyeDist * 0.3, browRX, browRY - 10);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }
    else if (expression === 'surprised') {
        // Raios elétricos piscando nos olhos
        const eyeL = landmarks[159];
        const eyeR = landmarks[386];
        const elx = (1 - eyeL.x) * canvas.width;
        const ely = eyeL.y * canvas.height;
        const erx = (1 - eyeR.x) * canvas.width;
        const ery = eyeR.y * canvas.height;

        ctx.save();
        ctx.strokeStyle = '#ffaa00';
        ctx.lineWidth = 2.5;
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ffaa00';

        // Desenhar mini-raios piscando ao redor do olho esquerdo
        drawShock(elx, ely, eyeDist * 0.35);
        // Desenhar mini-raios piscando ao redor do olho direito
        drawShock(erx, ery, eyeDist * 0.35);

        ctx.restore();
    }
}

function drawShock(cx, cy, r) {
    const segments = 4;
    for (let k = 0; k < 2; k++) {
        let x = cx;
        let y = cy;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let i = 0; i < segments; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = (r / segments) * (i + 1);
            x = cx + Math.cos(angle) * dist;
            y = cy + Math.sin(angle) * dist + (Math.random() - 0.5) * 10;
            ctx.lineTo(x, y);
        }
        ctx.stroke();
    }
}

// MediaPipe Face Mesh Setup
function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    // Desenhar feed no canvas principal
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(-1, 1);
    ctx.drawImage(results.image, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];

        // Conectores na câmera preview
        drawConnectors(canvasCtx, landmarks, FACEMESH_TESSELATION, { color: 'rgba(0, 217, 255, 0.25)', lineWidth: 0.5 });
        drawConnectors(canvasCtx, landmarks, FACEMESH_RIGHT_EYE, { color: '#00d9ff', lineWidth: 1 });
        drawConnectors(canvasCtx, landmarks, FACEMESH_LEFT_EYE, { color: '#00d9ff', lineWidth: 1 });

        // Analisar expressão facial
        const result = analyzeExpression(landmarks);

        // Troca de expressão sonora
        if (result.expression !== currentExpression && result.confidence > 35) {
            currentExpression = result.expression;
            addToHistory(currentExpression);
            Sound.playBeep(700, 0.08); // Bipe ao mudar emoção
        }

        updateExpressionDisplay(result.expression, result.confidence, result.confidences, result.metrics);

        // Desenhar a malha de conectores neon no canvas principal (espelhado)
        ctx.save();
        const mirroredLandmarks = landmarks.map(lm => ({
            x: 1 - lm.x,
            y: lm.y,
            z: lm.z
        }));

        const currentColor = expressions[result.expression].color;

        // Desenhar malha facial neon elegante
        drawConnectors(ctx, mirroredLandmarks, FACEMESH_TESSELATION, { color: 'rgba(138, 162, 158, 0.15)', lineWidth: 0.5 });
        drawConnectors(ctx, mirroredLandmarks, FACEMESH_RIGHT_EYE, { color: currentColor, lineWidth: 1.5 });
        drawConnectors(ctx, mirroredLandmarks, FACEMESH_LEFT_EYE, { color: currentColor, lineWidth: 1.5 });
        drawConnectors(ctx, mirroredLandmarks, FACEMESH_LIPS, { color: currentColor, lineWidth: 1.5 });

        // Desenhar Filtros AR na face!
        drawARFilters(landmarks, result.expression);

        ctx.restore();
    }

    // Desenhar e atualizar lágrimas fora da malha
    if (tearParticles.length > 0) {
        for (let i = tearParticles.length - 1; i >= 0; i--) {
            const tear = tearParticles[i];
            tear.update();
            tear.draw(ctx);
            if (tear.alpha <= 0) {
                tearParticles.splice(i, 1);
            }
        }
    }

    canvasCtx.restore();
}

const faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
});

faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

faceMesh.onResults(onResults);

const camera = new Camera(videoElement, {
    onFrame: async () => {
        await faceMesh.send({ image: videoElement });
    },
    width: 640,
    height: 480
});

// Start trigger
document.getElementById('startBtn').addEventListener('click', async () => {
    document.getElementById('controls').style.display = 'none';
    createBackButton();
    Sound.playPowerup();
    await camera.start();
});
