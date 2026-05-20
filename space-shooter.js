// Space Shooter Game Logic - Upgraded & Fully Polished
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
const SHOOT_COOLDOWN = 250; // ms

// Powerup States
let shieldActive = false;
let doubleLaserActive = false;
let doubleLaserTimer = 0;
const DOUBLE_LASER_DURATION = 8000; // 8s em ms

// Particle Manager
const particleManager = new ParticleManager();

// Player
const player = {
    x: canvas.width / 2,
    y: canvas.height - 100,
    width: 45,
    height: 45,
    color: '#00f3ff',
    speed: 8
};

// Lists
const bullets = [];
const enemyBullets = [];
const enemies = [];
const powerUps = [];
let activeBoss = null;

// Constants
const BULLET_SPEED = 11;
const ENEMY_BULLET_SPEED = 5;
const POWERUP_SPEED = 3;
const ENEMY_SPAWN_INTERVAL = 1400; // ms
let lastEnemySpawn = 0;

// IA e Controle Facial (FaceMesh)
let faceCalibrating = true;
let faceCalibrationFrames = [];
const FACE_CALIBRATION_TOTAL_FRAMES = 75; // Aprox. 2.5s a 30fps

let baseGazeX = 0.5;
let baseNoseToEyesY = 0.15;

// Valores instantâneos
let currentGazeX = 0.5;
let currentNoseToEyesY = 0.15;
let gazeOffset = 0;
let headLiftOffset = 0;

let isShooting = false;
let landmarksDetected = false;

// Função auxiliar de distância Euclidiana 3D
function getDistance3D(p1, p2) {
    return Math.sqrt(
        Math.pow(p2.x - p1.x, 2) +
        Math.pow(p2.y - p1.y, 2) +
        Math.pow(p2.z - p1.z, 2)
    );
}

function processFaceControl(landmarks) {
    if (!landmarks || landmarks.length < 478) {
        landmarksDetected = false;
        isShooting = false;
        return;
    }
    landmarksDetected = true;

    // Olho Esquerdo (Contorno landmarks 33 e 133, Íris 468)
    const eyeL_outer = landmarks[33];
    const eyeL_inner = landmarks[133];
    const irisL = landmarks[468];

    // Olho Direito (Contorno landmarks 362 e 263, Íris 473)
    const eyeR_inner = landmarks[362];
    const eyeR_outer = landmarks[263];
    const irisR = landmarks[473];

    // Posições relativas horizontais da íris nos olhos (de 0 a 1)
    const relL = (irisL.x - eyeL_inner.x) / (eyeL_outer.x - eyeL_inner.x);
    const relR = (irisR.x - eyeR_inner.x) / (eyeR_outer.x - eyeR_inner.x);

    // Média horizontal do olhar
    currentGazeX = (relL + relR) / 2;

    // Inclinação Vertical da Cabeça (Levantar a cabeça)
    const nose = landmarks[1];
    const eyeCenterY = (landmarks[159].y + landmarks[386].y) / 2;
    currentNoseToEyesY = nose.y - eyeCenterY;

    // FASE DE CALIBRAÇÃO ATIVA
    if (faceCalibrating) {
        faceCalibrationFrames.push({ gazeX: currentGazeX, noseY: currentNoseToEyesY });
        
        if (faceCalibrationFrames.length >= FACE_CALIBRATION_TOTAL_FRAMES) {
            let sumGazeX = 0, sumNoseY = 0;
            faceCalibrationFrames.forEach(f => {
                sumGazeX += f.gazeX;
                sumNoseY += f.noseY;
            });
            baseGazeX = sumGazeX / faceCalibrationFrames.length;
            baseNoseToEyesY = sumNoseY / faceCalibrationFrames.length;
            faceCalibrating = false;
            Sound.playPowerup();
        }
        isShooting = false;
        return;
    }

    // Calcular offsets em relação ao estado basal
    gazeOffset = currentGazeX - baseGazeX;
    headLiftOffset = baseNoseToEyesY - currentNoseToEyesY; // Positivo se o nariz subir

    // Atirar: se o nariz subir além de um limiar confortável (0.022)
    isShooting = headLiftOffset > 0.022;
}

