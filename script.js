const SYMS = {
  white: { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙" },
  black: { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟" },
};

let board   = [];
let sel     = null;  // { r, c }
let moves   = [];    // valid moves for selected piece
let history = [];    // { snap, wNote, bNote, turnBefore } pairs
let turn    = "white";
let gameOver = false;
let pendingPromotion = null;  // { r, c, color }

function initBoard() {
  board = Array(8).fill(null).map(() => Array(8).fill(null));
  const back = ["R", "N", "B", "Q", "K", "B", "N", "R"];
  back.forEach((t, c) => {
    board[0][c] = { type: t, color: "black", moved: false };
    board[7][c] = { type: t, color: "white", moved: false };
  });
  for (let c = 0; c < 8; c++) {
    board[1][c] = { type: "P", color: "black", moved: false };
    board[6][c] = { type: "P", color: "white", moved: false };
  }
}

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function sliding(r, c, dirs) {
  const p = board[r][c], res = [];
  for (const [dr, dc] of dirs) {
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc)) {
      if (board[nr][nc]) {
        if (board[nr][nc].color !== p.color) res.push({ r: nr, c: nc });
        break;
      }
      res.push({ r: nr, c: nc });
      nr += dr; nc += dc;
    }
  }
  return res;
}

function knightMoves(r, c) {
  const p = board[r][c];
  return [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]
    .map(([dr, dc]) => ({ r: r + dr, c: c + dc }))
    .filter(({ r: nr, c: nc }) => inBounds(nr, nc) && board[nr][nc]?.color !== p.color);
}

function kingMoves(r, c) {
  const p = board[r][c];
  return [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]
    .map(([dr, dc]) => ({ r: r + dr, c: c + dc }))
    .filter(({ r: nr, c: nc }) => inBounds(nr, nc) && board[nr][nc]?.color !== p.color);
}

// castling: king hasn't moved, rook hasn't moved, path clear, king safe through each square
function castlingMoves(r, c) {
  const p = board[r][c];
  const backRow = p.color === "white" ? 7 : 0;
  if (p.moved || r !== backRow || c !== 4) return [];
  if (isInCheck(p.color)) return [];

  const result = [];

  // kingside (O-O)
  const kRook = board[backRow][7];
  if (kRook?.type === "R" && !kRook.moved && !board[backRow][5] && !board[backRow][6]) {
    const f5safe = tryMove(backRow, 4, backRow, 5, () => !isInCheck(p.color));
    const f6safe = tryMove(backRow, 4, backRow, 6, () => !isInCheck(p.color));
    if (f5safe && f6safe) result.push({ r: backRow, c: 6, castle: "K" });
  }

  // queenside (O-O-O)
  const qRook = board[backRow][0];
  if (qRook?.type === "R" && !qRook.moved && !board[backRow][1] && !board[backRow][2] && !board[backRow][3]) {
    const f3safe = tryMove(backRow, 4, backRow, 3, () => !isInCheck(p.color));
    const f2safe = tryMove(backRow, 4, backRow, 2, () => !isInCheck(p.color));
    if (f3safe && f2safe) result.push({ r: backRow, c: 2, castle: "Q" });
  }

  return result;
}

function pawnMoves(r, c) {
  const p = board[r][c];
  const dir = p.color === "white" ? -1 : 1;
  const startRow = p.color === "white" ? 6 : 1;
  const res = [];

  if (inBounds(r + dir, c) && !board[r + dir][c]) {
    res.push({ r: r + dir, c });
    if (r === startRow && !board[r + 2 * dir][c])
      res.push({ r: r + 2 * dir, c });
  }

  for (const dc of [-1, 1]) {
    const nr = r + dir, nc = c + dc;
    if (inBounds(nr, nc) && board[nr][nc] && board[nr][nc].color !== p.color)
      res.push({ r: nr, c: nc });
  }

  return res;
}

// no check filtering — called inside isInCheck to avoid infinite recursion
function rawMoves(r, c) {
  const p = board[r][c];
  if (!p) return [];
  switch (p.type) {
    case "P": return pawnMoves(r, c);
    case "R": return sliding(r, c, [[0,1],[0,-1],[1,0],[-1,0]]);
    case "B": return sliding(r, c, [[1,1],[1,-1],[-1,1],[-1,-1]]);
    case "Q": return sliding(r, c, [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]);
    case "N": return knightMoves(r, c);
    case "K": return kingMoves(r, c);
  }
  return [];
}

