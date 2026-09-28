// PROTOTYPE - NOT FOR PRODUCTION
// Question: Can a single Node/Socket.IO room serialize concurrent actions and
//           broadcast authoritative state to N clients with no desync/lag?
// Date: 2026-09-28

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname + "/public"));

// --- Tiny hardcoded deck: numbers 0-9 in 2 colors, one Skip, one Wild ---
const COLORS = ["red", "blue"];
function buildDeck() {
  const deck = [];
  for (const color of COLORS) {
    for (let n = 0; n <= 9; n++) deck.push({ color, value: String(n) });
  }
  deck.push({ color: "red", value: "SKIP" });
  deck.push({ color: "blue", value: "SKIP" });
  deck.push({ color: "wild", value: "WILD" });
  deck.push({ color: "wild", value: "WILD" });
  // shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function isLegalPlay(card, topCard, activeColor) {
  if (card.color === "wild") return true;
  if (card.color === activeColor) return true;
  if (card.value === topCard.value) return true;
  return false;
}

// --- Single hardcoded room. This is the ONLY thing being tested: server-authoritative sync. ---
const ROOM_ID = "PROTO1";
const room = {
  players: [], // { id, name, hand: [card,...] }
  deck: [],
  discard: [],
  activeColor: null,
  turnIndex: 0,
};

function currentPlayer() {
  return room.players[room.turnIndex];
}

function topCard() {
  return room.discard[room.discard.length - 1];
}

function publicState() {
  // Server decides what each client is entitled to see: hand COUNTS for
  // opponents, full hand only for yourself. Built per-socket in broadcast().
  return {
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      handCount: p.hand.length,
    })),
    topCard: topCard(),
    activeColor: room.activeColor,
    turnPlayerId: currentPlayer() ? currentPlayer().id : null,
  };
}

function broadcast() {
  const base = publicState();
  for (const p of room.players) {
    io.to(p.id).emit("STATE_SYNC", { ...base, yourHand: p.hand });
  }
}

function startGameIfReady() {
  if (room.players.length < 2 || room.deck.length > 0) return;
  room.deck = buildDeck();
  for (const p of room.players) {
    p.hand = room.deck.splice(0, 5);
  }
  // First discard card must not be a Wild for this tiny prototype
  let first = room.deck.pop();
  while (first.color === "wild") {
    room.deck.unshift(first);
    first = room.deck.pop();
  }
  room.discard = [first];
  room.activeColor = first.color;
  room.turnIndex = 0;
  broadcast();
}

io.on("connection", (socket) => {
  socket.on("JOIN_ROOM", ({ name }) => {
    if (room.players.length >= 4) {
      socket.emit("ERROR_MSG", "Room is full (prototype cap: 4 players).");
      return;
    }
    socket.join(ROOM_ID);
    room.players.push({ id: socket.id, name: name || "Player", hand: [] });
    console.log(`[JOIN] ${name} (${socket.id}) — ${room.players.length} in room`);
    broadcast();
    startGameIfReady();
  });

  socket.on("PLAY_CARD", ({ cardIndex }) => {
    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    // --- Server is the ONLY authority. Every check happens here, never trusted from client. ---
    if (!currentPlayer() || currentPlayer().id !== socket.id) {
      socket.emit("ERROR_MSG", "That's not your turn.");
      return;
    }
    const card = player.hand[cardIndex];
    if (!card) {
      socket.emit("ERROR_MSG", "You don't have that card.");
      return;
    }
    if (!isLegalPlay(card, topCard(), room.activeColor)) {
      socket.emit("ERROR_MSG", `Illegal move: ${card.color} ${card.value} doesn't match ${room.activeColor} ${topCard().value}.`);
      return;
    }

    player.hand.splice(cardIndex, 1);
    room.discard.push(card);
    room.activeColor = card.color === "wild" ? (COLORS[Math.floor(Math.random() * COLORS.length)]) : card.color;

    let advance = 1;
    if (card.value === "SKIP") advance = 2;

    if (player.hand.length === 0) {
      io.to(ROOM_ID).emit("GAME_OVER", { winner: player.name });
      console.log(`[WIN] ${player.name}`);
      return;
    }

    room.turnIndex = (room.turnIndex + advance) % room.players.length;
    broadcast();
  });

  socket.on("DRAW_CARD", () => {
    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;
    if (!currentPlayer() || currentPlayer().id !== socket.id) {
      socket.emit("ERROR_MSG", "That's not your turn.");
      return;
    }
    if (room.deck.length === 0) {
      socket.emit("ERROR_MSG", "Deck is empty (prototype has no reshuffle).");
      return;
    }
    player.hand.push(room.deck.pop());
    room.turnIndex = (room.turnIndex + 1) % room.players.length;
    broadcast();
  });

  socket.on("disconnect", () => {
    room.players = room.players.filter((p) => p.id !== socket.id);
    console.log(`[LEAVE] ${socket.id} — ${room.players.length} in room`);
    broadcast();
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Prototype server running at http://localhost:${PORT}`);
  console.log(`Open multiple browser tabs/windows to that URL to test multiplayer sync.`);
});
