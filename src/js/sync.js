import { writable, get } from "svelte/store";
import { Peer } from "peerjs";
import { showToast } from "./toastStore.js";
import { currentCard, cardFlipped } from "./state.js";

export const syncRole = writable("none"); // "none", "host", "client"
export const roomCode = writable("");
export const syncState = writable("disconnected"); // "disconnected", "connecting", "connected", "error"
export const clientCount = writable(0);
export const sharedCard = writable(null);
export const sharedCardFlipped = writable(false);
export const sharedCardShowText = writable(false);
export const syncError = writable("");

// Player/GM connection extensions
export const playerName = writable(localStorage.getItem("playerName") || "Player");
export const connectedPlayers = writable([]); // Array of { peerId, name }
export const receivedCards = writable([]); // Array of card objects

// Automatically save player name changes
playerName.subscribe((val) => {
  if (val) {
    localStorage.setItem("playerName", val);
  }
});

let peer = null;
let activeConnections = [];

export function startHosting() {
  disconnect();

  syncState.set("connecting");
  syncRole.set("host");
  syncError.set("");

  // Generate a random 6-digit room code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  roomCode.set(code);

  const peerId = `vibedeck-room-${code}`;

  try {
    peer = new Peer(peerId, {
      debug: 1, // Only log errors
    });
  } catch (e) {
    console.error(e);
    syncState.set("error");
    syncError.set("Could not initialize peer connection.");
    return;
  }

  peer.on("open", () => {
    syncState.set("connected");
    showToast(`Table created! Code: ${code}`, "success");

    // Push the current card if one is already drawn
    const card = get(currentCard);
    if (card) {
      pushCard(card);
    }
  });

  peer.on("connection", (conn) => {
    conn.on("open", () => {
      // Avoid duplicate connections in our tracking
      if (!activeConnections.find((c) => c.peer === conn.peer)) {
        activeConnections.push(conn);
      }
    });

    conn.on("data", (data) => {
      if (data && typeof data === "object") {
        if (data.type === "JOIN_NAME") {
          connectedPlayers.update((list) => {
            const filtered = list.filter((p) => p.peerId !== conn.peer);
            return [...filtered, { peerId: conn.peer, name: data.name }];
          });
          clientCount.set(get(connectedPlayers).length);
          showToast(`${data.name} joined the table`, "success");

          // Sync current card state immediately to the new player
          const card = get(currentCard);
          if (card) {
            conn.send({
              type: "CARD_PUSH",
              card: {
                id: card.id,
                front: card.front,
                back: card.back,
                text: card.text,
                pageNum: card.pageNum,
              },
              cardFlipped: get(cardFlipped),
              isPrivate: false,
            });
          }
        }
      }
    });

    conn.on("close", () => {
      const closingPlayer = get(connectedPlayers).find((p) => p.peerId === conn.peer);
      const name = closingPlayer ? closingPlayer.name : "A player";

      activeConnections = activeConnections.filter((c) => c !== conn);
      connectedPlayers.update((list) => list.filter((p) => p.peerId !== conn.peer));
      clientCount.set(get(connectedPlayers).length);
      showToast(`${name} left the table`);
    });

    conn.on("error", (err) => {
      console.error("Connection error:", err);
      activeConnections = activeConnections.filter((c) => c !== conn);
      connectedPlayers.update((list) => list.filter((p) => p.peerId !== conn.peer));
      clientCount.set(get(connectedPlayers).length);
    });
  });

  peer.on("error", (err) => {
    console.error("Peer error:", err);
    if (err.type === "unavailable-id") {
      // Retry once with a new code
      startHosting();
    } else {
      syncState.set("error");
      syncError.set(`Connection error: ${err.message || err.type}`);
      showToast("Table connection error", "error");
    }
  });
}