function isInCheck(color) {
  let kr = -1, kc = -1;
  outer: for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (board[r][c]?.type === "K" && board[r][c].color === color) {
        kr = r; kc = c; break outer;
      }

  if (kr === -1) return false;

  const opp = color === "white" ? "black" : "white";
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (board[r][c]?.color === opp)
        if (rawMoves(r, c).some((m) => m.r === kr && m.c === kc)) return true;
  return false;
}

// simulate a move, run fn, then revert — avoids deep-copying the board
function tryMove(fr, fc, tr, tc, fn) {
  const savedTo = board[tr][tc];
  board[tr][tc] = board[fr][fc];
  board[fr][fc] = null;
  const result = fn();
  board[fr][fc] = board[tr][tc];
  board[tr][tc] = savedTo;
  return result;
}

function validMoves(r, c) {
  const p = board[r][c];
  if (!p) return [];
  const legal = rawMoves(r, c).filter(({ r: tr, c: tc }) =>
    tryMove(r, c, tr, tc, () => !isInCheck(p.color))
  );
  if (p.type === "K") return legal.concat(castlingMoves(r, c));
  return legal;
}

function hasAnyMove(color) {
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (board[r][c]?.color === color && validMoves(r, c).length > 0) return true;
  return false;
}

function sq(r, c) {
  return "abcdefgh"[c] + (8 - r);
}

function doMove(fr, fc, tr, tc) {
  const p = board[fr][fc];

  const isCastle = p.type === "K" && Math.abs(tc - fc) === 2;
  const note = isCastle ? (tc === 6 ? "O-O" : "O-O-O") : sq(fr, fc) + " → " + sq(tr, tc);

  const snap = board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));

  if (turn === "white") {
    history.push({ snap, wNote: note, bNote: null, turnBefore: "white" });
  } else {
    if (history.length && history[history.length - 1].bNote === null) {
      history[history.length - 1].bNote = note;
      history[history.length - 1].snapAfterBlack = snap;
    } else {
      history.push({ snap, wNote: null, bNote: note, turnBefore: "black" });
    }
  }

  board[tr][tc] = { ...p, moved: true };
  board[fr][fc] = null;

  if (isCastle) {
    if (tc === 6) {
      // kingside: rook col 7 → col 5
      board[fr][5] = { ...board[fr][7], moved: true };
      board[fr][7] = null;
    } else {
      // queenside: rook col 0 → col 3
      board[fr][3] = { ...board[fr][0], moved: true };
      board[fr][0] = null;
    }
    turn = turn === "white" ? "black" : "white";
    return;
  }

  if (p.type === "P" && (tr === 0 || tr === 7)) {
    pendingPromotion = { r: tr, c: tc, color: p.color };
    showPromoDialog(p.color);
    return;  // turn switches after player picks
  }

  turn = turn === "white" ? "black" : "white";
}

function showPromoDialog(color) {
  const choices = document.getElementById("promo-choices");
  choices.innerHTML = "";
  for (const type of ["Q", "R", "B", "N"]) {
    const btn = document.createElement("div");
    btn.className = "promo-piece " + (color === "white" ? "piece-white" : "piece-black");
    btn.textContent = SYMS[color][type];
    btn.title = { Q: "Queen", R: "Rook", B: "Bishop", N: "Knight" }[type];
    btn.addEventListener("click", () => choosePiece(type));
    choices.appendChild(btn);
  }
  document.getElementById("promo-modal").classList.add("show");
}

function choosePiece(type) {
  if (!pendingPromotion) return;
  const { r, c, color } = pendingPromotion;
  board[r][c] = { type, color, moved: true };
  pendingPromotion = null;
  document.getElementById("promo-modal").classList.remove("show");
  turn = turn === "white" ? "black" : "white";
  sel = null; moves = [];
  render();
}

function undo() {
  if (pendingPromotion) {
    document.getElementById("promo-modal").classList.remove("show");
    pendingPromotion = null;
    const last = history[history.length - 1];
    if (last) {
      if (last.bNote && turn === "white") { last.bNote = null; delete last.snapAfterBlack; }
      else history.pop();
      board = last.snap.map((row) => row.map((c) => (c ? { ...c } : null)));
    }
    sel = null; moves = []; render(); return;
  }

  gameOver = false;
  const last = history[history.length - 1];
  if (!last) return;

  if (last.bNote && turn === "white") {
    // undo black's move
    board = last.snapAfterBlack
      ? last.snapAfterBlack.map((row) => row.map((c) => (c ? { ...c } : null)))
      : last.snap.map((row) => row.map((c) => (c ? { ...c } : null)));
    last.bNote = null; delete last.snapAfterBlack;
    turn = "black";
  } else {
    // undo white's move
    board = last.snap.map((row) => row.map((c) => (c ? { ...c } : null)));
    history.pop();
    turn = last.turnBefore;
  }

  sel = null; moves = [];
  render();
}

