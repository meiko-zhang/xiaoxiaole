document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const gameBoard = document.getElementById('game-board');
    const levelDisplay = document.getElementById('level');
    const timeLeftDisplay = document.getElementById('time-left');
    const messageBox = document.getElementById('message-box');
    const messageText = document.getElementById('message-text');
    const messageButton = document.getElementById('message-button');

    // Game Constants
    const rows = 9;
    const cols = 9;
    const fruits = ['🍎', '🍌', '🍇', '🍊', '🍓', '🍉'];

    // Level Configuration
    const levels = [
        { level: 1, time: 150, blockers: [] },
        { level: 2, time: 140, blockers: [] },
        { level: 3, time: 130, blockers: [] },
        { level: 4, time: 120, blockers: [] },
        { level: 5, time: 110, blockers: [] },
        { level: 6, time: 100, blockers: [] },
        { level: 7, time: 90, blockers: [] },
        { level: 8, time: 80, blockers: [] },
        { level: 9, time: 70, blockers: [] },
        { level: 10, time: 60, blockers: [] },
    ];

    // Game State
    let board = [];
    let currentLevel = 1;
    let timeLeft = 0;
    let timerInterval = null;
    let draggedCell = null;
    let droppedOnCell = null;
    let isAnimating = true;

    // --- Game Initialization ---
    function startLevel(level) {
        isAnimating = true;
        currentLevel = level;
        const levelConfig = levels[currentLevel - 1];

        timeLeft = levelConfig.time;
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            timeLeft--;
            updateStats();
            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                checkGameState();
            }
        }, 1000);

        updateStats();
        hideMessage();

        board = createBoard(levelConfig.blockers);
        renderBoard();

        let attempts = 0;
        while (true) {
            if (attempts++ > 500) {
                showMessage("Error creating board. Please refresh.", "Refresh", () => location.reload());
                return;
            }
            
            // Fill board with random fruits
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (board[r][c]) {
                        board[r][c].fruit = getRandomFruit();
                        board[r][c].special = null;
                    }
                }
            }

            // Regenerate if there are initial matches or no possible moves
            if (checkForMatches().size > 0) continue;
            if (isBoardSolvable()) break;
        }
        
        updateBoardView();
        isAnimating = false;
    }

    // --- Board & UI Updates ---
    function updateStats() {
        levelDisplay.textContent = currentLevel;
        timeLeftDisplay.textContent = timeLeft;
    }

    function updateBoardView() {
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cellData = board[r][c];
                const cellDiv = document.querySelector(`[data-row='${r}'][data-col='${c}']`);
                if (!cellDiv) continue;

                const fruitSpan = cellDiv.querySelector('.fruit');
                cellDiv.classList.remove('hidden', 'pop', 'fall', 'special-bomb', 'special-line-h', 'special-line-v', 'special-color');

                if (cellData) {
                    fruitSpan.textContent = cellData.fruit || '';
                    if (cellData.special) {
                        cellDiv.classList.add(`special-${cellData.special}`);
                    }
                } else {
                    fruitSpan.textContent = '';
                    cellDiv.classList.add('hidden');
                }
            }
        }
    }

    // --- Core Game Loop (Drag & Drop) ---
    function dragStart(e) {
        if (isAnimating) return;
        draggedCell = e.target.closest('.cell');
    }

    function dragOver(e) {
        e.preventDefault();
    }

    function dragDrop(e) {
        e.preventDefault();
        droppedOnCell = e.target.closest('.cell');
    }

    async function dragEnd() {
        if (isAnimating || !draggedCell || !droppedOnCell) return;

        const fromRow = parseInt(draggedCell.dataset.row);
        const fromCol = parseInt(draggedCell.dataset.col);
        const toRow = parseInt(droppedOnCell.dataset.row);
        const toCol = parseInt(droppedOnCell.dataset.col);

        draggedCell = null;
        droppedOnCell = null;

        const isAdjacent = Math.abs(fromRow - toRow) + Math.abs(fromCol - toCol) === 1;
        if (!isAdjacent) return;

        swapFruits(fromRow, fromCol, toRow, toCol);
        updateBoardView();
        await sleep(100);

        const matches = checkForMatches();
        
        // Handle special fruit combinations
        const cell1 = board[fromRow][fromCol];
        const cell2 = board[toRow][toCol];
        if (cell1?.special && cell2?.special) {
            // This is a special case, clear both and trigger a big effect
            const combinedMatches = new Set([`${fromRow}-${fromCol}`, `${toRow}-${toCol}`]);
            // For simplicity, we'll just clear a large area for any special combo
            getSpecialActivationMatches(fromRow, fromCol, 'bomb').forEach(m => combinedMatches.add(m));
            getSpecialActivationMatches(toRow, toCol, 'bomb').forEach(m => combinedMatches.add(m));
            
            isAnimating = true;
            await gameLoop(combinedMatches, null);
            isAnimating = false;
            checkGameState();
            return;
        }


        if (matches.size > 0) {
            isAnimating = true;
            await gameLoop(matches, { r: toRow, c: toCol, swappedWith: {r: fromRow, c: fromCol} });
            isAnimating = false;
            checkGameState();
        } else {
            // No match, swap back
            swapFruits(fromRow, fromCol, toRow, toCol);
            updateBoardView();
        }
    }

    async function gameLoop(initialMatches, swapInfo) {
        let matchesToProcess = new Set(initialMatches);
        
        while (matchesToProcess.size > 0) {
            const specialFruitToCreate = getSpecialFruitToCreate(matchesToProcess, swapInfo);
            
            const activationQueue = new Set();
            matchesToProcess.forEach(key => {
                const [r, c] = key.split('-').map(Number);
                if (board[r][c]?.special) {
                    activationQueue.add(key);
                }
            });

            if (activationQueue.size > 0) {
                activationQueue.forEach(key => {
                    const [r, c] = key.split('-').map(Number);
                    const specialType = board[r][c].special;
                    getSpecialActivationMatches(r, c, specialType).forEach(mKey => matchesToProcess.add(mKey));
                });
            }
            
            await removeMatches(matchesToProcess);
            
            if (specialFruitToCreate) {
                createSpecialFruit(specialFruitToCreate);
            }

            await sleep(300);
            await dropFruits();
            await sleep(300);

            matchesToProcess = checkForMatches();
            swapInfo = null; // Only use swapInfo for the very first match
        }

        let shuffleAttempts = 0;
        while (!isBoardSolvable() && !isBoardEmpty()) {
            if (shuffleAttempts++ > 50) {
                 showMessage("Error: Cannot find a solvable move.", "Restart", () => startLevel(currentLevel));
                 return;
            }
            await showMessage("No more moves, shuffling...", null, true);
            await sleep(1500);
            shuffleBoard();
            hideMessage();
            
            let matchesAfterShuffle = checkForMatches();
            if(matchesAfterShuffle.size > 0) {
                await gameLoop(matchesAfterShuffle, null);
            }
        }
    }

    // --- Game State Checks ---
    function checkGameState() {
        if (isBoardEmpty()) {
            isAnimating = true;
            clearInterval(timerInterval);
            const isLastLevel = currentLevel === levels.length;
            showMessage(
                isLastLevel ? "恭喜你，全部通关！" : `第 ${currentLevel} 关通过！`,
                isLastLevel ? "重新开始" : "下一关",
                () => {
                    if (isLastLevel) startLevel(1);
                    else startLevel(currentLevel + 1);
                }
            );
        } else if (timeLeft <= 0) {
            isAnimating = true;
            clearInterval(timerInterval);
            showMessage("游戏结束！", "再试一次", () => startLevel(currentLevel));
        }
    }

    // --- Board Creation & Rendering ---
    function createBoard() {
        const newBoard = [];
        for (let r = 0; r < rows; r++) {
            newBoard[r] = [];
            for (let c = 0; c < cols; c++) {
                newBoard[r][c] = { fruit: null, special: null };
            }
        }
        return newBoard;
    }

    function renderBoard() {
        gameBoard.innerHTML = '';
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                createCell(r, c);
            }
        }
    }

    function createCell(row, col) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        cell.dataset.row = row;
        cell.dataset.col = col;
        cell.draggable = true;
        
        const fruitSpan = document.createElement('span');
        fruitSpan.classList.add('fruit');
        cell.appendChild(fruitSpan);

        cell.addEventListener('dragstart', dragStart);
        cell.addEventListener('dragover', dragOver);
        cell.addEventListener('drop', dragDrop);
        cell.addEventListener('dragend', dragEnd);
        gameBoard.appendChild(cell);
    }

    // --- Match & Activation Logic ---
    function checkForMatches() {
        const matches = new Set();
        // Horizontal
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols - 2; c++) {
                const cell = board[r][c];
                if (cell?.fruit && cell.fruit === board[r][c+1]?.fruit && cell.fruit === board[r][c+2]?.fruit) {
                    matches.add(`${r}-${c}`);
                    matches.add(`${r}-${c+1}`);
                    matches.add(`${r}-${c+2}`);
                }
            }
        }
        // Vertical
        for (let r = 0; r < rows - 2; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = board[r][c];
                if (cell?.fruit && cell.fruit === board[r+1][c]?.fruit && cell.fruit === board[r+2][c]?.fruit) {
                    matches.add(`${r}-${c}`);
                    matches.add(`${r+1}-${c}`);
                    matches.add(`${r+2}-${c}`);
                }
            }
        }
        return matches;
    }

    function getSpecialFruitToCreate(matches, swapInfo) {
        if (!swapInfo) return null;
    
        const involvedCells = new Set();
        matches.forEach(key => {
            const [r, c] = key.split('-').map(Number);
            involvedCells.add(board[r][c]);
        });
    
        // Check for 5-in-a-row first
        for (const key of matches) {
            const [r, c] = key.split('-').map(Number);
            const fruit = board[r][c]?.fruit;
            if (!fruit) continue;
    
            let rowMatch = 1;
            let i = 1;
            while (c - i >= 0 && board[r][c - i]?.fruit === fruit && matches.has(`${r}-${c-i}`)) { rowMatch++; i++; }
            i = 1;
            while (c + i < cols && board[r][c + i]?.fruit === fruit && matches.has(`${r}-${c+i}`)) { rowMatch++; i++; }
    
            let colMatch = 1;
            i = 1;
            while (r - i >= 0 && board[r - i][c]?.fruit === fruit && matches.has(`${r-i}-${c}`)) { colMatch++; i++; }
            i = 1;
            while (r + i < rows && board[r + i][c]?.fruit === fruit && matches.has(`${r+i}-${c}`)) { colMatch++; i++; }
    
            if (rowMatch >= 5 || colMatch >= 5) return { pos: swapInfo.r, c: swapInfo.c, type: 'color' };
        }
    
        // Check for T or L shape (5 fruits)
        if (matches.size === 5) {
             return { pos: { r: swapInfo.r, c: swapInfo.c }, type: 'bomb' };
        }
    
        // Check for 4-in-a-row
        for (const key of matches) {
            const [r, c] = key.split('-').map(Number);
            const fruit = board[r][c]?.fruit;
            if (!fruit) continue;
    
            let rowMatch = 1;
            let i = 1;
            while (c - i >= 0 && board[r][c - i]?.fruit === fruit && matches.has(`${r}-${c-i}`)) { rowMatch++; i++; }
            i = 1;
            while (c + i < cols && board[r][c + i]?.fruit === fruit && matches.has(`${r}-${c+i}`)) { rowMatch++; i++; }
    
            let colMatch = 1;
            i = 1;
            while (r - i >= 0 && board[r - i][c]?.fruit === fruit && matches.has(`${r-i}-${c}`)) { colMatch++; i++; }
            i = 1;
            while (r + i < rows && board[r + i][c]?.fruit === fruit && matches.has(`${r+i}-${c}`)) { colMatch++; i++; }
    
            if (rowMatch === 4) return { pos: { r: swapInfo.r, c: swapInfo.c }, type: 'line-h' };
            if (colMatch === 4) return { pos: { r: swapInfo.r, c: swapInfo.c }, type: 'line-v' };
        }
        
        return null;
    }
    
    function createSpecialFruit(special) {
        const { pos, type } = special;
        if (board[pos.r][pos.c]) {
            board[pos.r][pos.c].special = type;
            // The fruit type of a color bomb is irrelevant, but we give it one for display
            if (type === 'color') board[pos.r][pos.c].fruit = '🌈';
        }
    }

    function getSpecialActivationMatches(r, c, type) {
        const matches = new Set();
        matches.add(`${r}-${c}`);

        if (type === 'bomb') {
            for (let i = r - 1; i <= r + 1; i++) {
                for (let j = c - 1; j <= c + 1; j++) {
                    if (i >= 0 && i < rows && j >= 0 && j < cols) matches.add(`${i}-${j}`);
                }
            }
        } else if (type === 'line-h') {
            for (let j = 0; j < cols; j++) matches.add(`${r}-${j}`);
        } else if (type === 'line-v') {
            for (let i = 0; i < rows; i++) matches.add(`${i}-${c}`);
        } else if (type === 'color') {
            // Color bomb logic is special, handled during swap
            // Here we just clear the bomb itself
        }
        return matches;
    }

    async function removeMatches(matches) {
        for (const key of matches) {
            const [row, col] = key.split('-').map(Number);
            if (!board[row][col]) continue;
            const cellDiv = document.querySelector(`[data-row='${row}'][data-col='${col}']`);
            cellDiv.classList.add('pop');
            board[row][col].fruit = null;
            board[row][col].special = null;
        }
        
        updateStats();
        await sleep(300);

        for (const key of matches) {
            const [row, col] = key.split('-').map(Number);
            if (board[row][col] && board[row][col].fruit === null) {
                board[row][col] = null;
            }
        }
        updateBoardView();
    }

    // --- Utility & Helper Functions ---
    function getRandomFruit() { return fruits[Math.floor(Math.random() * fruits.length)]; }
    function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    function swapFruits(r1, c1, r2, c2) { [board[r1][c1], board[r2][c2]] = [board[r2][c2], board[r1][c1]]; }
    function isBoardEmpty() { return board.flat().every(cell => cell === null); }

    async function dropFruits() {
        for (let c = 0; c < cols; c++) {
            let emptyRow = null;
            for (let r = rows - 1; r >= 0; r--) {
                if (board[r][c] === null && emptyRow === null) emptyRow = r;
                else if (board[r][c] !== null && emptyRow !== null) {
                    board[emptyRow][c] = board[r][c];
                    board[r][c] = null;
                    emptyRow--;
                }
            }
        }
        // Refill from top
        for (let c = 0; c < cols; c++) {
            for (let r = 0; r < rows; r++) {
                if (board[r][c] === null) {
                    board[r][c] = { fruit: getRandomFruit(), special: null };
                }
            }
        }
        await sleep(100);
        updateBoardView();
    }

    function isBoardSolvable() {
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                // Check swap right
                if (c < cols - 1) {
                    swapFruits(r, c, r, c + 1);
                    if (checkForMatches().size > 0) {
                        swapFruits(r, c, r, c + 1); // Swap back
                        return true;
                    }
                    swapFruits(r, c, r, c + 1); // Swap back
                }
                // Check swap down
                if (r < rows - 1) {
                    swapFruits(r, c, r + 1, c);
                    if (checkForMatches().size > 0) {
                        swapFruits(r, c, r + 1, c); // Swap back
                        return true;
                    }
                    swapFruits(r, c, r + 1, c); // Swap back
                }
            }
        }
        return false;
    }

    function shuffleBoard() {
        const fruitsToShuffle = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (board[r][c]) {
                    fruitsToShuffle.push(board[r][c]);
                }
            }
        }
        fruitsToShuffle.sort(() => Math.random() - 0.5);
        
        let k = 0;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (board[r][c]) {
                    board[r][c] = fruitsToShuffle[k++];
                }
            }
        }
        updateBoardView();
    }

    function showMessage(text, buttonText, buttonAction) {
        messageText.textContent = text;
        if (buttonText && buttonAction) {
            messageButton.textContent = buttonText;
            messageButton.onclick = buttonAction;
            messageButton.style.display = 'block';
        } else {
            messageButton.style.display = 'none';
        }
        messageBox.classList.remove('hidden');
    }

    function hideMessage() {
        messageBox.classList.add('hidden');
    }

    // --- Start Game ---
    startLevel(1);
});