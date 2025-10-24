document.addEventListener('DOMContentLoaded', () => {

    // --- 1. Setup & Constants ---
    
    const canvas = document.getElementById('game-board');
    const context = canvas.getContext('2d');
    const nextCanvas = document.getElementById('next-piece');
    const nextContext = nextCanvas.getContext('2d');
    
    const scoreElement = document.getElementById('score');
    const levelElement = document.getElementById('level');
    const startButton = document.getElementById('start-button');

    const COLS = 10;
    const ROWS = 20;
    const BLOCK_SIZE = 30;
    const NEXT_BLOCK_SIZE = 20;

    // Set canvas dimensions
    canvas.width = COLS * BLOCK_SIZE;
    canvas.height = ROWS * BLOCK_SIZE;
    nextCanvas.width = 6 * NEXT_BLOCK_SIZE; // Centering 4x4 in a 6x6 grid
    nextCanvas.height = 6 * NEXT_BLOCK_SIZE;

    const COLORS = {
        'I': '#00ffff', // cyan
        'O': '#ffff00', // yellow
        'T': '#ff00ff', // magenta
        'S': '#00ff00', // lime
        'Z': '#ff0000', // red
        'J': '#0000ff', // blue
        'L': '#ff8000'  // orange
    };

    const SHAPES = {
        'I': [[0,0,0,0], [1,1,1,1], [0,0,0,0], [0,0,0,0]],
        'O': [[1,1], [1,1]],
        'T': [[0,1,0], [1,1,1], [0,0,0]],
        'S': [[0,1,1], [1,1,0], [0,0,0]],
        'Z': [[1,1,0], [0,1,1], [0,0,0]],
        'J': [[1,0,0], [1,1,1], [0,0,0]],
        'L': [[0,0,1], [1,1,1], [0,0,0]]
    };

    const PIECE_TYPES = 'IOTSZJL';
    
    const SCORE_POINTS = { 1: 40, 2: 100, 3: 300, 4: 1200 };
    const LINES_PER_LEVEL = 10;

    let board;
    let player;
    let nextPiece;
    let pieceBag;
    let score;
    let level;
    let lines;
    let gameOver;
    
    let lastTime;
    let dropCounter;
    let dropInterval;
    let gameLoopId;

    // --- 2. Game Piece & Board Logic ---

    function createEmptyBoard() {
        return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    }

    function createPieceBag() {
        let bag = PIECE_TYPES.split('');
        // Shuffle the bag (Fisher-Yates)
        for (let i = bag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [bag[i], bag[j]] = [bag[j], bag[i]];
        }
        return bag;
    }

    function getNextPiece() {
        if (!pieceBag || pieceBag.length === 0) {
            pieceBag = createPieceBag();
        }
        const type = pieceBag.pop();
        const matrix = SHAPES[type];
        const color = COLORS[type];
        return {
            matrix: matrix,
            color: color,
            x: 0,
            y: 0
        };
    }

    function resetPlayer() {
        player = nextPiece;
        player.x = Math.floor(COLS / 2) - Math.floor(player.matrix[0].length / 2);
        player.y = 0;
        nextPiece = getNextPiece();

        if (checkCollision(player, board)) {
            gameOver = true;
        }
    }

    // --- 3. Collision Detection & Rotation ---

    function checkCollision(piece, gameBoard) {
        for (let y = 0; y < piece.matrix.length; y++) {
            for (let x = 0; x < piece.matrix[y].length; x++) {
                if (piece.matrix[y][x] !== 0) {
                    let newX = piece.x + x;
                    let newY = piece.y + y;

                    // Check wall collision
                    if (newX < 0 || newX >= COLS || newY >= ROWS) {
                        return true;
                    }
                    // Check other pieces or bottom collision
                    if (gameBoard[newY] && gameBoard[newY][newX] !== 0) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    function rotate(matrix) {
        // Transpose + reverse rows
        const newMatrix = matrix[0].map((_, i) => matrix.map(row => row[i]));
        return newMatrix.map(row => row.reverse());
    }

    function playerRotate() {
        const oldMatrix = player.matrix;
        player.matrix = rotate(player.matrix);

        // Wall kick logic
        let offset = 1;
        while (checkCollision(player, board)) {
            player.x += offset;
            offset = -(offset + (offset > 0 ? 1 : -1));
            if (offset > player.matrix[0].length) {
                // Rotation failed, revert
                player.matrix = oldMatrix;
                player.x -= (offset - 1); // Revert x position
                return;
            }
        }
    }

    function playerMove(dir) {
        player.x += dir;
        if (checkCollision(player, board)) {
            player.x -= dir; // Move back
        }
    }

    function playerDrop() {
        player.y++;
        if (checkCollision(player, board)) {
            player.y--;
            mergePieceToBoard();
            sweepLines();
            resetPlayer();
        }
        dropCounter = 0;
    }

    function playerHardDrop() {
        while (!checkCollision(player, board)) {
            player.y++;
        }
        player.y--; // Move back to last valid position
        playerDrop(); // Triggers merge, line clear, etc.
    }

    // --- 4. Board & Score Logic ---

    function mergePieceToBoard() {
        player.matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    board[player.y + y][player.x + x] = player.color;
                }
            });
        });
    }

    function sweepLines() {
        let linesCleared = 0;
        outer: for (let y = ROWS - 1; y > 0; y--) {
            for (let x = 0; x < COLS; x++) {
                if (board[y][x] === 0) {
                    continue outer; // Row is not full
                }
            }

            // If we get here, row is full
            const removedRow = board.splice(y, 1)[0].fill(0);
            board.unshift(removedRow);
            linesCleared++;
            y++; // Check the same y-index again (new row)
        }
        
        if (linesCleared > 0) {
            updateScore(linesCleared);
        }
    }

    function updateScore(cleared) {
        score += SCORE_POINTS[cleared] * (level + 1);
        lines += cleared;
        if (lines >= LINES_PER_LEVEL) {
            level++;
            lines -= LINES_PER_LEVEL;
            // Increase speed (decrease drop interval), with a min cap
            dropInterval = Math.max(100, 1000 - level * 50);
        }
        scoreElement.innerText = score;
        levelElement.innerText = level;
    }

    // --- 5. Drawing (The Neon Look) ---

    function drawBlock(ctx, x, y, color, blockSize) {
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        
        ctx.fillRect(x * blockSize, y * blockSize, blockSize, blockSize);

        // Add a subtle inner highlight for the "tube" effect
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fillRect(x * blockSize + blockSize * 0.1, 
                     y * blockSize + blockSize * 0.1, 
                     blockSize * 0.8, 
                     blockSize * 0.8);

        // Reset shadow
        ctx.shadowBlur = 0;
    }

    function drawMatrix(ctx, matrix, offset, color, blockSize) {
        matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    drawBlock(ctx, offset.x + x, offset.y + y, color, blockSize);
                }
            });
        });
    }

    function drawBoard() {
        board.forEach((row, y) => {
            row.forEach((color, x) => {
                if (color !== 0) {
                    drawBlock(context, x, y, color, BLOCK_SIZE);
                }
            });
        });
    }

    function drawNextPiece() {
        // Clear next piece canvas
        nextContext.fillStyle = '#0a0a0a';
        nextContext.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
        
        // Calculate centered offset
        const matrix = nextPiece.matrix;
        const offsetX = Math.floor((6 - matrix[0].length) / 2);
        const offsetY = Math.floor((6 - matrix.length) / 2);
        
        drawMatrix(nextContext, matrix, {x: offsetX, y: offsetY}, nextPiece.color, NEXT_BLOCK_SIZE);
    }
    
    function drawGameOver() {
        context.fillStyle = 'rgba(0, 0, 0, 0.75)';
        context.fillRect(0, canvas.height / 3, canvas.width, canvas.height / 3);
        
        context.font = "bold 40px 'Orbitron', sans-serif";
        context.textAlign = 'center';
        
        // Glowing "GAME OVER"
        context.fillStyle = '#ff0000';
        context.shadowColor = '#ff0000';
        context.shadowBlur = 10;
        context.fillText('GAME OVER', canvas.width / 2, canvas.height / 2);
        context.shadowBlur = 0;
    }

    function draw() {
        // Clear main canvas
        context.fillStyle = '#0a0a0a';
        context.fillRect(0, 0, canvas.width, canvas.height);

        drawBoard();
        drawMatrix(context, player.matrix, player, player.color, BLOCK_SIZE);
        drawNextPiece();
    }

    // --- 6. Game Loop ---
    
    function gameLoop(time = 0) {
        if (gameOver) {
            drawGameOver();
            startButton.innerText = "Play Again";
            startButton.disabled = false;
            return;
        }

        const deltaTime = time - lastTime;
        lastTime = time;
        
        dropCounter += deltaTime;
        if (dropCounter > dropInterval) {
            playerDrop();
        }

        draw();
        gameLoopId = requestAnimationFrame(gameLoop);
    }

    // --- 7. Event Handlers & Initialization ---

    document.addEventListener('keydown', event => {
        if (gameOver) return;

        switch (event.key) {
            case 'ArrowLeft':
                playerMove(-1);
                break;
            case 'ArrowRight':
                playerMove(1);
                break;
            case 'ArrowDown':
                playerDrop();
                break;
            case 'ArrowUp':
                playerRotate();
                break;
            case ' ': // Spacebar
                event.preventDefault(); // Stop page from scrolling
                playerHardDrop();
                break;
        }
        // Redraw immediately on keypress for responsiveness
        draw(); 
    });

    function startGame() {
        // Cancel any existing loop
        if (gameLoopId) {
            cancelAnimationFrame(gameLoopId);
        }

        // Reset game state
        board = createEmptyBoard();
        pieceBag = createPieceBag();
        nextPiece = getNextPiece(); // Pre-load next piece
        resetPlayer(); // This gets the *first* piece

        score = 0;
        level = 0;
        lines = 0;
        gameOver = false;
        dropInterval = 1000; // 1 second
        dropCounter = 0;
        lastTime = 0;

        // Update UI
        scoreElement.innerText = score;
        levelElement.innerText = level;
        startButton.innerText = "Good Luck!";
        startButton.disabled = true;

        // Start the game
        gameLoop();
    }

    startButton.addEventListener('click', startGame);
});
