// Fruit Ninja Game Logic - Fully Restructured & Improved
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const videoElement = document.querySelector('.input_video');
const canvasElement = document.querySelector('.output_canvas');
const canvasCtx = canvasElement.getContext('2d');

// Game State
let gameRunning = false;
let score = 0;
let lives = 3;
let combo = 0;
let comboTimer = 0;
const COMBO_TIMEOUT = 1000; // ms
let flashIntensity = 0; // Para flashes ao explodir bombas ou levar dano

// Particle Manager
const particleManager = new ParticleManager();

// Hand tracking
let handPosition = null;
let isLightsaberActive = false;
let handTrail = [];
const MAX_TRAIL_LENGTH = 12;
let lastSwooshTime = 0;

// Fruits
const fruits = [];
const slicedParts = [];
const bombs = [];
const fruitEmojis = ['🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🥝', '🍑', '🍍'];
let lastFruitSpawn = 0;
let lastBombSpawn = 0;
const FRUIT_SPAWN_INTERVAL = 900; // ms
const BOMB_SPAWN_INTERVAL = 3800; // ms

// Classes
class Fruit {
    constructor() {
        this.emoji = fruitEmojis[Math.floor(Math.random() * fruitEmojis.length)];
        this.size = 55;
        this.x = Math.random() * (canvas.width - this.size - 100) + 50;
        this.y = canvas.height + this.size;
        this.vx = (Math.random() - 0.5) * 6;
        this.vy = -Math.random() * 8 - 21; // Frutas sobem bem alto!
        this.rotation = 0;
        this.rotationSpeed = (Math.random() - 0.5) * 0.15;
        this.sliced = false;
    }

    update() {
        this.vy += 0.38; // gravity
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
        ctx.shadowBlur = 15;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.4)';
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

class SlicedFruitPart {
    constructor(emoji, x, y, size, vx, vy, side) {
        this.emoji = emoji;
        this.x = x;
        this.y = y;
        this.size = size;
        this.vx = vx + (side === 'left' ? -3 : 3);
        this.vy = vy - 1.5; // Sobe um pouquinho
        this.gravity = 0.45;
        this.rotation = 0;
        this.rotationSpeed = (Math.random() - 0.5) * 0.3;
        this.side = side; // 'left' ou 'right'
        this.opacity = 1;
    }

    update() {
        this.vy += this.gravity;
        this.x += this.vx;
        this.y += this.vy;
        this.rotation += this.rotationSpeed;
        this.opacity -= 0.025; // Desaparece aos poucos
    }

