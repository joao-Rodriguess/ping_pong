// Cyber Dodge - Futuristic Head-Controlled Arcade Game
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const videoElement = document.querySelector('.input_video');
const canvasElement = document.querySelector('.output_canvas');
const canvasCtx = canvasElement.getContext('2d');

// Game State
let gameRunning = false;
let score = 0;
let lives = 3;
const particleManager = new ParticleManager();

// Player Avatar
const player = {
    x: canvas.width / 2,
    y: canvas.height - 100,
    width: 40,
    height: 40,
    color: '#00f3ff',
    targetX: canvas.width / 2
};

// Lists
const obstacles = [];
const crystals = [];

// Game Parameters
let baseSpeed = 4;
let difficultyFactor = 1;
const OBSTACLE_SPAWN_INTERVAL = 1100; // ms
const CRYSTAL_SPAWN_INTERVAL = 1500; // ms
let lastObstacleSpawn = 0;
let lastCrystalSpawn = 0;

// IA e Controle Facial
let faceCalibrating = true;
const faceCalibrationFrames = [];
const FACE_CALIBRATION_TOTAL_FRAMES = 75; // Aprox. 2.5s a 30fps

let baseNoseX = 0.5;
let currentNoseX = 0.5;
let noseOffset = 0;
let landmarksDetected = false;

class Obstacle {
    constructor() {
        this.width = Math.random() * 20 + 30; // 30 a 50
        this.height = this.width;
        this.x = Math.random() * (canvas.width - this.width - 40) + 20;
        this.y = -this.height;
        this.speed = (Math.random() * 2 + baseSpeed) * difficultyFactor;
        this.color = '#ff0055'; // Vermelho Neon
        this.angle = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.05;
    }

    update() {
        this.y += this.speed;
        this.angle += this.rotationSpeed;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
        ctx.rotate(this.angle);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 18;
        ctx.shadowColor = this.color;

        // Desenhar quadrado rotacionado neon (Cubo de Energia instável)
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        
        // Detalhes internos escuros
        ctx.strokeStyle = '#050508';
        ctx.lineWidth = 2;
        ctx.strokeRect(-this.width / 3, -this.height / 3, this.width * 2 / 3, this.height * 2 / 3);

        ctx.restore();
    }

    isOffScreen() {
        return this.y > canvas.height;
    }
}

class Crystal {
    constructor() {
        this.width = 24;
        this.height = 32;
        this.x = Math.random() * (canvas.width - this.width - 40) + 20;
        this.y = -this.height;
        this.speed = (Math.random() * 1.5 + baseSpeed - 0.5) * difficultyFactor;
        this.color = '#00f3ff'; // Ciano Neon
        this.pulse = 0;
    }

    update() {
        this.y += this.speed;
        this.pulse += 0.1;
    }

