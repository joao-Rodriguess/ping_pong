// Fruit Ninja Game Logic
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const videoElement = document.querySelector('.input_video');
const canvasElement = document.querySelector('.output_canvas');
const canvasCtx = canvasElement.getContext('2d');

// Game State
let gameRunning = false;
let score = 0;
let combo = 0;
let comboTimer = 0;
const COMBO_TIMEOUT = 1000; // ms

// Particle Manager
const particleManager = new ParticleManager();

// Hand tracking
let handPosition = null;
let isLightsaberActive = false;
let handTrail = [];
const MAX_TRAIL_LENGTH = 10;

// Fruits
const fruits = [];
const fruitEmojis = ['🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🥝', '🍑', '🍍'];
let lastFruitSpawn = 0;
const FRUIT_SPAWN_INTERVAL = 800; // ms

// Fruit class
class Fruit {
    constructor() {
        this.emoji = fruitEmojis[Math.floor(Math.random() * fruitEmojis.length)];
        this.size = 50;
        this.x = Math.random() * (canvas.width - this.size);
        this.y = canvas.height + this.size;
        this.vx = (Math.random() - 0.5) * 4;
        this.vy = -Math.random() * 10 - 25; // Frutas sobem BEM alto!
        this.rotation = 0;
        this.rotationSpeed = (Math.random() - 0.5) * 0.2;
        this.sliced = false;
    }

    update() {
        this.vy += 0.5; // gravity
        this.x += this.vx;
        this.y += this.vy;
        this.rotation += this.rotationSpeed;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x + this.size / 2, this.y + this.size / 2);
        ctx.rotate(this.rotation);
        ctx.font = `${this.size}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
        ctx.fillText(this.emoji, 0, 0);
        ctx.restore();
    }

    isOffScreen() {
        return this.y > canvas.height + 100;
    }

    getBounds() {
        return {
            x: this.x,
            y: this.y,
            width: this.size,
            height: this.size
        };
    }
}

// MediaPipe Hands Setup
function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

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
}
// Game Functions
function spawnFruit() {
    const now = Date.now();
    if (now - lastFruitSpawn > FRUIT_SPAWN_INTERVAL && gameRunning) {
        fruits.push(new Fruit());
        lastFruitSpawn = now;
    }
}

function checkSlicing() {
    if (!isLightsaberActive || handTrail.length < 2) return;

    let slicedCount = 0;

    for (let i = fruits.length - 1; i >= 0; i--) {
        const fruit = fruits[i];
        if (fruit.sliced) continue;

        const bounds = fruit.getBounds();

        // Check if any part of the trail intersects with the fruit
        for (let j = 0; j < handTrail.length - 1; j++) {
            const p1 = handTrail[j];
            const p2 = handTrail[j + 1];

            // Simple line-rect intersection check
            if (lineIntersectsRect(p1, p2, bounds)) {
                fruit.sliced = true;
                slicedCount++;

                // Particle explosion
                particleManager.createExplosion(
                    fruit.x + fruit.size / 2,
                    fruit.y + fruit.size / 2,
                    getRandomColor(),
                    30
                );

                fruits.splice(i, 1);
                score += 10;
                updateScore();
                break;
            }
        }
    }

    // Update combo
    if (slicedCount > 0) {
        combo += slicedCount;
        comboTimer = Date.now();
        updateCombo();
    }
}

function lineIntersectsRect(p1, p2, rect) {
    // Check if line segment intersects with rectangle
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const radius = rect.width / 2;

    // Distance from line to center of rect
    const dist = distanceToLineSegment(p1, p2, { x: cx, y: cy });
    return dist < radius;
}

function distanceToLineSegment(p1, p2, point) {
    const A = point.x - p1.x;
    const B = point.y - p1.y;
    const C = p2.x - p1.x;
    const D = p2.y - p1.y;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;

    if (param < 0) {
        xx = p1.x;
        yy = p1.y;
    } else if (param > 1) {
        xx = p2.x;
        yy = p2.y;
    } else {
        xx = p1.x + param * C;
        yy = p1.y + param * D;
    }

    const dx = point.x - xx;
    const dy = point.y - yy;
    return Math.sqrt(dx * dx + dy * dy);
}

function getRandomColor() {
    const colors = ['#ff0055', '#00f3ff', '#b537ff', '#00ff88', '#ffff00'];
    return colors[Math.floor(Math.random() * colors.length)];
}

function updateScore() {
    document.getElementById('scoreDisplay').textContent = `Score: ${score}`;
}

function updateCombo() {
    const comboDisplay = document.getElementById('comboDisplay');
    if (combo >= 2) {
        comboDisplay.textContent = `COMBO x${combo}!`;
        comboDisplay.style.display = 'block';
        score += combo * 5; // Bonus points
        updateScore();
    }
}

function update() {
    if (!gameRunning) return;

    spawnFruit();

    // Update fruits
    fruits.forEach((fruit, index) => {
        fruit.update();
        if (fruit.isOffScreen()) {
            fruits.splice(index, 1);
        }
    });

    checkSlicing();
    particleManager.update();

    // Check combo timeout
    if (combo > 0 && Date.now() - comboTimer > COMBO_TIMEOUT) {
        combo = 0;
        document.getElementById('comboDisplay').style.display = 'none';
    }
}

function drawLightsaber() {
    if (!isLightsaberActive || handTrail.length < 2) return;

    ctx.save();

    // Draw glowing trail
    for (let i = 0; i < handTrail.length - 1; i++) {
        const p1 = handTrail[i];
        const p2 = handTrail[i + 1];
        const alpha = (i + 1) / handTrail.length;

        // Glow effect
        ctx.strokeStyle = `rgba(0, 255, 0, ${alpha * 0.3})`;
        ctx.lineWidth = 25;
        ctx.lineCap = 'round';
        ctx.shadowBlur = 30;
        ctx.shadowColor = '#00ff00';
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        // Core
        ctx.strokeStyle = `rgba(200, 255, 200, ${alpha})`;
        ctx.lineWidth = 8;
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
    }

    ctx.restore();
}

function draw() {
    // Clear with gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#0a0a12');
    gradient.addColorStop(1, '#1a0a2e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    particleManager.draw(ctx);
    fruits.forEach(fruit => fruit.draw());
    drawLightsaber();
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// Start game
document.getElementById('startBtn').addEventListener('click', async () => {
    document.getElementById('controls').style.display = 'none';
    createBackButton();

    await camera.start();

    gameRunning = true;
    score = 0;
    combo = 0;
    fruits.length = 0;
    lastFruitSpawn = Date.now();
    updateScore();
});

// Initial draw
draw();
gameLoop();
