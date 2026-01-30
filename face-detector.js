// Face Expression Detector Logic - Improved Algorithm
const canvas = document.getElementById('faceCanvas');
const ctx = canvas.getContext('2d');
const videoElement = document.querySelector('.input_video');
const canvasElement = document.querySelector('.output_canvas');
const canvasCtx = canvasElement.getContext('2d');

// Expression history
const expressionHistory = [];
const MAX_HISTORY = 5;

// Expression mapping - sem emojis infantis
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

// Improved expression analysis with better thresholds
function analyzeExpression(landmarks) {
    if (!landmarks || landmarks.length < 468) return { expression: 'neutral', confidence: 50 };

    // Key landmarks for expression detection
    const leftEyeTop = landmarks[159];
    const leftEyeBottom = landmarks[145];
    const rightEyeTop = landmarks[386];
    const rightEyeBottom = landmarks[374];

    const mouthLeft = landmarks[61];
    const mouthRight = landmarks[291];
    const mouthTop = landmarks[13];
    const mouthBottom = landmarks[14];
    const upperLipTop = landmarks[0];
    const lowerLipBottom = landmarks[17];

    const leftEyebrowInner = landmarks[70];
    const leftEyebrowOuter = landmarks[46];
    const rightEyebrowInner = landmarks[300];
    const rightEyebrowOuter = landmarks[276];

    const leftCheek = landmarks[205];
    const rightCheek = landmarks[425];

    // Calculate improved metrics
    const eyeOpenness = (
        Math.abs(leftEyeTop.y - leftEyeBottom.y) +
        Math.abs(rightEyeTop.y - rightEyeBottom.y)
    ) / 2;

    const mouthHeight = Math.abs(mouthTop.y - mouthBottom.y);
    const mouthWidth = Math.abs(mouthRight.x - mouthLeft.x);

    // Melhor detecção de sorriso - usando os cantos da boca e bochechas
    const leftMouthCorner = landmarks[61];
    const rightMouthCorner = landmarks[291];
    const mouthCenter = landmarks[13];

    // Smile detection: cantos da boca sobem em relação ao centro
    const smileMetric = (
        (mouthCenter.y - leftMouthCorner.y) +
        (mouthCenter.y - rightMouthCorner.y)
    ) / 2;

    // Eyebrow position
    const leftEyebrowHeight = (leftEyebrowInner.y + leftEyebrowOuter.y) / 2;
    const rightEyebrowHeight = (rightEyebrowInner.y + rightEyebrowOuter.y) / 2;
    const avgEyebrowHeight = (leftEyebrowHeight + rightEyebrowHeight) / 2;

    // Eye to eyebrow distance (for surprised detection)
    const leftEyeCenter = (leftEyeTop.y + leftEyeBottom.y) / 2;
    const rightEyeCenter = (rightEyeTop.y + rightEyeBottom.y) / 2;
    const eyeToBrowDist = (
        (leftEyeCenter - leftEyebrowHeight) +
        (rightEyeCenter - rightEyebrowHeight)
    ) / 2;

    // Expression detection with improved thresholds
    let expression = 'neutral';
    let confidence = 0;

    // HAPPY: sorriso detectado (cantos da boca sobem)
    if (smileMetric > 0.008 && mouthWidth > 0.13) {
        expression = 'happy';
        confidence = Math.min(100, smileMetric * 5000 + (mouthWidth - 0.13) * 300);
    }
    // SURPRISED: olhos bem abertos E boca aberta E sobrancelhas levantadas
    else if (eyeOpenness > 0.022 && mouthHeight > 0.035 && eyeToBrowDist > 0.055) {
        expression = 'surprised';
        confidence = Math.min(100, (eyeOpenness * 1500) + (mouthHeight * 800) + (eyeToBrowDist * 300));
    }
    // SAD: cantos da boca para baixo
    else if (smileMetric < -0.005 && mouthWidth < 0.15) {
        expression = 'sad';
        confidence = Math.min(100, Math.abs(smileMetric) * 5000);
    }
    // ANGRY: sobrancelhas baixas E boca pequena/tensa
    else if (avgEyebrowHeight > 0.42 && eyeToBrowDist < 0.045 && mouthHeight < 0.03) {
        expression = 'angry';
        confidence = Math.min(100, (avgEyebrowHeight - 0.42) * 2000 + (0.045 - eyeToBrowDist) * 1000);
    }
    else {
        expression = 'neutral';
        confidence = 60;
    }

    // Add to buffer for smoothing
    expressionConfidenceBuffer.push({ expression, confidence });
    if (expressionConfidenceBuffer.length > BUFFER_SIZE) {
        expressionConfidenceBuffer.shift();
    }

    // Use most common expression in buffer
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

    // Average confidence for the most common expression
    const avgConfidence = expressionConfidenceBuffer
        .filter(item => item.expression === mostCommon)
        .reduce((sum, item) => sum + item.confidence, 0) / maxCount;

    return { expression: mostCommon, confidence: avgConfidence };
}

function updateExpressionDisplay(expression, confidence) {
    const data = expressions[expression];
    document.getElementById('emoji').textContent = data.icon;
    document.getElementById('label').textContent = data.label;
    document.getElementById('label').style.color = data.color;
    document.getElementById('confidence').textContent = `${Math.round(confidence)}% confiança`;
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
        return `<div style="margin: 0.3rem 0; color: ${data.color};">${data.icon} ${data.label} - ${item.timestamp}</div>`;
    }).join('');
}

// MediaPipe Face Mesh Setup
function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    // Draw on main canvas
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(-1, 1);
    ctx.drawImage(results.image, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];

        // Draw face mesh on preview com cores mais neutras
        drawConnectors(canvasCtx, landmarks, FACEMESH_TESSELATION, { color: 'rgba(138, 162, 158, 0.3)', lineWidth: 0.5 });
        drawConnectors(canvasCtx, landmarks, FACEMESH_RIGHT_EYE, { color: '#00d9ff', lineWidth: 1 });
        drawConnectors(canvasCtx, landmarks, FACEMESH_LEFT_EYE, { color: '#00d9ff', lineWidth: 1 });
        drawConnectors(canvasCtx, landmarks, FACEMESH_LIPS, { color: '#8aa29e', lineWidth: 1 });

        // Analyze expression
        const result = analyzeExpression(landmarks);

        // Only update if expression changed
        if (result.expression !== currentExpression && result.confidence > 40) {
            currentExpression = result.expression;
            addToHistory(currentExpression);
        }

        updateExpressionDisplay(result.expression, result.confidence);

        // Draw face mesh on main canvas (mirrored) com cores mais neutras
        ctx.save();
        const mirroredLandmarks = landmarks.map(lm => ({
            x: 1 - lm.x,
            y: lm.y,
            z: lm.z
        }));

        const currentColor = expressions[result.expression].color;

        drawConnectors(ctx, mirroredLandmarks, FACEMESH_TESSELATION, { color: 'rgba(138, 162, 158, 0.2)', lineWidth: 1 });
        drawConnectors(ctx, mirroredLandmarks, FACEMESH_RIGHT_EYE, { color: currentColor, lineWidth: 2 });
        drawConnectors(ctx, mirroredLandmarks, FACEMESH_LEFT_EYE, { color: currentColor, lineWidth: 2 });
        drawConnectors(ctx, mirroredLandmarks, FACEMESH_LIPS, { color: currentColor, lineWidth: 2 });
        ctx.restore();
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

// Start
document.getElementById('startBtn').addEventListener('click', async () => {
    document.getElementById('controls').style.display = 'none';
    createBackButton();
    await camera.start();
});