    draw() {
        ctx.save();
        ctx.fillStyle = this.color;
        
        // Brilho pulsante
        const glow = 15 + Math.sin(this.pulse) * 7;
        ctx.shadowBlur = glow;
        ctx.shadowColor = this.color;

        // Desenhar diamante de energia ciano
        ctx.beginPath();
        ctx.moveTo(this.x + this.width / 2, this.y); // topo
        ctx.lineTo(this.x + this.width, this.y + this.height / 2); // direita
        ctx.lineTo(this.x + this.width / 2, this.y + this.height); // base
        ctx.lineTo(this.x, this.y + this.height / 2); // esquerda
        ctx.closePath();
        ctx.fill();

        // Brilho central branco
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(this.x + this.width / 2, this.y + 6);
        ctx.lineTo(this.x + this.width - 6, this.y + this.height / 2);
        ctx.lineTo(this.x + this.width / 2, this.y + this.height - 6);
        ctx.lineTo(this.x + 6, this.y + this.height / 2);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    isOffScreen() {
        return this.y > canvas.height + 20;
    }
}

function processFaceControl(landmarks) {
    if (!landmarks || landmarks.length < 478) {
        landmarksDetected = false;
        return;
    }
    landmarksDetected = true;

    // Rastrear a ponta do nariz (Landmark 1)
    const nose = landmarks[1];
    currentNoseX = nose.x;

    // FASE DE CALIBRAÇÃO ATIVA
    if (faceCalibrating) {
        faceCalibrationFrames.push(currentNoseX);
        
        if (faceCalibrationFrames.length >= FACE_CALIBRATION_TOTAL_FRAMES) {
            let sum = 0;
            faceCalibrationFrames.forEach(val => sum += val);
            baseNoseX = sum / faceCalibrationFrames.length;
            faceCalibrating = false;
            Sound.playPowerup();
        }
        return;
    }

    // Calcular deslocamento em relação ao basal
    // MediaPipe espelha o X se a imagem for espelhada.
    // Usamos (currentNoseX - baseNoseX)
    noseOffset = currentNoseX - baseNoseX;

    // Mapeamento suave e amplificado para guiar o avatar
    // A sensibilidade de 2.2 é ótima e ergonômica
    const sensitivity = 2.4;
    const targetX = canvas.width / 2 - (noseOffset * canvas.width * sensitivity);
    player.targetX = Math.max(player.width / 2 + 10, Math.min(canvas.width - player.width / 2 - 10, targetX));
}

// MediaPipe FaceMesh Setup
function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];

        // Desenhar contornos da face no preview da webcam
        drawConnectors(canvasCtx, landmarks, FACEMESH_TESSELATION, { color: 'rgba(0, 243, 255, 0.15)', lineWidth: 0.5 });
        drawConnectors(canvasCtx, landmarks, FACEMESH_RIGHT_EYE, { color: '#00f3ff', lineWidth: 1.5 });
        drawConnectors(canvasCtx, landmarks, FACEMESH_LEFT_EYE, { color: '#00f3ff', lineWidth: 1.5 });

        processFaceControl(landmarks);
    } else {
        landmarksDetected = false;
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

// Game loops
function triggerScreenShake() {
    document.body.classList.add('shake');
    setTimeout(() => document.body.classList.remove('shake'), 400);
}

function updatePlayer() {
    if (landmarksDetected && !faceCalibrating) {
        // Interpolar suavemente para evitar tremulações (lerp de 0.20)
        player.x += (player.targetX - player.x) * 0.20;
    }
}

function spawnEntities() {
    const now = Date.now();
    if (!faceCalibrating && gameRunning) {
        // Spawn de Obstáculos
        if (now - lastObstacleSpawn > OBSTACLE_SPAWN_INTERVAL / difficultyFactor) {
            obstacles.push(new Obstacle());
            lastObstacleSpawn = now;
        }

        // Spawn de Cristais
        if (now - lastCrystalSpawn > CRYSTAL_SPAWN_INTERVAL) {
            crystals.push(new Crystal());
            lastCrystalSpawn = now;
        }
    }
}

function checkCollisions() {
    const playerRadius = player.width / 2;

    // Obstáculos vs Jogador
    for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i];
        const dist = distance(
            { x: player.x, y: player.y },
            { x: obs.x + obs.width / 2, y: obs.y + obs.height / 2 }
        );

        if (dist < playerRadius + obs.width / 2 - 4) {
            // Colisão com obstáculo!
            Sound.playExplosion();
            triggerScreenShake();
            particleManager.createExplosion(obs.x + obs.width / 2, obs.y + obs.height / 2, '#ff0055', 25);
            obstacles.splice(i, 1);
            
            lives--;
            updateLives();
            if (lives <= 0) {
                gameOver();
            }
        }
    }

    // Cristais vs Jogador
    for (let i = crystals.length - 1; i >= 0; i--) {
        const cry = crystals[i];
        const dist = distance(
            { x: player.x, y: player.y },
            { x: cry.x + cry.width / 2, y: cry.y + cry.height / 2 }
        );

        if (dist < playerRadius + cry.width / 2 + 5) {
            // Coleta de cristal!
            Sound.playBeep(880, 0.08); // Bip de coleta agudo
            particleManager.createExplosion(cry.x + cry.width / 2, cry.y + cry.height / 2, '#00f3ff', 15);
            crystals.splice(i, 1);
            
            score += 10;
            updateScore();

            // Aumentar dificuldade gradualmente a cada 100 pontos
            if (score > 0 && score % 100 === 0) {
                difficultyFactor += 0.12;
                Sound.playPowerup();
            }
        }
    }
}

function updateScore() {
    document.getElementById('scoreDisplay').textContent = `Score: ${score}`;
}

function updateLives() {
    document.getElementById('livesDisplay').textContent = `${'❤️ '.repeat(Math.max(0, lives))}`;
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
    ctx.fillText('CYBER OVER', canvas.width / 2, canvas.height / 2 - 40);

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

    updatePlayer();
    spawnEntities();

    // Atualizar Obstáculos
    for (let i = obstacles.length - 1; i >= 0; i--) {
        obstacles[i].update();
        if (obstacles[i].isOffScreen()) {
            obstacles.splice(i, 1);
            score += 2; // Pequeno bônus por desviar com sucesso!
            updateScore();
        }
    }

    // Atualizar Cristais
    for (let i = crystals.length - 1; i >= 0; i--) {
        crystals[i].update();
        if (crystals[i].isOffScreen()) {
            crystals.splice(i, 1);
        }
    }

    checkCollisions();
    particleManager.update();
}