// MediaPipe FaceMesh Setup
function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];

        // Desenhar contornos oculares e lábios no preview da câmera
        drawConnectors(canvasCtx, landmarks, FACEMESH_RIGHT_EYE, { color: '#00d9ff', lineWidth: 1.5 });
        drawConnectors(canvasCtx, landmarks, FACEMESH_LEFT_EYE, { color: '#00d9ff', lineWidth: 1.5 });
        drawConnectors(canvasCtx, landmarks, FACEMESH_LIPS, { color: '#0088ff', lineWidth: 1 });

        // Processar controles baseados na face
        processFaceControl(landmarks);
    } else {
        landmarksDetected = false;
        isShooting = false;
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

// Classes
class Enemy {
    constructor(type = 'basic') {
        this.width = 40;
        this.height = 40;
        this.x = Math.random() * (canvas.width - this.width - 50) + 25;
        this.y = -this.height;
        this.type = type; // 'basic' ou 'fast' (zigue-zague)
        
        if (this.type === 'fast') {
            this.speed = Math.random() * 2 + 4.5;
            this.color = '#ffff00'; // Amarelo Neon
            this.startX = this.x;
            this.angle = 0;
        } else {
            this.speed = Math.random() * 2 + 2;
            this.color = '#ff0055'; // Vermelho Neon
        }
    }

    update() {
        this.y += this.speed;
        if (this.type === 'fast') {
            this.angle += 0.07;
            this.x = this.startX + Math.sin(this.angle) * 80;
            // Garantir que fica dentro das bordas
            this.x = Math.max(10, Math.min(canvas.width - this.width - 10, this.x));
        }
    }

    draw() {
        ctx.save();
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 20;
        ctx.shadowColor = this.color;

        // Desenhar nave alienígena triangular estilizada
        ctx.beginPath();
        ctx.moveTo(this.x + this.width / 2, this.y + this.height);
        ctx.lineTo(this.x, this.y);
        ctx.lineTo(this.x + this.width / 4, this.y + this.height / 3);
        ctx.lineTo(this.x + this.width * 3/4, this.y + this.height / 3);
        ctx.lineTo(this.x + this.width, this.y);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    isOffScreen() {
        return this.y > canvas.height;
    }
}

class BossEnemy {
    constructor() {
        this.width = 120;
        this.height = 70;
        this.x = canvas.width / 2 - this.width / 2;
        this.y = -this.height;
        this.targetY = 80;
        this.speed = 2;
        this.vx = 2.5;
        this.hp = 100;
        this.maxHp = 100;
        this.color = '#b537ff'; // Roxo neon
        this.lastShoot = 0;
        this.shootInterval = 850; // ms
    }

    update() {
        // Entrada triunfal deslizando de cima
        if (this.y < this.targetY) {
            this.y += 1.5;
        } else {
            // Movimentação em zigue-zague lateral
            this.x += this.vx;
            if (this.x <= 30 || this.x >= canvas.width - this.width - 30) {
                this.vx *= -1;
            }

            // Atirar projéteis
            const now = Date.now();
            if (now - this.lastShoot > this.shootInterval) {
                enemyBullets.push(new EnemyBullet(this.x + 30, this.y + this.height));
                enemyBullets.push(new EnemyBullet(this.x + this.width - 30, this.y + this.height));
                this.lastShoot = now;
            }
        }
    }

    draw() {
        ctx.save();
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 25;
        ctx.shadowColor = this.color;

        // Desenhar uma grande nave alienígena cibernética
        ctx.beginPath();
        ctx.moveTo(this.x, this.y + 20);
        ctx.lineTo(this.x + this.width / 2, this.y + this.height);
        ctx.lineTo(this.x + this.width, this.y + 20);
        ctx.lineTo(this.x + this.width - 20, this.y);
        ctx.lineTo(this.x + 20, this.y);
        ctx.closePath();
        ctx.fill();

        // Núcleo brilhante
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#00f3ff';
        ctx.beginPath();
        ctx.arc(this.x + this.width / 2, this.y + 25, 12, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

class Bullet {
    constructor(x, y, angleOffset = 0) {
        this.x = x;
        this.y = y;
        this.width = 4;
        this.height = 16;
        this.color = '#00f3ff';
        this.angleOffset = angleOffset; // para disparos angulares se necessário
    }

    update() {
        this.y -= BULLET_SPEED;
        this.x += this.angleOffset;
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

class EnemyBullet {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 6;
        this.height = 14;
        this.color = '#ff9800'; // Cor de projétil inimigo (laranja neon)
    }

    update() {
        this.y += ENEMY_BULLET_SPEED;
    }

    draw() {
        ctx.save();
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 12;
        ctx.shadowColor = this.color;
        ctx.fillRect(this.x - this.width / 2, this.y, this.width, this.height);
        ctx.restore();
    }

    isOffScreen() {
        return this.y > canvas.height;
    }
}

class PowerUp {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 25;
        this.height = 25;
        
        const rand = Math.random();
        if (rand < 0.35) {
            this.type = 'shield';
            this.emoji = '🛡️';
            this.color = '#00f3ff';
        } else if (rand < 0.7) {
            this.type = 'double';
            this.emoji = '⚡';
            this.color = '#ffff00';
        } else {
            this.type = 'heart';
            this.emoji = '❤️';
            this.color = '#ff0055';
        }
    }

    update() {
        this.y += POWERUP_SPEED;
    }

    draw() {
        ctx.save();
        // Brilho do powerup
        ctx.shadowBlur = 20;
        ctx.shadowColor = this.color;

        ctx.font = '22px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.emoji, this.x, this.y);
        ctx.restore();
    }

    isOffScreen() {
        return this.y > canvas.height + 40;
    }
}

// Game Functions
function triggerScreenShake() {
    document.body.classList.add('shake');
    setTimeout(() => document.body.classList.remove('shake'), 400);
}

function updatePlayer() {
    if (landmarksDetected && !faceCalibrating) {
        // Mapear gazeOffset como um joystick analógico
        const deadZone = 0.04;
        let speedFactor = 0;
        
        if (gazeOffset > deadZone) {
            // Olhando para a direita (coordenada X do olho aumenta)
            speedFactor = Math.min(1.0, (gazeOffset - deadZone) / 0.12);
            player.x += player.speed * speedFactor;
        } else if (gazeOffset < -deadZone) {
            // Olhando para a esquerda (coordenada X do olho diminui)
            speedFactor = Math.min(1.0, (-gazeOffset - deadZone) / 0.12);
            player.x -= player.speed * speedFactor;
        }
        
        // Limitar dentro das bordas
        player.x = Math.max(player.width / 2, Math.min(canvas.width - player.width / 2, player.x));
    }
}

function shoot() {
    const now = Date.now();
    if (isShooting && now - lastShootTime > SHOOT_COOLDOWN) {
        Sound.playLaser();

        if (doubleLaserActive) {
            // Disparar dois lasers paralelos
            bullets.push(new Bullet(player.x - 15, player.y - player.height / 2));
            bullets.push(new Bullet(player.x + 15, player.y - player.height / 2));
            particleManager.createExplosion(player.x - 15, player.y - 20, '#ffff00', 3);
            particleManager.createExplosion(player.x + 15, player.y - 20, '#ffff00', 3);
        } else {
            // Disparo único comum
            bullets.push(new Bullet(player.x, player.y - player.height / 2));
            particleManager.createExplosion(player.x, player.y - 20, '#00f3ff', 4);
        }
        
        lastShootTime = now;
    }
}

function spawnEnemy() {
    const now = Date.now();
    // Apenas spawna inimigos se o chefão não estiver ativo
    if (!activeBoss && now - lastEnemySpawn > ENEMY_SPAWN_INTERVAL) {
        // Chance de spawnar inimigo rápido zigue-zague
        const type = Math.random() < 0.3 ? 'fast' : 'basic';
        enemies.push(new Enemy(type));
        lastEnemySpawn = now;
    }
}

function checkBossSpawn() {
    // Spawna Boss a cada 200 pontos se não houver um ativo
    if (score > 0 && score % 200 === 0 && !activeBoss) {
        activeBoss = new BossEnemy();
        document.getElementById('bossUI').style.display = 'block';
        updateBossUI();
        Sound.playBeep(440, 0.4); // Alarme do Boss
    }
}

function updateBossUI() {
    if (activeBoss) {
        const percent = (activeBoss.hp / activeBoss.maxHp) * 100;
        document.getElementById('bossBar').style.width = `${percent}%`;
    }
}

function checkCollisions() {
    // 1. Projéteis do Jogador vs Inimigos normais
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        for (let j = enemies.length - 1; j >= 0; j--) {
            const enemy = enemies[j];

            if (bullet && enemy &&
                bullet.x > enemy.x &&
                bullet.x < enemy.x + enemy.width &&
                bullet.y > enemy.y &&
                bullet.y < enemy.y + enemy.height) {

                Sound.playExplosion();
                particleManager.createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, enemy.color, 20);

                // Chance de dropar um Power-Up!
                if (Math.random() < 0.22) {
                    powerUps.push(new PowerUp(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2));
                }

                enemies.splice(j, 1);
                bullets.splice(i, 1);
                score += 10;
                updateScore();
                checkBossSpawn();
                break;
            }
        }
    }

    // 2. Projéteis do Jogador vs Chefão (Boss)
    if (activeBoss) {
        for (let i = bullets.length - 1; i >= 0; i--) {
            const bullet = bullets[i];
            if (bullet.x > activeBoss.x &&
                bullet.x < activeBoss.x + activeBoss.width &&
                bullet.y > activeBoss.y &&
                bullet.y < activeBoss.y + activeBoss.height) {

                bullets.splice(i, 1);
                activeBoss.hp -= 4; // Dano do laser
                updateBossUI();

                particleManager.createExplosion(bullet.x, bullet.y, '#ffffff', 5);

                if (activeBoss.hp <= 0) {
                    // Boss Destruído!
                    Sound.playExplosion();
                    triggerScreenShake();
                    particleManager.createExplosion(activeBoss.x + activeBoss.width / 2, activeBoss.y + activeBoss.height / 2, '#b537ff', 50);
                    particleManager.createExplosion(activeBoss.x + activeBoss.width / 2, activeBoss.y + activeBoss.height / 2, '#00f3ff', 30);
                    
                    activeBoss = null;
                    document.getElementById('bossUI').style.display = 'none';
                    score += 100; // Super bônus
                    updateScore();
                }
                break;
            }
        }
    }

    // 3. Projéteis do Inimigo vs Jogador
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const eBullet = enemyBullets[i];
        const dist = distance(
            { x: player.x, y: player.y },
            { x: eBullet.x, y: eBullet.y }
        );

        if (dist < player.width / 2 + 5) {
            enemyBullets.splice(i, 1);
            playerHit();
        }
    }

    // 4. Inimigo normal vs Jogador (Colisão direta)
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        const dist = distance(
            { x: player.x, y: player.y },
            { x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height / 2 }
        );

        if (dist < (player.width + enemy.width) / 2.2) {
            particleManager.createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, enemy.color, 25);
            enemies.splice(i, 1);
            playerHit();
        }
    }

    // 5. Chefão vs Jogador (Colisão direta)
    if (activeBoss) {
        const dist = distance(
            { x: player.x, y: player.y },
            { x: activeBoss.x + activeBoss.width / 2, y: activeBoss.y + activeBoss.height / 2 }
        );

        if (dist < (player.width + activeBoss.width) / 2.5) {
            playerHit();
        }
    }

    // 6. Jogador coleta Power-Ups
    for (let i = powerUps.length - 1; i >= 0; i--) {
        const pUp = powerUps[i];
        const dist = distance(
            { x: player.x, y: player.y },
            { x: pUp.x, y: pUp.y }
        );

        if (dist < player.width / 2 + 15) {
            Sound.playPowerup();
            particleManager.createExplosion(pUp.x, pUp.y, pUp.color, 20);

            if (pUp.type === 'shield') {
                shieldActive = true;
            } else if (pUp.type === 'double') {
                doubleLaserActive = true;
                doubleLaserTimer = Date.now();
            } else if (pUp.type === 'heart') {
                if (lives < 5) { // Limite máximo de 5 vidas
                    lives++;
                    updateLives();
                }
            }

            powerUps.splice(i, 1);
        }
    }
}

