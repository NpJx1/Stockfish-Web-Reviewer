let board = null;
let currentMoveIndex = -1;
let analysisData = [];

// stockfish declaration
const engine = new Worker('stockfish-18.js');
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
                <span class="font-semibold text-lg">Move ${moveData.move_number}: ${moveData.san}</span>
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

function jumpToMove(index) {
    if(index < 0 || index >= analysisData.length) return;
    currentMoveIndex = index;
    board.position(analysisData[index].fen);
}

document.getElementById('prevBtn').addEventListener('click', () => {
    if (currentMoveIndex > 0) jumpToMove(currentMoveIndex - 1);
    else if (currentMoveIndex === 0) { currentMoveIndex = -1; board.start(); }
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
        if (cpl <= 10) classification = "Best Move";
        else if (cpl <= 30) classification = "Excellent";
        else if (cpl <= 80) classification = "Inaccuracy";
        else if (cpl <= 200) classification = "Mistake";
        else classification = "Blunder";

        analysisData.push({
            move_number: moveNumber,
            san: move.san,
            fen: evalBoard.fen(),
            cpl: cpl,
            classification: classification,
            commentary: "" 
        });

        statusMsg.innerText = `Analyzing move ${moveNumber} of ${history.length}...`;
    }

    statusMsg.innerText = `Analysis Complete! Processed ${history.length} moves.`;
    board.start();
    currentMoveIndex = -1;
    renderAnalysisList();
});