# Chess Reviewer Pro

A free, serverless chess game analyzer that brings grandmaster-level review to your browser. This project fetches games from Chess.com, evaluates them locally using a WebAssembly build of Stockfish, and provides plain-English move explanations via an AI-powered coach.
Access it through - https://stockfish-web-reviewer.vercel.app/
## Features

* Chess.com Integration: Fetch monthly game archives directly using a username.
* Local Stockfish Analysis: Runs Stockfish 10 entirely in the browser via WebAssembly, ensuring fast and private evaluation.
* Move Classification: Calculates Centipawn Loss (CPL) to categorize moves as Best, Excellent, Inaccuracy, Mistake, or Blunder.
* AI Chess Coach: Integrates with the Groq API (using the Mixtral 8x7b model) to generate concise, contextual explanations for specific moves.
* Dynamic Mascot UI: Features a responsive mascot that reacts to the board state and delivers the AI commentary based on a 3-phase state machine (Idle, Reactive, Explaining).
* Serverless Architecture: Deploys as a static site with a single Serverless Function for secure API key management.

## Tech Stack

* Frontend: HTML5, Vanilla JavaScript, Tailwind CSS
* Chess Logic: chess.js, chessboard.js
* Engine: Stockfish.js (WASM)
* Backend: Vercel Serverless Functions (Node.js native HTTPS module)
* AI Provider: Groq (gpt-oss-120b)

## Deployed using Vercel. 