function playerHit() {
    if (shieldActive) {
        shieldActive = false; // Escudo absorve o dano!
        Sound.playBeep(900, 0.25);
        particleManager.createExplosion(player.x, player.y, '#00f3ff', 25);
        return;
    }

    // Levar dano real
    Sound.playExplosion();
    triggerScreenShake();
    particleManager.createExplosion(player.x, player.y, '#ff0055', 30);
    
    lives--;
    updateLives();

    if (lives <= 0) {
        gameOver();
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
    document.getElementById('bossUI').style.display = 'none';

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

    updatePlayer();
    shoot();
    spawnEnemy();

    // Checar expiração do Double Laser
    if (doubleLaserActive && Date.now() - doubleLaserTimer > DOUBLE_LASER_DURATION) {
        doubleLaserActive = false;
    }

    // Atualizar projéteis do jogador
    for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].update();
        if (bullets[i].isOffScreen()) {
            bullets.splice(i, 1);
        }
    }

    // Atualizar projéteis dos inimigos
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        enemyBullets[i].update();
        if (enemyBullets[i].isOffScreen()) {
            enemyBullets.splice(i, 1);
        }
    }

    // Atualizar inimigos comuns
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        enemy.update();
        if (enemy.isOffScreen()) {
            enemies.splice(i, 1);
            // Inimigo passando tira 1 vida!
            playerHit();
        }
    }

    // Atualizar Chefão
    if (activeBoss) {
        activeBoss.update();
    }

    // Atualizar Power-ups
    for (let i = powerUps.length - 1; i >= 0; i--) {
        powerUps[i].update();
        if (powerUps[i].isOffScreen()) {
            powerUps.splice(i, 1);
        }
    }

    checkCollisions();
    particleManager.update();
}