    draw() {
        if (this.opacity <= 0) return;
        ctx.save();
        ctx.translate(this.x + this.size / 2, this.y + this.size / 2);
        ctx.rotate(this.rotation);
        ctx.globalAlpha = Math.max(0, this.opacity);
        ctx.font = `${this.size}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Clip para desenhar apenas metade do Emoji
        ctx.beginPath();
        if (this.side === 'left') {
            ctx.rect(-this.size, -this.size, this.size, this.size * 2);
        } else {
            ctx.rect(0, -this.size, this.size, this.size * 2);
        }
        ctx.clip();

        ctx.fillText(this.emoji, 0, 0);
        ctx.restore();
    }

    isOffScreen() {
        return this.y > canvas.height + 100 || this.opacity <= 0;
    }
}

class Bomb {
    constructor() {
        this.size = 50;
        this.x = Math.random() * (canvas.width - this.size - 100) + 50;
        this.y = canvas.height + this.size;
        this.vx = (Math.random() - 0.5) * 5;
        this.vy = -Math.random() * 6 - 19;
        this.rotation = 0;
        this.rotationSpeed = (Math.random() - 0.5) * 0.2;
    }

    update() {
        this.vy += 0.35; // gravity
        this.x += this.vx;
        this.y += this.vy;
        this.rotation += this.rotationSpeed;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x + this.size / 2, this.y + this.size / 2);
        ctx.rotate(this.rotation);

        // Corpo da bomba
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ff0055';
        ctx.fillStyle = '#0f0f15';
        ctx.strokeStyle = '#ff0055';
        ctx.lineWidth = 3;

        ctx.beginPath();
        ctx.arc(0, 0, this.size / 2 - 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Pavio
        ctx.strokeStyle = '#e9a93c';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, -(this.size / 2 - 5));
        ctx.quadraticCurveTo(8, -25, 12, -30);
        ctx.stroke();

        // Faísca do pavio
        const sparksColor = Math.random() > 0.5 ? '#ffeb3b' : '#ff5722';
        ctx.fillStyle = sparksColor;
        ctx.shadowBlur = 15;
        ctx.shadowColor = sparksColor;
        ctx.beginPath();
        ctx.arc(12, -30, 4 + Math.random() * 3, 0, Math.PI * 2);
        ctx.fill();

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

// MediaPipe Hands Setup - CORRECT GLOBAL INITIALIZATION
function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];

        // Desenhar a mão no preview
        drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: '#ff0055', lineWidth: 2 });
        drawLandmarks(canvasCtx, landmarks, { color: '#00f3ff', lineWidth: 1 });

        // Ponta do dedo indicador (landmark 8)
        const indexTip = landmarks[8];
        const newPos = {
            x: (1 - indexTip.x) * canvas.width, // Espelhar
            y: indexTip.y * canvas.height
        };

        // Som de swoosh se o movimento for rápido
        if (handPosition) {
            const dist = distance(handPosition, newPos);
            const now = Date.now();
            if (dist > 30 && now - lastSwooshTime > 250) {
                Sound.playSwoosh();
                lastSwooshTime = now;
            }
        }

        handPosition = newPos;
        isLightsaberActive = true;

        // Adicionar ao rastro
        handTrail.push(handPosition);
        if (handTrail.length > MAX_TRAIL_LENGTH) {
            handTrail.shift();
        }
    } else {
        isLightsaberActive = false;
        handPosition = null;
        handTrail = [];
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

// Game Functions
function spawnFruit() {
    const now = Date.now();
    if (now - lastFruitSpawn > FRUIT_SPAWN_INTERVAL && gameRunning) {
        fruits.push(new Fruit());
        lastFruitSpawn = now;
    }
}

function spawnBomb() {
    const now = Date.now();
    // Spawna bomba com probabilidade se o score for maior que 20
    if (score >= 20 && now - lastBombSpawn > BOMB_SPAWN_INTERVAL && gameRunning) {
        if (Math.random() < 0.4) {
            bombs.push(new Bomb());
        }
        lastBombSpawn = now;
    }
}

function checkSlicing() {
    if (!isLightsaberActive || handTrail.length < 2) return;

    let slicedCount = 0;

    // Checar fatiamento de frutas
    for (let i = fruits.length - 1; i >= 0; i--) {
        const fruit = fruits[i];
        if (fruit.sliced) continue;

        const bounds = fruit.getBounds();

        for (let j = 0; j < handTrail.length - 1; j++) {
            const p1 = handTrail[j];
            const p2 = handTrail[j + 1];

            if (lineIntersectsRect(p1, p2, bounds)) {
                fruit.sliced = true;
                slicedCount++;

                Sound.playSlice();

                // Explosão de partículas coloridas baseada na fruta
                particleManager.createExplosion(
                    fruit.x + fruit.size / 2,
                    fruit.y + fruit.size / 2,
                    getRandomColor(),
                    25
                );

                // Criar duas metades fatiadas caindo com física!
                slicedParts.push(new SlicedFruitPart(fruit.emoji, fruit.x, fruit.y, fruit.size, fruit.vx, fruit.vy, 'left'));
                slicedParts.push(new SlicedFruitPart(fruit.emoji, fruit.x, fruit.y, fruit.size, fruit.vx, fruit.vy, 'right'));

                fruits.splice(i, 1);
                score += 10;
                updateScore();
                break;
            }
        }
    }

    // Checar fatiamento de bombas
    for (let i = bombs.length - 1; i >= 0; i--) {
        const bomb = bombs[i];
        const bounds = bomb.getBounds();

        for (let j = 0; j < handTrail.length - 1; j++) {
            const p1 = handTrail[j];
            const p2 = handTrail[j + 1];

            if (lineIntersectsRect(p1, p2, bounds)) {
                // Fatiou a bomba!
                Sound.playExplosion();
                flashIntensity = 0.9; // Grande flash branco na tela!
                
                // Tremor na tela
                document.body.classList.add('shake');
                setTimeout(() => document.body.classList.remove('shake'), 400);

                particleManager.createExplosion(
                    bomb.x + bomb.size / 2,
                    bomb.y + bomb.size / 2,
                    '#ff0055',
                    40
                );
                particleManager.createExplosion(
                    bomb.x + bomb.size / 2,
                    bomb.y + bomb.size / 2,
                    '#ffff00',
                    20
                );

                bombs.splice(i, 1);
                lives--;
                updateLives();

                if (lives <= 0) {
                    gameOver();
                }
                break;
            }
        }
    }

    // Atualizar combo
    if (slicedCount > 0) {
        combo += slicedCount;
        comboTimer = Date.now();
        updateCombo();
    }
}

function lineIntersectsRect(p1, p2, rect) {
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const radius = rect.width / 2;

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
    const colors = ['#ff0055', '#00f3ff', '#b537ff', '#00ff88', '#ffff00', '#ff9800'];
    return colors[Math.floor(Math.random() * colors.length)];
}

function updateScore() {
    document.getElementById('scoreDisplay').textContent = `Score: ${score}`;
}

function updateLives() {
    document.getElementById('livesDisplay').textContent = `${'❤️ '.repeat(Math.max(0, lives))}`;
}

function updateCombo() {
    const comboDisplay = document.getElementById('comboDisplay');
    if (combo >= 3) {
        Sound.playBeep(800, 0.1);
        comboDisplay.textContent = `COMBO x${combo}!`;
        comboDisplay.style.display = 'block';
        score += combo * 5; // Bônus de pontuação
        updateScore();

        // Efeito de partículas na tela
        particleManager.createExplosion(canvas.width / 2, canvas.height / 2 - 50, '#ffeb3b', 15);
    }
}

function gameOver() {
    gameRunning = false;
    ctx.fillStyle = 'rgba(10, 10, 18, 0.9)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#ff0055';
    ctx.font = 'bold 50px Orbitron';
    ctx.textAlign = 'center';
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#ff0055';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 40);

    ctx.fillStyle = '#00f3ff';
    ctx.font = 'bold 36px Orbitron';
    ctx.shadowColor = '#00f3ff';
    ctx.fillText(`Score Final: ${score}`, canvas.width / 2, canvas.height / 2 + 15);

    ctx.fillStyle = '#ffffff';
    ctx.font = '16px Inter';
    ctx.shadowBlur = 0;
    ctx.fillText('Clique em "Voltar" no topo para reiniciar', canvas.width / 2, canvas.height / 2 + 70);
}

function update() {
    if (!gameRunning) return;

    spawnFruit();
    spawnBomb();

    // Atualizar frutas
    for (let i = fruits.length - 1; i >= 0; i--) {
        const fruit = fruits[i];
        fruit.update();

        if (fruit.isOffScreen()) {
            fruits.splice(i, 1);
            // Perder vida se fruta cair sem cortar! (Bombas não tiram vida ao caírem)
            lives--;
            updateLives();
            Sound.playBeep(300, 0.15); // Som triste de perda de vida

            // Tremor de leve
            document.body.classList.add('shake');
            setTimeout(() => document.body.classList.remove('shake'), 200);

            if (lives <= 0) {
                gameOver();
            }
        }
    }

    // Atualizar pedaços fatiados
    for (let i = slicedParts.length - 1; i >= 0; i--) {
        slicedParts[i].update();
        if (slicedParts[i].isOffScreen()) {
            slicedParts.splice(i, 1);
        }
    }

    // Atualizar bombas
    for (let i = bombs.length - 1; i >= 0; i--) {
        bombs[i].update();
        if (bombs[i].isOffScreen()) {
            bombs.splice(i, 1);
        }
    }

    checkSlicing();
    particleManager.update();

    // Diminuir flash
    if (flashIntensity > 0) {
        flashIntensity -= 0.05;
    }

    // Resetar combo se passar do tempo limite
    if (combo > 0 && Date.now() - comboTimer > COMBO_TIMEOUT) {
        combo = 0;
        document.getElementById('comboDisplay').style.display = 'none';
    }
}

function drawLightsaber() {
    if (!isLightsaberActive || handTrail.length < 2) return;

    ctx.save();
    for (let i = 0; i < handTrail.length - 1; i++) {
        const p1 = handTrail[i];
        const p2 = handTrail[i + 1];
        const alpha = (i + 1) / handTrail.length;

        // Glow externo do sabre
        ctx.strokeStyle = `rgba(0, 243, 255, ${alpha * 0.45})`;
        ctx.lineWidth = 26;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowBlur = 25;
        ctx.shadowColor = '#00f3ff';
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        // Núcleo branco super brilhante
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.95})`;
        ctx.lineWidth = 8;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
    }
    ctx.restore();
}

function draw() {
    // Fundo Gradiente Dinâmico
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#07070f');
    gradient.addColorStop(1, '#150725');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Partículas
    particleManager.draw(ctx);

    // Emojis de pedaços cortados caindo
    slicedParts.forEach(part => part.draw());

    // Frutas e Bombas
    fruits.forEach(fruit => fruit.draw());
    bombs.forEach(bomb => bomb.draw());

    // Sabre de luz
    drawLightsaber();

    // Desenhar flash de tela se houver
    if (flashIntensity > 0) {
        ctx.save();
        ctx.fillStyle = `rgba(255, 255, 255, ${flashIntensity})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
    }
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// Iniciar Jogo
document.getElementById('startBtn').addEventListener('click', async () => {
    document.getElementById('controls').style.display = 'none';
    createBackButton();

    Sound.playPowerup();

    await camera.start();

    gameRunning = true;
    score = 0;
    lives = 3;
    combo = 0;
    fruits.length = 0;
    slicedParts.length = 0;
    bombs.length = 0;
    lastFruitSpawn = Date.now();
    lastBombSpawn = Date.now();
    updateScore();
    updateLives();
});

// Inicialização Visual
draw();
gameLoop();