function drawPlayer() {
    ctx.save();
    ctx.fillStyle = player.color;
    ctx.shadowBlur = 25;
    ctx.shadowColor = player.color;

    // Desenhar esfera de plasma ciano brilhante
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.width / 2, 0, Math.PI * 2);
    ctx.fill();

    // Detalhe interno futurista (Anel de energia)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.width / 4, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
}

function drawHUD() {
    // Tela de Calibração Basal de Rosto
    if (faceCalibrating) {
        ctx.save();
        ctx.fillStyle = 'rgba(5, 5, 8, 0.88)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Moldura Neon Ciano
        ctx.strokeStyle = '#00f3ff';
        ctx.lineWidth = 3;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00f3ff';
        ctx.strokeRect(50, 50, canvas.width - 100, canvas.height - 100);

        // Texto
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText('CALIBRANDO POSIÇÃO DA CABEÇA...', canvas.width / 2, canvas.height / 2 - 50);

        ctx.font = '16px Inter';
        ctx.fillStyle = '#a0aec0';
        ctx.fillText('Foque no centro da tela e mantenha a cabeça alinhada', canvas.width / 2, canvas.height / 2 - 10);

        // Barra de progresso
        const progressPercent = Math.min(1.0, faceCalibrationFrames.length / FACE_CALIBRATION_TOTAL_FRAMES);
        const barWidth = 300;
        const barHeight = 12;
        const bx = canvas.width / 2 - barWidth / 2;
        const by = canvas.height / 2 + 30;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(bx, by, barWidth, barHeight);

        ctx.fillStyle = '#00f3ff';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00f3ff';
        ctx.fillRect(bx, by, barWidth * progressPercent, barHeight);

        ctx.restore();
    } else if (gameRunning) {
        // Indicador horizontal de inclinação no rodapé
        ctx.save();
        const hudY = canvas.height - 25;
        const barW = 200;
        const hudX = canvas.width / 2 - barW / 2;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(hudX, hudY, barW, 6);

        // Mapear noseOffset (-0.15 a 0.15) para a largura do barW
        const mappedOffset = Math.max(-0.12, Math.min(0.12, noseOffset));
        const indicatorX = hudX + barW / 2 + (mappedOffset / 0.12) * (barW / 2);

        // Indicador central
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(canvas.width / 2 - 1, hudY - 3, 2, 12);

        // Cursor do nariz
        ctx.fillStyle = '#00f3ff';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00f3ff';
        ctx.beginPath();
        ctx.arc(indicatorX, hudY + 3, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#a0aec0';
        ctx.font = 'bold 11px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText(`INCLINAÇÃO FACIAL`, canvas.width / 2, hudY - 12);

        ctx.restore();
    }
}

function draw() {
    // Clear com efeito trail sutil
    ctx.fillStyle = 'rgba(7, 7, 15, 0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Efeito de Starfield cibernética em queda (efeito de velocidade)
    ctx.fillStyle = 'rgba(0, 243, 255, 0.2)';
    for (let i = 0; i < 30; i++) {
        const x = (i * 277) % canvas.width;
        // As estrelas caem com base na velocidade base multiplicada pela dificuldade
        const y = (i * 419 + Date.now() * (baseSpeed * difficultyFactor * 0.08)) % canvas.height;
        ctx.fillRect(x, y, 2, 8);
    }

    particleManager.draw(ctx);

    // Obstáculos
    obstacles.forEach(obs => obs.draw());

    // Cristais
    crystals.forEach(cry => cry.draw());

    if (gameRunning) {
        drawPlayer();
        drawHUD();
    }
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// Start Game Event
document.getElementById('startBtn').addEventListener('click', async () => {
    document.getElementById('controls').style.display = 'none';
    createBackButton();

    Sound.playPowerup();

    await camera.start();

    gameRunning = true;
    score = 0;
    lives = 3;
    baseSpeed = 4;
    difficultyFactor = 1;
    obstacles.length = 0;
    crystals.length = 0;
    particleManager.clear();
    lastObstacleSpawn = Date.now();
    lastCrystalSpawn = Date.now();
    
    updateScore();
    updateLives();

    // Ativar calibração basal do rosto
    faceCalibrating = true;
    faceCalibrationFrames.length = 0;
});

// Renderização inicial
draw();
gameLoop();
