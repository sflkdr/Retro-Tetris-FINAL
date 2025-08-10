// --- Game Setup ---
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const nextPieceCanvas = document.getElementById('next-piece-canvas');
const nextCtx = nextPieceCanvas.getContext('2d');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const stopBtn = document.getElementById('stop-btn');
const scoreSpan = document.getElementById('score');
const levelSpan = document.getElementById('level');
const highscoreSpan = document.getElementById('high-score');
const messageBox = document.getElementById('message-box');
const messageText = document.getElementById('message-text');
const messageOkBtn = document.getElementById('message-ok-btn');

// Touch controls
const leftBtn = document.getElementById('left-btn');
const rightBtn = document.getElementById('right-btn');
const rotateBtn = document.getElementById('rotate-btn');
const dropBtn = document.getElementById('drop-btn');

const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = canvas.width / COLS;
const NEXT_PIECE_SIZE = nextPieceCanvas.width / 4;
let board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));

let score = 0;
let level = 1;
let highscore = localStorage.getItem('tetris-highscore') || 0;
let isPaused = false;
let gameOver = false;
let animationId;
let dropCounter = 0;
let dropInterval = 1000;
let lastTime = 0;
let currentPiece = null;
let nextPiece = null;

const COLORS = [
    null, '#4285f4', '#ea4335', '#fbbc05', '#34a853', '#f28b82', '#a1c1d8', '#fed766'
];

// Tetromino shapes (with color index)
const PIECES = [
    { shape: [[1,1,1,1]], color: 1 }, // I
    { shape: [[1,1,1],[0,1,0]], color: 2 }, // T
    { shape: [[1,1,0],[0,1,1]], color: 3 }, // S
    { shape: [[0,1,1],[1,1,0]], color: 4 }, // Z
    { shape: [[1,1],[1,1]], color: 5 }, // O
    { shape: [[1,1,1],[1,0,0]], color: 6 }, // L
    { shape: [[1,1,1],[0,0,1]], color: 7 }  // J
];

// --- Audio Setup (using Tone.js) ---
let musicSynth, sfxSynth;
let musicLoop;
let isAudioReady = false;

const setupAudio = () => {
    musicSynth = new Tone.Synth().toDestination();
    sfxSynth = new Tone.PolySynth().toDestination();

    // Simple ascending arpeggio as background music
    const pattern = new Tone.Pattern((time, note) => {
        musicSynth.triggerAttackRelease(note, '8n', time);
    }, ['C4', 'E4', 'G4', 'B4', 'C5', 'B4', 'G4', 'E4']);
    pattern.interval = '4n';
    pattern.start(0);
    musicLoop = pattern;

    // Start the audio context on user interaction
    document.body.addEventListener('click', () => {
        if (!isAudioReady) {
            Tone.start();
            isAudioReady = true;
            // Play a short sound to confirm audio is active
            sfxSynth.triggerAttackRelease('C5', '16n');
        }
    }, { once: true });
};

const playSfx = (notes, duration) => {
    if (isAudioReady) {
        sfxSynth.triggerAttackRelease(notes, duration);
    }
};

const playMusic = () => {
    if (isAudioReady) {
        Tone.Transport.start();
    }
};

const stopMusic = () => {
    if (isAudioReady) {
        Tone.Transport.stop();
    }
};

// --- Game Logic ---

// Randomly get a new piece
const getNewPiece = () => {
    const randomPiece = PIECES[Math.floor(Math.random() * PIECES.length)];
    return {
        shape: randomPiece.shape,
        color: randomPiece.color,
        x: Math.floor(COLS / 2) - Math.floor(randomPiece.shape[0].length / 2),
        y: 0
    };
};

// Initial setup
const resetGame = () => {
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    score = 0;
    level = 1;
    isPaused = false;
    gameOver = false;
    dropInterval = 1000;
    currentPiece = getNewPiece();
    nextPiece = getNewPiece();
    updateUI();
};

// Draw a single block
const drawBlock = (x, y, colorIndex, context, blockSize) => {
    context.fillStyle = COLORS[colorIndex];
    context.fillRect(x * blockSize, y * blockSize, blockSize, blockSize);
    context.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    context.strokeRect(x * blockSize, y * blockSize, blockSize, blockSize);
};

// Draw the entire board
const drawBoard = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c] !== null) {
                drawBlock(c, r, board[r][c], ctx, BLOCK_SIZE);
            }
        }
    }
};

