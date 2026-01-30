// Space Shooter Game Logic
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const videoElement = document.querySelector('.input_video');
const canvasElement = document.querySelector('.output_canvas');
const canvasCtx = canvasElement.getContext('2d');

// Game State
let gameRunning = false;
let score = 0;
let lives = 3;
let lastShootTime = 0;
const SHOOT_COOLDOWN = 300; // ms

// Particle Manager
const particleManager = new ParticleManager();

// Player
const player = {
    x: canvas.width / 2,
    y: canvas.height - 100,
    width: 40,
    height: 40,
    color: '#00f3ff',
    speed: 8
};

// Bullets
const bullets = [];
const BULLET_SPEED = 10;

// Enemies
const enemies = [];
let enemySpawnTimer = 0;
const ENEMY_SPAWN_INTERVAL = 1500; // ms
let lastEnemySpawn = 0;

// Hand tracking
let handPosition = null;
let isShooting = false;


// MediaPipe Hands Setup
function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];

        // Draw hand
        drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: '#00f3ff', lineWidth: 2 });
        drawLandmarks(canvasCtx, landmarks, { color: '#ff0055', lineWidth: 1 });

        // Get palm position (landmark 9)
        const palm = landmarks[9];
        handPosition = {
            x: (1 - palm.x) * canvas.width, // Mirror
            y: palm.y * canvas.height
        };

        // Check if pointing gesture
        isShooting = isPointingGesture(landmarks);
    } else {
        handPosition = null;
        isShooting = false;
    }

    canvasCtx.restore();
}

const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
    maxNumHands: 2,
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

// Enemy class
class Enemy {
    constructor() {
        this.width = 40;
        this.height = 40;
        this.x = Math.random() * (canvas.width - this.width);
        this.y = -this.height;
        this.speed = Math.random() * 2 + 2;
        this.color = '#ff0055';
    }

    update() {
        this.y += this.speed;
    }

    draw() {
        ctx.save();
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 20;
        ctx.shadowColor = this.color;

        // Draw enemy ship
        ctx.beginPath();
        ctx.moveTo(this.x + this.width / 2, this.y);
        ctx.lineTo(this.x, this.y + this.height);
        ctx.lineTo(this.x + this.width, this.y + this.height);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    isOffScreen() {
        return this.y > canvas.height;
    }
}

// Bullet class
class Bullet {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 4;
        this.height = 15;
        this.color = '#00f3ff';
    }

    update() {
        this.y -= BULLET_SPEED;
    }

    draw() {
        ctx.save();
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        ctx.fillRect(this.x - this.width / 2, this.y, this.width, this.height);
        ctx.restore();
    }

    isOffScreen() {
        return this.y < -this.height;
    }
}

// Game Functions
function updatePlayer() {
    if (handPosition) {
        // Smooth movement towards hand position
        const dx = handPosition.x - player.x;
        const dy = handPosition.y - player.y;
        player.x += dx * 0.2;
        player.y += dy * 0.2;

        // Keep in bounds
        player.x = Math.max(player.width / 2, Math.min(canvas.width - player.width / 2, player.x));
        player.y = Math.max(player.height / 2, Math.min(canvas.height - player.height / 2, player.y));
    }
}

function shoot() {
    const now = Date.now();
    if (isShooting && now - lastShootTime > SHOOT_COOLDOWN) {
        bullets.push(new Bullet(player.x, player.y - player.height / 2));
        lastShootTime = now;

        // Visual feedback
        particleManager.createExplosion(player.x, player.y - 20, '#00f3ff', 5);
    }
}

function spawnEnemy() {
    const now = Date.now();
    if (now - lastEnemySpawn > ENEMY_SPAWN_INTERVAL) {
        enemies.push(new Enemy());
        lastEnemySpawn = now;
    }
}

function checkCollisions() {
    // Bullet-Enemy collisions
    for (let i = bullets.length - 1; i >= 0; i--) {
        for (let j = enemies.length - 1; j >= 0; j--) {
            const bullet = bullets[i];
            const enemy = enemies[j];

            if (bullet && enemy &&
                bullet.x > enemy.x &&
                bullet.x < enemy.x + enemy.width &&
                bullet.y > enemy.y &&
                bullet.y < enemy.y + enemy.height) {

                // Hit!
                particleManager.createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ff0055', 25);
                enemies.splice(j, 1);
                bullets.splice(i, 1);
                score += 10;
                updateScore();
                break;
            }
        }
    }

    // Player-Enemy collisions
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        const dist = distance(
            { x: player.x, y: player.y },
            { x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height / 2 }
        );

        if (dist < (player.width + enemy.width) / 2) {
            particleManager.createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ff0055', 30);
            enemies.splice(i, 1);
            lives--;
            updateLives();

            if (lives <= 0) {
                gameOver();
            }
        }
    }
}

function updateScore() {
    document.getElementById('scoreDisplay').textContent = `Score: ${score}`;
}

function updateLives() {
    document.getElementById('livesDisplay').textContent = `${'❤️ '.repeat(lives)}`;
}

function gameOver() {
    gameRunning = false;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#ff0055';
    ctx.font = 'bold 60px Orbitron';
    ctx.textAlign = 'center';
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#ff0055';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 40);

    ctx.fillStyle = '#00f3ff';
    ctx.font = 'bold 40px Orbitron';
    ctx.shadowColor = '#00f3ff';
    ctx.fillText(`Score: ${score}`, canvas.width / 2, canvas.height / 2 + 20);

    ctx.fillStyle = '#ffffff';
    ctx.font = '20px Orbitron';
    ctx.shadowBlur = 0;
    ctx.fillText('Clique em "Voltar" para jogar novamente', canvas.width / 2, canvas.height / 2 + 80);
}

function update() {
    if (!gameRunning) return;

    updatePlayer();
    shoot();
    spawnEnemy();

    // Update bullets
    bullets.forEach((bullet, index) => {
        bullet.update();
        if (bullet.isOffScreen()) {
            bullets.splice(index, 1);
        }
    });

    // Update enemies
    enemies.forEach((enemy, index) => {
        enemy.update();
        if (enemy.isOffScreen()) {
            enemies.splice(index, 1);
            lives--;
            updateLives();
            if (lives <= 0) {
                gameOver();
            }
        }
    });

    checkCollisions();
    particleManager.update();
}

function drawPlayer() {
    ctx.save();
    ctx.fillStyle = player.color;
    ctx.shadowBlur = 20;
    ctx.shadowColor = player.color;

    // Draw player ship
    ctx.beginPath();
    ctx.moveTo(player.x, player.y - player.height / 2);
    ctx.lineTo(player.x - player.width / 2, player.y + player.height / 2);
    ctx.lineTo(player.x + player.width / 2, player.y + player.height / 2);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}

function draw() {
    // Clear with trail effect
    ctx.fillStyle = 'rgba(10, 10, 18, 0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw stars background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    for (let i = 0; i < 50; i++) {
        const x = (i * 137.5) % canvas.width;
        const y = (i * 197.3 + Date.now() * 0.05) % canvas.height;
        ctx.fillRect(x, y, 1, 1);
    }

    particleManager.draw(ctx);

    bullets.forEach(bullet => bullet.draw());
    enemies.forEach(enemy => enemy.draw());

    if (gameRunning) {
        drawPlayer();
    }
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
    lives = 3;
    bullets.length = 0;
    enemies.length = 0;
    lastEnemySpawn = Date.now();
    updateScore();
    updateLives();
});

// Initial draw
draw();
gameLoop();