function drawPlayer() {
    ctx.save();
    ctx.fillStyle = player.color;
    ctx.shadowBlur = 20;
    ctx.shadowColor = player.color;

    // Desenhar nave cibernética futurista detalhada
    ctx.beginPath();
    ctx.moveTo(player.x, player.y - player.height / 2);
    ctx.lineTo(player.x - player.width / 2, player.y + player.height / 2);
    ctx.lineTo(player.x - player.width / 6, player.y + player.height / 3);
    ctx.lineTo(player.x + player.width / 6, player.y + player.height / 3);
    ctx.lineTo(player.x + player.width / 2, player.y + player.height / 2);
    ctx.closePath();
    ctx.fill();

    // Propulsor de fogo neon traseiro
    const jetColor = Math.random() > 0.5 ? '#ff0055' : '#ffff00';
    ctx.fillStyle = jetColor;
    ctx.shadowColor = jetColor;
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.moveTo(player.x - 8, player.y + player.height / 3);
    ctx.lineTo(player.x, player.y + player.height / 3 + 15 + Math.random() * 10);
    ctx.lineTo(player.x + 8, player.y + player.height / 3);
    ctx.closePath();
    ctx.fill();

    // Desenhar o Escudo de energia ao redor da nave se ativo
    if (shieldActive) {
        ctx.strokeStyle = '#00f3ff';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#00f3ff';
        ctx.shadowBlur = 25;
        ctx.fillStyle = 'rgba(0, 243, 255, 0.08)';
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.width - 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    ctx.restore();
}

function drawHUD() {
    // Desenha na tela se o Double Laser estiver ativo
    if (doubleLaserActive) {
        const timeRemaining = DOUBLE_LASER_DURATION - (Date.now() - doubleLaserTimer);
        const percent = (timeRemaining / DOUBLE_LASER_DURATION) * 100;
        
        ctx.save();
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2;
        ctx.strokeRect(player.x - 30, player.y + player.height / 2 + 12, 60, 6);
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(player.x - 30, player.y + player.height / 2 + 12, 60 * (percent / 100), 6);
        ctx.restore();
    }

    // Overlay de Calibração Basal de Rosto
    if (faceCalibrating) {
        ctx.save();
        ctx.fillStyle = 'rgba(5, 5, 8, 0.85)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Moldura Neon
        ctx.strokeStyle = '#00f3ff';
        ctx.lineWidth = 3;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00f3ff';
        ctx.strokeRect(50, 50, canvas.width - 100, canvas.height - 100);

        // Texto de Instruções
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText('CALIBRANDO RASTREAMENTO FACIAL...', canvas.width / 2, canvas.height / 2 - 50);

        ctx.font = '16px Inter';
        ctx.fillStyle = '#a0aec0';
        ctx.fillText('Por favor, olhe para o centro da tela e mantenha o rosto neutro', canvas.width / 2, canvas.height / 2 - 10);

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
        // Indicador horizontal visual do olhar no rodapé
        ctx.save();
        const hudY = canvas.height - 25;
        const barW = 200;
        const hudX = canvas.width / 2 - barW / 2;

        // Fundo cinza escuro
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(hudX, hudY, barW, 6);

        // Mapear gazeOffset (-0.12 a 0.12) para a largura do barW
        const mappedOffset = Math.max(-0.12, Math.min(0.12, gazeOffset));
        const indicatorX = hudX + barW / 2 + (mappedOffset / 0.12) * (barW / 2);

        // Indicador central (neutro)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(canvas.width / 2 - 1, hudY - 3, 2, 12);

        // Cursor do olhar
        ctx.fillStyle = '#00f3ff';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00f3ff';
        ctx.beginPath();
        ctx.arc(indicatorX, hudY + 3, 5, 0, Math.PI * 2);
        ctx.fill();

        // Feedback de Tiro/Inclinação vertical
        ctx.fillStyle = headLiftOffset > 0.022 ? '#00f3ff' : '#a0aec0';
        ctx.font = 'bold 12px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText(`ATITUDE DE DISPARO: ${headLiftOffset > 0.022 ? 'ATIVADA 🔥' : 'NEUTRA'}`, canvas.width / 2, hudY - 12);

        ctx.restore();
    }
}

function draw() {
    // Clear com rastro
    ctx.fillStyle = 'rgba(7, 7, 15, 0.28)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Fundo de estrelas rolando
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    for (let i = 0; i < 45; i++) {
        const x = (i * 257) % canvas.width;
        const y = (i * 397 + Date.now() * 0.12) % canvas.height;
        ctx.fillRect(x, y, 1.5, 1.5);
    }

    particleManager.draw(ctx);

    // Projéteis
    bullets.forEach(bullet => bullet.draw());
    enemyBullets.forEach(ebullet => ebullet.draw());

    // Inimigos e Chefão
    enemies.forEach(enemy => enemy.draw());
    if (activeBoss) {
        activeBoss.draw();
    }

    // Power-ups
    powerUps.forEach(pUp => pUp.draw());

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

// Start Game
document.getElementById('startBtn').addEventListener('click', async () => {
    document.getElementById('controls').style.display = 'none';
    createBackButton();

    Sound.playPowerup();

    await camera.start();

    gameRunning = true;
    score = 0;
    lives = 3;
    shieldActive = false;
    doubleLaserActive = false;
    activeBoss = null;
    document.getElementById('bossUI').style.display = 'none';
    bullets.length = 0;
    enemyBullets.length = 0;
    enemies.length = 0;
    powerUps.length = 0;
    lastEnemySpawn = Date.now();
    updateScore();
    updateLives();

    // Resetar calibração
    faceCalibrating = true;
    faceCalibrationFrames = [];
});

// Initial Render
draw();
gameLoop();
