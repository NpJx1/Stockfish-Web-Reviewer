let board = null;
let currentMoveIndex = -1;
let analysisData = [];

// stockfish declaration
// The CORRECTED CDN Web Worker Trick
const workerCode = `importScripts('https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js');`;
const blob = new Blob([workerCode], { type: 'application/javascript' });
const engine = new Worker(URL.createObjectURL(blob));
engine.onmessage = function(event){
    console.log("Stockfish: ", event.data);
}
engine.postMessage("uci");
engine.postMessage("isready");

$(document).ready(function() {
    board = Chessboard('board', {
        position: 'start',
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
    });
});

// Fetch list of games directly from Chess.com API (via local proxy server)
document.getElementById('fetchGamesBtn').addEventListener('click', async () => {
    const username = document.getElementById('username').value.trim();
    const year = document.getElementById('year').value.trim();
    let month = document.getElementById('month').value.trim();

    if(!username || !year || !month) {
        alert("Please fill in username, year, and month.");
        return;
    }

    month = month.padStart(2, '0');
    const statusMsg = document.getElementById('statusMsg');
    statusMsg.innerText = "Fetching game list directly from Chess.com...";

    try {
        const targetUrl = `https://api.chess.com/pub/player/${username}/games/${year}/${month}`;
        
        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        // Edge Case Handling: Check HTTP status before attempting to parse JSON
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error("404 Not Found: Ensure the username is correct and games exist for this month.");
            } else if (response.status === 403) {
                throw new Error("403 Forbidden: Chess.com blocked the request. Try again later.");
            }
            throw new Error(`Request failed with status ${response.status}`);
        }

        // Edge Case Handling: Catch malformed JSON if API returns an unexpected HTML error page
        let data;
        try {
            data = await response.json();
        } catch (parseError) {
            throw new Error("Received invalid data from Chess.com. The API might be down.");
        }

        const games = data.games || [];
        if (games.length === 0) throw new Error("No games found for this month.");

        const select = document.getElementById('gameSelect');
        select.innerHTML = ""; 

        games.forEach((g) => {
            const pgn = g.pgn || "";
            const chess = new Chess();
            chess.load_pgn(pgn); 

            const white = chess.header().White || "Unknown";
            const black = chess.header().Black || "Unknown";

            const option = document.createElement('option');
            option.value = pgn;
            option.innerText = `${white} vs ${black}`;
            select.appendChild(option);
        });

        document.getElementById('gameSelectorContainer').classList.remove('hidden');
        statusMsg.innerText = `Found ${games.length} games. Select one to analyze.`;

    } catch (error) {
        // Edge Case Handling: Catch network failures (e.g., user loses internet connection)
        if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
            statusMsg.innerText = "Error: Network failure. Please check your internet connection.";
        } else {
            statusMsg.innerText = `Error: ${error.message}`;
        }
    }
});

function renderAnalysisList() {
    const panel = document.getElementById('analysisPanel');
    panel.innerHTML = "";

    analysisData.forEach((moveData, index) => {
        const moveDiv = document.createElement('div');

        let colorClass = "text-gray-300";
        if(moveData.classification === "Best Move") colorClass = "text-green-400 font-bold";
        if(moveData.classification === "Blunder") colorClass = "text-red-500 font-bold";
        if(moveData.classification === "Mistake") colorClass = "text-orange-400";

        moveDiv.className = "p-3 bg-gray-700 rounded cursor-pointer hover:bg-gray-600 transition";
        moveDiv.onclick = () => jumpToMove(index);

        let htmlContent = `
            <div class="flex justify-between items-center">
                <span class="font-semibold text-lg">
                    Move ${moveData.move_number}: ${moveData.san} <span class="${colorClass} ml-1 font-bold">${moveData.icon}</span>
                </span>
                <span class="${colorClass}">${moveData.classification} (CPL: ${moveData.cpl})</span>
            </div>
        `;

        if(moveData.commentary) {
            htmlContent += `<p class="mt-2 text-sm text-blue-200 border-l-2 border-blue-500 pl-2">${moveData.commentary}</p>`;
        }

        moveDiv.innerHTML = htmlContent;
        panel.appendChild(moveDiv);
    });
}

