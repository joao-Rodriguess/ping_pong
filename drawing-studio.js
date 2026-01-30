// Drawing Studio Logic
const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
const videoElement = document.querySelector('.input_video');
const canvasElement = document.querySelector('.output_canvas');
const canvasCtx = canvasElement.getContext('2d');

// Drawing State
let isDrawing = false;
let currentColor = '#ff0055';
let brushSize = 5;
let lastPoint = null;

// Set up canvas
ctx.fillStyle = 'rgba(10, 10, 18, 0.95)';
ctx.fillRect(0, 0, canvas.width, canvas.height);

// Color palette
const colorButtons = document.querySelectorAll('.color-btn');
colorButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        colorButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentColor = btn.dataset.color;
    });
});

// Clear button
document.getElementById('clearBtn').addEventListener('click', () => {
    ctx.fillStyle = 'rgba(10, 10, 18, 0.95)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
});

// Photo button
document.getElementById('photoBtn').addEventListener('click', () => {
    // Create a temporary canvas to combine video and drawing
    const photoCanvas = document.createElement('canvas');
    photoCanvas.width = canvas.width;
    photoCanvas.height = canvas.height;
    const photoCtx = photoCanvas.getContext('2d');

    // Draw mirrored video frame
    photoCtx.save();
    photoCtx.scale(-1, 1);
    photoCtx.drawImage(videoElement, -canvas.width, 0, canvas.width, canvas.height);
    photoCtx.restore();

    // Draw the drawing on top
    photoCtx.drawImage(canvas, 0, 0);

    // Convert to image and download
    photoCanvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `drawing-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);

        // Visual feedback
        flashScreen();
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
        opacity: 0.8;
        pointer-events: none;
        z-index: 9999;
        animation: fadeOut 0.3s;
    `;
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 300);
}

// MediaPipe Hands Setup
function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];

        // Draw hand
        drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: '#00ff88', lineWidth: 2 });
        drawLandmarks(canvasCtx, landmarks, { color: '#b537ff', lineWidth: 1 });

        // Get index finger tip (landmark 8)
        const indexTip = landmarks[8];
        const drawPoint = {
            x: (1 - indexTip.x) * canvas.width, // Mirror
            y: indexTip.y * canvas.height
        };

        // Check if pinching (drawing mode)
        const isPinching = isPinchGesture(landmarks);

        if (isPinching) {
            if (!isDrawing) {
                isDrawing = true;
                lastPoint = drawPoint;
            } else {
                // Draw line from last point to current point
                ctx.strokeStyle = currentColor;
                ctx.lineWidth = brushSize;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.shadowBlur = 10;
                ctx.shadowColor = currentColor;

                ctx.beginPath();
                ctx.moveTo(lastPoint.x, lastPoint.y);
                ctx.lineTo(drawPoint.x, drawPoint.y);
                ctx.stroke();

                lastPoint = drawPoint;
            }

            // Visual cursor
            ctx.save();
            ctx.strokeStyle = currentColor;
            ctx.lineWidth = 2;
            ctx.shadowBlur = 15;
            ctx.shadowColor = currentColor;
            ctx.beginPath();
            ctx.arc(drawPoint.x, drawPoint.y, brushSize + 5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        } else {
            isDrawing = false;
            lastPoint = null;

            // Show cursor
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(drawPoint.x, drawPoint.y, 10, 0, Math.PI * 2);
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

// Start
document.getElementById('startBtn').addEventListener('click', async () => {
    document.getElementById('controls').style.display = 'none';
    createBackButton();
    await camera.start();
});

// Add flash animation
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeOut {
        from { opacity: 0.8; }
        to { opacity: 0; }
    }
`;
document.head.appendChild(style);
