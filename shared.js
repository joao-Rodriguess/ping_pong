// Shared utilities for all games

// Particle System
class Particle {
    constructor(x, y, color, velocity = null) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.velocity = velocity || {
            x: (Math.random() - 0.5) * 6,
            y: (Math.random() - 0.5) * 6
        };
        this.alpha = 1;
        this.decay = Math.random() * 0.02 + 0.02;
        this.size = Math.random() * 4 + 2;
    }

    update() {
        this.velocity.y += 0.2; // gravity
        this.x += this.velocity.x;
        this.y += this.velocity.y;
        this.alpha -= this.decay;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    isDead() {
        return this.alpha <= 0;
    }
}

// Particle Manager
class ParticleManager {
    constructor() {
        this.particles = [];
    }

    createExplosion(x, y, color, count = 20) {
        for (let i = 0; i < count; i++) {
            this.particles.push(new Particle(x, y, color));
        }
    }

    update() {
        this.particles.forEach(p => p.update());
        this.particles = this.particles.filter(p => !p.isDead());
    }

    draw(ctx) {
        this.particles.forEach(p => p.draw(ctx));
    }

    clear() {
        this.particles = [];
    }
}

// Camera initialization helper
async function initializeCamera(videoElement, onFrame) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480 }
        });
        videoElement.srcObject = stream;
        await videoElement.play();

        if (onFrame) {
            const processFrame = async () => {
                if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
                    await onFrame();
                }
                requestAnimationFrame(processFrame);
            };
            processFrame();
        }

        return true;
    } catch (error) {
        console.error('Camera access denied:', error);
        alert('⚠️ Por favor, permita o acesso à câmera para jogar!');
        return false;
    }
}

// Gesture detection helpers
function isPointingGesture(landmarks) {
    if (!landmarks || landmarks.length < 21) return false;

    // Index finger extended, others curled
    const indexExtended = landmarks[8].y < landmarks[6].y;
    const middleCurled = landmarks[12].y > landmarks[10].y;
    const ringCurled = landmarks[16].y > landmarks[14].y;
    const pinkyCurled = landmarks[20].y > landmarks[18].y;

    return indexExtended && middleCurled && ringCurled && pinkyCurled;
}

function isClosedFist(landmarks) {
    if (!landmarks || landmarks.length < 21) return false;

    // All fingers curled
    const indexCurled = landmarks[8].y > landmarks[6].y;
    const middleCurled = landmarks[12].y > landmarks[10].y;
    const ringCurled = landmarks[16].y > landmarks[14].y;
    const pinkyCurled = landmarks[20].y > landmarks[18].y;

    return indexCurled && middleCurled && ringCurled && pinkyCurled;
}

function isOpenHand(landmarks) {
    if (!landmarks || landmarks.length < 21) return false;

    // All fingers extended (opposite of closed fist)
    const indexExtended = landmarks[8].y < landmarks[6].y;
    const middleExtended = landmarks[12].y < landmarks[10].y;
    const ringExtended = landmarks[16].y < landmarks[14].y;
    const pinkyExtended = landmarks[20].y < landmarks[18].y;

    return indexExtended && middleExtended && ringExtended && pinkyExtended;
}

function isPinchGesture(landmarks) {
    if (!landmarks || landmarks.length < 21) return false;

    // Distance between thumb tip and index tip
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const distance = Math.sqrt(
        Math.pow(thumbTip.x - indexTip.x, 2) +
        Math.pow(thumbTip.y - indexTip.y, 2)
    );

    return distance < 0.05; // Threshold for pinch
}

// Back button component
function createBackButton() {
    const button = document.createElement('button');
    button.className = 'back-button';
    button.innerHTML = '← Voltar';
    button.onclick = () => window.location.href = 'index.html';
    document.body.appendChild(button);
}

// Score display component
function createScoreDisplay(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    return {
        element: container,
        update: (score) => {
            container.textContent = `Score: ${score}`;
        }
    };
}

// Utility: Distance between two points
function distance(p1, p2) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

// Utility: Check collision between two rectangles
function rectCollision(r1, r2) {
    return r1.x < r2.x + r2.width &&
        r1.x + r1.width > r2.x &&
        r1.y < r2.y + r2.height &&
        r1.y + r1.height > r2.y;
}

// Utility: Random number in range
function random(min, max) {
    return Math.random() * (max - min) + min;
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        Particle,
        ParticleManager,
        initializeCamera,
        isPointingGesture,
        isClosedFist,
        isOpenHand,
        isPinchGesture,
        createBackButton,
        createScoreDisplay,
        distance,
        rectCollision,
        random
    };
}