export function joinTable(code, name) {
  if (!code || code.trim().length !== 6) {
    showToast("Room code must be 6 digits", "error");
    return;
  }

  disconnect();

  syncState.set("connecting");
  syncRole.set("client");
  roomCode.set(code);
  syncError.set("");

  try {
    peer = new Peer({
      debug: 1,
    });
  } catch (e) {
    console.error(e);
    syncState.set("error");
    syncError.set("Could not initialize peer connection.");
    return;
  }

  peer.on("open", () => {
    const hostPeerId = `vibedeck-room-${code}`;
    const conn = peer.connect(hostPeerId, {
      reliable: true,
    });

    conn.on("open", () => {
      syncState.set("connected");
      showToast("Connected to GM's table!", "success");
      activeConnections = [conn];

      // Send name to GM immediately
      conn.send({
        type: "JOIN_NAME",
        name: name || get(playerName),
      });
    });

    conn.on("data", (data) => {
      if (data && typeof data === "object") {
        if (data.type === "CARD_PUSH") {
          sharedCard.set(data.card);
          sharedCardFlipped.set(data.cardFlipped || false);
          sharedCardShowText.set(false);

          if (data.card) {
            receivedCards.update((list) => {
              // Avoid duplicates in client's hand
              if (list.some((c) => c.id === data.card.id)) {
                return list;
              }
              return [...list, data.card];
            });

            if (data.isPrivate) {
              showToast("You received a private card from the GM!", "success");
            } else {
              showToast("GM shared a card with everyone!", "success");
            }
          }
        } else if (data.type === "CARD_FLIP") {
          sharedCardFlipped.set(data.cardFlipped);
        } else if (data.type === "CARD_CLEAR") {
          sharedCard.set(null);
          sharedCardFlipped.set(false);
          sharedCardShowText.set(false);
        }
      }
    });

    conn.on("close", () => {
      syncState.set("disconnected");
      showToast("Disconnected from GM's table", "error");
      disconnect();
    });

    conn.on("error", (err) => {
      console.error("Connection error:", err);
      syncState.set("error");
      syncError.set("Lost connection to GM.");
      showToast("Connection to GM failed", "error");
    });
  });

  peer.on("error", (err) => {
    console.error("Peer error:", err);
    syncState.set("error");
    if (err.type === "peer-unavailable") {
      syncError.set(`Table ${code} not found. Verify room code.`);
    } else {
      syncError.set(`Connection error: ${err.message || err.type}`);
    }
    showToast("Failed to join table", "error");
  });
}

export function disconnect() {
  if (activeConnections.length) {
    activeConnections.forEach((conn) => {
      try {
        conn.close();
      } catch {}
    });
    activeConnections = [];
  }

  if (peer) {
    try {
      peer.destroy();
    } catch {}
    peer = null;
  }

  syncRole.set("none");
  roomCode.set("");
  syncState.set("disconnected");
  clientCount.set(0);
  sharedCard.set(null);
  sharedCardFlipped.set(false);
  sharedCardShowText.set(false);
  syncError.set("");
  connectedPlayers.set([]);
  receivedCards.set([]);
}

export function pushCard(card) {
  const role = get(syncRole);
  if (role !== "host") return;

  const payload = {
    type: "CARD_PUSH",
    card: card
      ? {
          id: card.id,
          front: card.front,
          back: card.back,
          text: card.text,
          pageNum: card.pageNum,
        }
      : null,
    cardFlipped: get(cardFlipped),
    isPrivate: false,
  };

  activeConnections.forEach((conn) => {
    if (conn.open) {
      conn.send(payload);
    }
  });
}

export function sendCardTo(peerId, card) {
  const role = get(syncRole);
  if (role !== "host") return;

  const conn = activeConnections.find((c) => c.peer === peerId);
  if (conn && conn.open) {
    conn.send({
      type: "CARD_PUSH",
      card: card
        ? {
            id: card.id,
            front: card.front,
            back: card.back,
            text: card.text,
            pageNum: card.pageNum,
          }
        : null,
      cardFlipped: false,
      isPrivate: true,
    });

    const player = get(connectedPlayers).find((p) => p.peerId === peerId);
    const name = player ? player.name : "player";
    showToast(`Sent card privately to ${name}`, "success");
  }
}

export function pushFlip(isFlipped) {
  const role = get(syncRole);
  if (role !== "host") return;

  activeConnections.forEach((conn) => {
    if (conn.open) {
      conn.send({
        type: "CARD_FLIP",
        cardFlipped: isFlipped,
      });
    }
  });
}

export function pushClear() {
  const role = get(syncRole);
  if (role !== "host") return;

  activeConnections.forEach((conn) => {
    if (conn.open) {
      conn.send({
        type: "CARD_CLEAR",
      });
    }
  });
}