// Injects custom inline SVG icons directly over the chessboard squares
function drawBoardIcon(moveData) {
    // Clear old icons
    document.querySelectorAll('.eval-overlay-icon').forEach(el => el.remove());

    if (!moveData || !moveData.to) return;

    let svg = '';
    let colorClass = '';

    // Assign SVG path and Tailwind color based on classification
    if (moveData.classification === "Best Move") {
        colorClass = "bg-green-500";
        svg = `<path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.536a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />`;
    } else if (moveData.classification === "Excellent") {
        colorClass = "bg-green-400";
        svg = `<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />`;
    } else if (moveData.classification === "Inaccuracy") {
        colorClass = "bg-yellow-500";
        svg = `<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />`;
    } else if (moveData.classification === "Mistake") {
        colorClass = "bg-orange-500";
        svg = `<path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />`;
    } else if (moveData.classification === "Blunder") {
        colorClass = "bg-red-600";
        svg = `<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />`;
    } else {
        return; // Good moves do not get an icon
    }

    // Target the specific square DOM element generated by chessboard.js
    const squareEl = document.querySelector(`.square-${moveData.to}`);
    if (squareEl) {
        squareEl.style.position = 'relative'; // Ensure absolute positioning anchors to this square
        const iconDiv = document.createElement('div');
        iconDiv.className = 'eval-overlay-icon';
        
        // CSS forces the icon to float top-right over the piece image
        iconDiv.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" 
                 class="w-5 h-5 sm:w-6 sm:h-6 ${colorClass} rounded-full p-1 shadow-lg border-2 border-white"
                 style="position: absolute; top: -5px; right: -5px; z-index: 1000;">
                ${svg}
            </svg>
        `;
        squareEl.appendChild(iconDiv);
    }
}

function jumpToMove(index) {
    if(index < 0 || index >= analysisData.length) return;
    currentMoveIndex = index;
    board.position(analysisData[index].fen);
    
    // Draw the new icon on the board
    drawBoardIcon(analysisData[index]); 
}

document.getElementById('prevBtn').addEventListener('click', () => {
    if (currentMoveIndex > 0) {
        jumpToMove(currentMoveIndex - 1);
    }
    else if (currentMoveIndex === 0) { 
        currentMoveIndex = -1; 
        board.start(); 
        
        // Wipe all icons if user resets to the starting position
        document.querySelectorAll('.eval-overlay-icon').forEach(el => el.remove());
    }
});

document.getElementById('nextBtn').addEventListener('click', () => {
    if (currentMoveIndex < analysisData.length - 1) jumpToMove(currentMoveIndex + 1);
});

// Main stockfish analysis loop
function evaluatePosition(fen){
    return new Promise((resolve) => {
        let currentScore = 0;

        engine.onmessage = function(event){
            const line = event.data;

            const cpMatch = line.match(/score cp (-?\d+)/);
            if (cpMatch){
                currentScore = parseInt(cpMatch[1], 10);
            }
            const mateMatch = line.match(/score mate (-?\d+)/);
            if (mateMatch){
                currentScore = parseInt(mateMatch[1], 10) * 10000;
            }
            if (line.includes("bestmove")){
                resolve(currentScore);
            }
        };
        engine.postMessage(`position fen ${fen}`);
        engine.postMessage("go depth 10");
    });
}

// main function for analyzing games
document.getElementById('analyzeBtn').addEventListener('click', async () => {
    const pgnText = document.getElementById('gameSelect').value;

    if (!pgnText) {
        alert("Please load and select a game first.");
        return;
    }

    // Clear board icons before analyzing a new game
    document.querySelectorAll('.eval-overlay-icon').forEach(el => el.remove());

    const statusMsg = document.getElementById('statusMsg');
    statusMsg.innerText = "Analyzing game with WebAssembly Stockfish... This may take a minute.";

    const game = new Chess();
    game.load_pgn(pgnText);
    const history = game.history({ verbose: true });

    const evalBoard = new Chess();
    analysisData = [];

    for (let i = 0; i < history.length; i++) {
        const move = history[i];
        const moveNumber = i + 1;

        const scoreBefore = await evaluatePosition(evalBoard.fen());
        evalBoard.move(move);
        const scoreAfter = await evaluatePosition(evalBoard.fen());

        const rawCpl = scoreBefore + scoreAfter;
        const cpl = Math.max(0, rawCpl);

        let classification = "Good";
        let icon = ""; 

        // Assigning standard chess annotation symbols
        if (cpl <= 10) { classification = "Best Move"; icon = "★"; }
        else if (cpl <= 30) { classification = "Excellent"; icon = "✓"; }
        else if (cpl <= 80) { classification = "Inaccuracy"; icon = "?!"; }
        else if (cpl <= 200) { classification = "Mistake"; icon = "?"; }
        else { classification = "Blunder"; icon = "??"; }

        // We capture move.to here so the board knows where to draw the SVG!
        analysisData.push({
            move_number: moveNumber,
            san: move.san,
            to: move.to, 
            fen: evalBoard.fen(),
            cpl: cpl,
            classification: classification,
            icon: icon, 
            commentary: "" 
        });

        statusMsg.innerText = `Analyzing move ${moveNumber} of ${history.length}...`;
    }

    statusMsg.innerText = `Analysis Complete! Processed ${history.length} moves.`;
    board.start();
    currentMoveIndex = -1;
    renderAnalysisList();
});