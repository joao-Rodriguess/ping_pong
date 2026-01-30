const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const canvasCtx = canvasElement.getContext('2d');

const gameCanvas = document.getElementById('gameCanvas');
const ctx = gameCanvas.getContext('2d');

// Game Constants
const PADDLE_WIDTH = 10;
const PADDLE_HEIGHT = 100;
const BALL_SIZE = 10;
const WINNING_SCORE = 10;

// Game State
let gameRunning = false;
let playerScore = 0;
let aiScore = 0;

// Resize canvas to fit wrapper
function resizeCanvas() {
    gameCanvas.width = 800;
    gameCanvas.height = 600;
}
resizeCanvas();

// Game Objects
const player = {
    x: 0,
    y: gameCanvas.height / 2 - PADDLE_HEIGHT / 2,
    width: PADDLE_WIDTH,
    height: PADDLE_HEIGHT,
    color: '#00f3ff',
    dy: 0
};

const ai = {
    x: gameCanvas.width - PADDLE_WIDTH,
    y: gameCanvas.height / 2 - PADDLE_HEIGHT / 2,
    width: PADDLE_WIDTH,
    height: PADDLE_HEIGHT,
    color: '#ff0055',
    dy: 0,
    speed: 4 // AI difficulty
};

const ball = {
    x: gameCanvas.width / 2,
    y: gameCanvas.height / 2,
    width: BALL_SIZE,
    height: BALL_SIZE,
    speed: 5,
    dx: 5,
    dy: 5,
    color: '#ffffff'
};

// Hand Tracking Setup
function onResults(results) {
    // Draw the hand on the debug canvas
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    
    if (results.multiHandLandmarks) {
        for (const landmarks of results.multiHandLandmarks) {
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {color: '#00f3ff', lineWidth: 5});
            drawLandmarks(canvasCtx, landmarks, {color: '#ff0055', lineWidth: 2});

            // Control Player Paddle
            // Use Index Finger Tip (Landmark 8) for control
            // Coordinates are normalized [0, 1], so multiply by canvas height
            const indexFingerTip = landmarks[8];
            if (indexFingerTip) {
                // Map y from [0, 1] to [0, gameCanvas.height]
                // Note: Camera is mirrored usually, but Y is same.
                const targetY = indexFingerTip.y * gameCanvas.height;
                
                // Smooth movement or direct mapping? Direct mapping is more responsive for this.
                // Center paddle on finger
                player.y = targetY - player.height / 2;

                // Clamp to screen
                if (player.y < 0) player.y = 0;
                if (player.y + player.height > gameCanvas.height) player.y = gameCanvas.height - player.height;
            }
        }
    }
    canvasCtx.restore();
}

const hands = new Hands({locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
}});

hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

hands.onResults(onResults);

const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({image: videoElement});
    },
    width: 320,
    height: 240
});

// Game Logic
function update() {
    if (!gameRunning) return;

    // Move Ball
    ball.x += ball.dx;
    ball.y += ball.dy;

    // Wall Collision (Top/Bottom)
    if (ball.y < 0 || ball.y + ball.height > gameCanvas.height) {
        ball.dy *= -1;
    }

    // Paddle Collision
    // Player
    if (
        ball.x < player.x + player.width &&
        ball.x + ball.width > player.x &&
        ball.y < player.y + player.height &&
        ball.y + ball.height > player.y
    ) {
        ball.dx *= -1;
        // Add some speed up
        ball.speed += 0.2;
        // Adjust angle based on where it hit the paddle
        const hitPoint = ball.y - (player.y + player.height / 2);
        ball.dy = hitPoint * 0.3; 
    }

    // AI
    if (
        ball.x < ai.x + ai.width &&
        ball.x + ball.width > ai.x &&
        ball.y < ai.y + ai.height &&
        ball.y + ball.height > ai.y
    ) {
        ball.dx *= -1;
         const hitPoint = ball.y - (ai.y + ai.height / 2);
        ball.dy = hitPoint * 0.3;
    }

    // AI Movement
    // Simple AI: Follow the ball
    if (ai.y + ai.height / 2 < ball.y) {
        ai.y += ai.speed;
    } else {
        ai.y -= ai.speed;
    }
    // Clamp AI
    if (ai.y < 0) ai.y = 0;
    if (ai.y + ai.height > gameCanvas.height) ai.y = gameCanvas.height - ai.height;

    // Scoring
    if (ball.x < 0) {
        aiScore++;
        resetBall();
    } else if (ball.x > gameCanvas.width) {
        playerScore++;
        resetBall();
    }

    updateScoreBoard();
}

function resetBall() {
    ball.x = gameCanvas.width / 2;
    ball.y = gameCanvas.height / 2;
    ball.speed = 5;
    ball.dx = -ball.dx; // Serve to winner or loser? Alternate.
    ball.dy = 5 * (Math.random() > 0.5 ? 1 : -1);
}

function updateScoreBoard() {
    document.getElementById('playerScore').innerText = playerScore;
    document.getElementById('aiScore').innerText = aiScore;
}

function drawRect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
}

function drawCircle(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2, false);
    ctx.closePath();
    ctx.fill();
}

function drawNet() {
    for (let i = 0; i <= gameCanvas.height; i += 20) {
        drawRect(gameCanvas.width / 2 - 1, i, 2, 10, 'rgba(255, 255, 255, 0.1)');
    }
}

function draw() {
    // Clear Canvas
    // Use a slight trail effect? Maybe later. For now clear.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'; // Trail effect
    ctx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);

    drawNet();
    drawRect(player.x, player.y, player.width, player.height, player.color);
    drawRect(ai.x, ai.y, ai.width, ai.height, ai.color);
    drawRect(ball.x, ball.y, ball.width, ball.height, ball.color);
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

// Start Game
document.getElementById('startButton').addEventListener('click', () => {
    if (!gameRunning) {
        gameRunning = true;
        document.querySelector('.controls-hint').style.display = 'none';
        camera.start();
        loop();
    }
});

// Initial Draw
draw();