function reset() {
  initBoard();
  sel = null; moves = []; history = [];
  turn = "white"; gameOver = false; pendingPromotion = null;
  document.getElementById("promo-modal").classList.remove("show");
  render();
}

function handleClick(r, c) {
  if (gameOver || pendingPromotion) return;

  if (sel) {
    const mv = moves.find((m) => m.r === r && m.c === c);
    if (mv) {
      doMove(sel.r, sel.c, r, c);
      sel = null; moves = []; render(); return;
    }
  }

  if (board[r][c]?.color === turn) {
    sel = { r, c };
    moves = validMoves(r, c);
  } else {
    sel = null; moves = [];
  }

  render();
}

function render() {
  const boardEl = document.getElementById("board");
  boardEl.innerHTML = "";

  const check = isInCheck(turn);

  let checkKing = null;
  if (check) {
    outer: for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++)
        if (board[r][c]?.type === "K" && board[r][c].color === turn) {
          checkKing = { r, c }; break outer;
        }
  }

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = document.createElement("div");
      cell.className = "cell " + ((r + c) % 2 === 0 ? "light" : "dark");

      if (sel?.r === r && sel?.c === c) cell.classList.add("selected");

      const isMove = moves.some((m) => m.r === r && m.c === c);
      if (isMove) cell.classList.add(board[r][c] ? "can-capture" : "can-move");

      if (checkKing?.r === r && checkKing?.c === c) cell.classList.add("in-check");

      const p = board[r][c];
      if (p) {
        cell.textContent = SYMS[p.color][p.type];
        cell.classList.add(p.color === "white" ? "piece-white" : "piece-black");
      }

      cell.addEventListener("click", () => handleClick(r, c));
      boardEl.appendChild(cell);
    }
  }

  const statusEl = document.getElementById("status-msg");
  const turnEl   = document.getElementById("turn-box");

  if (check && !hasAnyMove(turn)) {
    const winner = turn === "white" ? "Black" : "White";
    statusEl.textContent = `Checkmate — ${winner} wins!`;
    turnEl.textContent = "Game Over";
    turnEl.className = "turn-box";
    gameOver = true;
  } else if (!check && !hasAnyMove(turn)) {
    statusEl.textContent = "Stalemate — draw!";
    turnEl.textContent = "Draw";
    turnEl.className = "turn-box";
    gameOver = true;
  } else if (check) {
    statusEl.textContent = `${turn === "white" ? "White" : "Black"} is in check!`;
    setTurnDisplay(turnEl);
  } else {
    statusEl.textContent = "";
    setTurnDisplay(turnEl);
  }

  renderHistory();
}

function setTurnDisplay(el) {
  if (turn === "white") {
    el.textContent = "White's Turn ♔";
    el.className = "turn-box white";
  } else {
    el.textContent = "Black's Turn ♚";
    el.className = "turn-box black";
  }
}

function renderHistory() {
  const el = document.getElementById("history");
  el.innerHTML = "";

  history.forEach((entry, i) => {
    const line = document.createElement("div");
    line.className = "move-line";

    const num = document.createElement("span");
    num.className = "mnum";
    num.textContent = i + 1 + ".";  // each entry = one full move (white + black)
    line.appendChild(num);

    if (entry.wNote) {
      const w = document.createElement("span");
      w.className = "wmove";
      w.textContent = entry.wNote;
      line.appendChild(w);
    }
    if (entry.bNote) {
      const b = document.createElement("span");
      b.className = "bmove";
      b.textContent = entry.bNote;
      line.appendChild(b);
    }

    el.appendChild(line);
  });

  el.scrollTop = el.scrollHeight;
}

function buildLabels() {
  const ranks = document.getElementById("ranks");
  for (let r = 0; r < 8; r++) {
    const s = document.createElement("span");
    s.textContent = 8 - r;
    s.style.height = "64px";
    s.style.display = "flex";
    s.style.alignItems = "center";
    ranks.appendChild(s);
  }
  const files = document.getElementById("files");
  for (let c = 0; c < 8; c++) {
    const s = document.createElement("span");
    s.textContent = "abcdefgh"[c];
    files.appendChild(s);
  }
}

buildLabels();
initBoard();
render();