// Draw the current piece
const drawPiece = (piece) => {
    if (!piece) return;
    for (let r = 0; r < piece.shape.length; r++) {
        for (let c = 0; c < piece.shape[r].length; c++) {
            if (piece.shape[r][c]) {
                drawBlock(piece.x + c, piece.y + r, piece.color, ctx, BLOCK_SIZE);
            }
        }
    }
};

// Draw the next piece preview
const drawNextPiece = () => {
    nextCtx.clearRect(0, 0, nextPieceCanvas.width, nextPieceCanvas.height);
    if (!nextPiece) return;
    const piece = nextPiece;
    const xOffset = (4 - piece.shape[0].length) / 2;
    const yOffset = (4 - piece.shape.length) / 2;

    for (let r = 0; r < piece.shape.length; r++) {
        for (let c = 0; c < piece.shape[r].length; c++) {
            if (piece.shape[r][c]) {
                drawBlock(c + xOffset, r + yOffset, piece.color, nextCtx, NEXT_PIECE_SIZE);
            }
        }
    }
};

// Check for collision
const checkCollision = (piece, newX, newY) => {
    for (let r = 0; r < piece.shape.length; r++) {
        for (let c = 0; c < piece.shape[r].length; c++) {
            if (piece.shape[r][c]) {
                const boardX = newX + c;
                const boardY = newY + r;

                if (boardX < 0 || boardX >= COLS || boardY >= ROWS) {
                    return true; // Wall or floor collision
                }
                if (boardY < 0) {
                    continue; // Ignore collisions above the board
                }
                if (board[boardY][boardX] !== null) {
                    return true; // Block collision
                }
            }
        }
    }
    return false;
};

// Lock the piece in place
const lockPiece = () => {
    for (let r = 0; r < currentPiece.shape.length; r++) {
        for (let c = 0; c < currentPiece.shape[r].length; c++) {
            if (currentPiece.shape[r][c]) {
                const boardX = currentPiece.x + c;
                const boardY = currentPiece.y + r;
                if (boardY < 0) {
                    // Game over if piece locks above the top
                    endGame();
                    return;
                }
                board[boardY][boardX] = currentPiece.color;
            }
        }
    }

    checkLines();
    playSfx(['G5'], '8n'); // Sound for piece lock
    currentPiece = nextPiece;
    nextPiece = getNewPiece();
    drawNextPiece();

    if (checkCollision(currentPiece, currentPiece.x, currentPiece.y)) {
        endGame();
    }
};

// Rotate the current piece
const rotatePiece = () => {
    if (gameOver || isPaused) return;

    const originalShape = currentPiece.shape;
    const rotatedShape = originalShape[0].map((_, index) => originalShape.map(row => row[index]).reverse());
    const newPiece = { ...currentPiece, shape: rotatedShape };

    // Wall kick logic
    const kicks = [
        [0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]
    ];
    for (let i = 0; i < kicks.length; i++) {
        const [dx, dy] = kicks[i];
        if (!checkCollision(newPiece, currentPiece.x + dx, currentPiece.y + dy)) {
            currentPiece.shape = rotatedShape;
            currentPiece.x += dx;
            currentPiece.y += dy;
            playSfx(['A5'], '16n'); // Rotation sound
            break;
        }
    }
};

// Move the piece left/right
const movePiece = (direction) => {
    if (gameOver || isPaused) return;
    const newX = currentPiece.x + direction;
    if (!checkCollision(currentPiece, newX, currentPiece.y)) {
        currentPiece.x = newX;
        playSfx(['C5'], '32n'); // Movement sound
    }
};

// Drop the piece
const dropPiece = () => {
    if (gameOver || isPaused) return;
    const newY = currentPiece.y + 1;
    if (!checkCollision(currentPiece, currentPiece.x, newY)) {
        currentPiece.y = newY;
    } else {
        lockPiece();
    }
};

// Handle line clearing
const checkLines = () => {
    let linesCleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r].every(cell => cell !== null)) {
            linesCleared++;
            board.splice(r, 1);
            board.unshift(Array(COLS).fill(null));
            r++;
        }
    }
    if (linesCleared > 0) {
        // Scoring system
        const lineScores = [0, 100, 300, 500, 800];
        score += lineScores[linesCleared] * level;

        // Level up
        level = 1 + Math.floor(score / 1000);
        dropInterval = 1000 - (level - 1) * 50;
        if (dropInterval < 100) dropInterval = 100;

        // Sound for line clear
        const sfxNotes = linesCleared === 1 ? 'E5' : linesCleared === 2 ? ['E5', 'G5'] : linesCleared === 3 ? ['E5', 'G5', 'C6'] : ['E5', 'G5', 'C6', 'E6'];
        playSfx(sfxNotes, '8n');

        updateUI();
    }
};

const updateUI = () => {
    scoreSpan.textContent = score;
    levelSpan.textContent = level;
    highscoreSpan.textContent = highscore;
};

const showMessage = (text, callback) => {
    messageText.textContent = text;
    messageBox.style.display = 'flex';
    messageOkBtn.onclick = () => {
        messageBox.style.display = 'none';
        if (callback) callback();
    };
};

const endGame = () => {
    cancelAnimationFrame(animationId);
    gameOver = true;
    stopMusic();
    playSfx(['C3', 'G3', 'C4'], '4n'); // Game over sound

    if (score > highscore) {
        highscore = score;
        localStorage.setItem('tetris-highscore', highscore);
        showMessage(`New High Score: ${highscore}!`, () => {
            highscoreSpan.textContent = highscore;
        });
    } else {
        showMessage(`Game Over! Your Score: ${score}`);
    }
    startBtn.textContent = 'Restart';
};

// --- Game Loop ---
const gameLoop = (timestamp) => {
    if (gameOver || isPaused) return;

    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;
    dropCounter += deltaTime;

    if (dropCounter > dropInterval) {
        dropPiece();
        dropCounter = 0;
    }

    drawBoard();
    drawPiece(currentPiece);
    animationId = requestAnimationFrame(gameLoop);
};

// --- Event Listeners ---
const handleKeyDown = (e) => {
    if (gameOver || isPaused) return;
    switch (e.key) {
        case 'ArrowLeft':
            e.preventDefault();
            movePiece(-1);
            break;
        case 'ArrowRight':
            e.preventDefault();
            movePiece(1);
            break;
        case 'ArrowUp':
            e.preventDefault();
            rotatePiece();
            break;
        case 'ArrowDown':
            e.preventDefault();
            dropPiece();
            break;
        case ' ': // Hard drop
            e.preventDefault();
            while (!checkCollision(currentPiece, currentPiece.x, currentPiece.y + 1)) {
                currentPiece.y++;
            }
            lockPiece();
            break;
    }
};

const handleTouch = (action) => {
    if (gameOver || isPaused) return;
    switch(action) {
        case 'left':
            movePiece(-1);
            break;
        case 'right':
            movePiece(1);
            break;
        case 'rotate':
            rotatePiece();
            break;
        case 'drop':
            dropPiece();
            break;
    }
};

// Button events
startBtn.addEventListener('click', () => {
    if (gameOver) {
        resetGame();
        startGame();
    } else if (isPaused) {
        isPaused = false;
        pauseBtn.textContent = 'Pause';
        startBtn.textContent = 'Start';
        gameLoop(performance.now());
        playMusic();
    } else {
        startGame();
    }
});

pauseBtn.addEventListener('click', () => {
    if (!gameOver) {
        isPaused = !isPaused;
        if (isPaused) {
            pauseBtn.textContent = 'Resume';
            cancelAnimationFrame(animationId);
            stopMusic();
            showMessage('Game Paused');
        } else {
            pauseBtn.textContent = 'Pause';
            gameLoop(performance.now());
            playMusic();
        }
    }
});

stopBtn.addEventListener('click', () => {
    if (!gameOver) {
        cancelAnimationFrame(animationId);
        gameOver = true;
        stopMusic();
        showMessage('Game Stopped');
        startBtn.textContent = 'Restart';
    }
});

// Touch control buttons
leftBtn.addEventListener('click', () => handleTouch('left'));
rightBtn.addEventListener('click', () => handleTouch('right'));
rotateBtn.addEventListener('click', () => handleTouch('rotate'));
dropBtn.addEventListener('click', () => handleTouch('drop'));


// Initial setup and start
const startGame = () => {
    if (animationId) cancelAnimationFrame(animationId);
    resetGame();
    playMusic();

    // Initial drawing
    drawBoard();
    drawPiece(currentPiece);
    drawNextPiece();
    updateUI();

    lastTime = performance.now();
    animationId = requestAnimationFrame(gameLoop);
    startBtn.textContent = 'Playing...';
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    stopBtn.disabled = false;
};

// Add event listener to the document for keyboard input
document.addEventListener('keydown', handleKeyDown);

// Initial setup
window.onload = () => {
    setupAudio();
    highscoreSpan.textContent = highscore;
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    stopBtn.disabled = true;
};
