import { writable, get } from "svelte/store";
import { Peer } from "peerjs";
import { showToast } from "./toastStore.js";
import { currentCard, cardFlipped } from "./state.js";

export const syncRole = writable("none"); // "none", "host", "client"
export const roomCode = writable("");
export const syncState = writable("disconnected"); // "disconnected", "connecting", "connected", "error"
export const clientCount = writable(0);
export const sharedCard = writable(null); // Focused card on player's screen
export const sharedCardFlipped = writable(false);
export const sharedCardShowText = writable(false);
export const syncError = writable("");

// Player/GM connection extensions
export const playerName = writable(localStorage.getItem("playerName") || "Player");
export const connectedPlayers = writable([]); // Array of { peerId, name, isVirtual }
export const receivedCards = writable([]); // Array of card objects (Player's hand)
export const globalBroadcastCard = writable(null); // Last public card broadcasted by GM
export const globalBroadcastCardFlipped = writable(false); // Flip state of last public card
export const autoShareMode = writable("global"); // "global", "private", "player"
export const autoShareTarget = writable(""); // peerId of target player
export const discardPile = writable([]); // Array of card objects (Shared discard pile)
export const virtualPlayerHands = writable({}); // Dictionary of peerId -> card[]

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
            return [...filtered, { peerId: conn.peer, name: data.name, isVirtual: false }];
          });
          clientCount.set(get(connectedPlayers).length);
          showToast(`${data.name} joined the table`, "success");

          // Sync updated players list to all players
          const currentPlayers = get(connectedPlayers);
          activeConnections.forEach((c) => {
            if (c.open) {
              c.send({
                type: "PLAYERS_SYNC",
                players: currentPlayers,
              });
            }
          });

          // Sync last globally broadcasted card immediately to the new player
          const card = get(globalBroadcastCard);
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
              cardFlipped: get(globalBroadcastCardFlipped),
              isPrivate: false,
            });
          }

          // Sync current discard pile immediately to the new player
          const dCards = get(discardPile);
          if (dCards.length > 0) {
            conn.send({
              type: "DISCARD_PILE_SYNC",
              cards: dCards,
            });
          }
        } else if (data.type === "TRADE_REQUEST") {
          const sender = get(connectedPlayers).find((p) => p.peerId === conn.peer);
          const senderName = sender ? sender.name : "A player";
          const recipient = get(connectedPlayers).find((p) => p.peerId === data.targetPeerId);
          const recipientName = recipient ? recipient.name : "another player";

          // Broker virtual player trade
          if (recipient && recipient.isVirtual) {
            virtualPlayerHands.update((hands) => {
              const hand = hands[data.targetPeerId] || [];
              if (hand.some((c) => c.id === data.card.id)) return hands;
              return { ...hands, [data.targetPeerId]: [...hand, data.card] };
            });

            conn.send({
              type: "TRADE_CONFIRMED",
              cardId: data.card.id,
              targetName: recipientName,
            });

            const announcementText = `👤 ${senderName} passed a card to virtual player ${recipientName}`;
            activeConnections.forEach((c) => {
              if (c.open) {
                c.send({
                  type: "TRADE_ANNOUNCEMENT",
                  text: announcementText,
                });
              }
            });
            showToast(announcementText, "success");
            return;
          }

          // Peered player trade routing
          const recipientConn = activeConnections.find((c) => c.peer === data.targetPeerId);
          if (recipientConn && recipientConn.open) {
            recipientConn.send({
              type: "CARD_PUSH",
              card: data.card,
              cardFlipped: false,
              isPrivate: true,
              tradeFrom: senderName,
            });
          }

          conn.send({
            type: "TRADE_CONFIRMED",
            cardId: data.card.id,
            targetName: recipientName,
          });

          const announcementText = `👤 ${senderName} passed a card to ${recipientName}`;
          activeConnections.forEach((c) => {
            if (c.open) {
              c.send({
                type: "TRADE_ANNOUNCEMENT",
                text: announcementText,
              });
            }
          });
          showToast(announcementText, "success");
        } else if (data.type === "DISCARD_EVENT") {
          const sender = get(connectedPlayers).find((p) => p.peerId === conn.peer);
          const senderName = sender ? sender.name : "A player";

          discardPile.update((list) => [...list, data.card]);
          const currentList = get(discardPile);

          activeConnections.forEach((c) => {
            if (c.open) {
              c.send({
                type: "DISCARD_PILE_SYNC",
                cards: currentList,
              });
            }
          });

          const text = `🗑️ ${senderName} discarded a card to the discard pile`;
          activeConnections.forEach((c) => {
            if (c.open) {
              c.send({
                type: "TRADE_ANNOUNCEMENT",
                text: text,
              });
            }
          });
          showToast(text);
        } else if (data.type === "RECALL_EVENT") {
          const sender = get(connectedPlayers).find((p) => p.peerId === conn.peer);
          const senderName = sender ? sender.name : "A player";

          const cardId = data.cardId;
          const currentList = get(discardPile);
          const card = currentList.find((c) => c.id === cardId);

          if (card) {
            discardPile.update((list) => list.filter((c) => c.id !== cardId));
            const updatedList = get(discardPile);

            activeConnections.forEach((c) => {
              if (c.open) {
                c.send({
                  type: "DISCARD_PILE_SYNC",
                  cards: updatedList,
                });
              }
            });

            conn.send({
              type: "CARD_PUSH",
              card: card,
              cardFlipped: false,
              isPrivate: true,
            });

            const text = `🔄 ${senderName} recalled a card from the discard pile`;
            activeConnections.forEach((c) => {
              if (c.open) {
                c.send({
                  type: "TRADE_ANNOUNCEMENT",
                  text: text,
                });
              }
            });
            showToast(text, "success");
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

      // Sync updated players list to all players
      const currentPlayers = get(connectedPlayers);
      activeConnections.forEach((c) => {
        if (c.open) {
          c.send({
            type: "PLAYERS_SYNC",
            players: currentPlayers,
          });
        }
      });
    });

    conn.on("error", (err) => {
      console.error("Connection error:", err);
      activeConnections = activeConnections.filter((c) => c !== conn);
      connectedPlayers.update((list) => list.filter((p) => p.peerId !== conn.peer));
      clientCount.set(get(connectedPlayers).length);

      // Sync updated players list to all players
      const currentPlayers = get(connectedPlayers);
      activeConnections.forEach((c) => {
        if (c.open) {
          c.send({
            type: "PLAYERS_SYNC",
            players: currentPlayers,
          });
        }
      });
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

      conn.send({
        type: "JOIN_NAME",
        name: name || get(playerName),
      });
    });

    conn.on("data", (data) => {
      if (data && typeof data === "object") {
        if (data.type === "CARD_PUSH") {
          if (data.card) {
            if (data.isPrivate) {
              // Add to player hand
              receivedCards.update((list) => {
                if (list.some((c) => c.id === data.card.id)) {
                  return list;
                }
                return [...list, data.card];
              });

              if (data.tradeFrom) {
                showToast(`You received a card from ${data.tradeFrom}!`, "success");
              } else {
                showToast("You received a private card from the GM!", "success");
              }

              // Focus on screen only if currently viewing nothing
              if (get(sharedCard) === null) {
                sharedCard.set(data.card);
                sharedCardFlipped.set(data.cardFlipped || false);
                sharedCardShowText.set(false);
              }
            } else {
              // Update global broadcast card state
              globalBroadcastCard.set(data.card);
              globalBroadcastCardFlipped.set(data.cardFlipped || false);

              // Auto-focus on public cards
              sharedCard.set(data.card);
              sharedCardFlipped.set(data.cardFlipped || false);
              sharedCardShowText.set(false);
              showToast("GM shared a card with everyone!", "success");
            }
          } else {
            // Null card is equivalent to clear
            globalBroadcastCard.set(null);
            globalBroadcastCardFlipped.set(false);
            sharedCard.set(null);
            sharedCardFlipped.set(false);
            sharedCardShowText.set(false);
          }
        } else if (data.type === "CARD_FLIP") {
          // Keep background state of global card correct
          globalBroadcastCardFlipped.set(data.cardFlipped);

          // Only flip player's active screen if they are focusing the global card
          const currentFocused = get(sharedCard);
          const globalCard = get(globalBroadcastCard);
          if (currentFocused && globalCard && currentFocused.id === globalCard.id) {
            sharedCardFlipped.set(data.cardFlipped);
          }
        } else if (data.type === "CARD_CLEAR") {
          const currentFocused = get(sharedCard);
          const oldGlobal = get(globalBroadcastCard);

          globalBroadcastCard.set(null);
          globalBroadcastCardFlipped.set(false);

          // Clear player screen only if they were focusing the global card
          if (!currentFocused || (oldGlobal && currentFocused.id === oldGlobal.id)) {
            sharedCard.set(null);
            sharedCardFlipped.set(false);
            sharedCardShowText.set(false);
          }
        } else if (data.type === "TRADE_CONFIRMED") {
          receivedCards.update((list) => list.filter((c) => c.id !== data.cardId));
          if (get(sharedCard) && get(sharedCard).id === data.cardId) {
            sharedCard.set(get(globalBroadcastCard));
            sharedCardFlipped.set(get(globalBroadcastCardFlipped));
            sharedCardShowText.set(false);
          }
          showToast(`Passed card to ${data.targetName}`, "success");
        } else if (data.type === "TRADE_ANNOUNCEMENT") {
          showToast(data.text);
        } else if (data.type === "DISCARD_PILE_SYNC") {
          discardPile.set(data.cards);
        } else if (data.type === "PLAYERS_SYNC") {
          const myId = peer ? peer.id : null;
          const filteredPlayers = data.players.filter((p) => p.peerId !== myId);
          connectedPlayers.set(filteredPlayers);
          clientCount.set(data.players.length);
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
  discardPile.set([]);
  virtualPlayerHands.set({});
}

export function pushCard(card) {
  const role = get(syncRole);
  if (role !== "host") return;

  // Track globally broadcasted card on the host
  globalBroadcastCard.set(card);
  globalBroadcastCardFlipped.set(get(cardFlipped));

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

  const player = get(connectedPlayers).find((p) => p.peerId === peerId);
  if (!player) return;

  if (player.isVirtual) {
    virtualPlayerHands.update((hands) => {
      const hand = hands[peerId] || [];
      if (hand.some((c) => c.id === card.id)) return hands;
      return { ...hands, [peerId]: [...hand, card] };
    });

    const text = `👤 GM sent a card privately to virtual player ${player.name}`;
    activeConnections.forEach((c) => {
      if (c.open) {
        c.send({
          type: "TRADE_ANNOUNCEMENT",
          text: text,
        });
      }
    });
    showToast(`Sent card to virtual player ${player.name}`, "success");
    return;
  }

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

    showToast(`Sent card privately to ${player.name}`, "success");
  }
}

export function pushFlip(isFlipped) {
  const role = get(syncRole);
  if (role !== "host") return;

  // Only push flip if the GM is currently focusing the active table card
  const current = get(currentCard);
  const broadcasted = get(globalBroadcastCard);
  if (current && broadcasted && current.id === broadcasted.id) {
    globalBroadcastCardFlipped.set(isFlipped);
    activeConnections.forEach((conn) => {
      if (conn.open) {
        conn.send({
          type: "CARD_FLIP",
          cardFlipped: isFlipped,
        });
      }
    });
  }
}

export function pushClear() {
  const role = get(syncRole);
  if (role !== "host") return;

  globalBroadcastCard.set(null);
  globalBroadcastCardFlipped.set(false);

  activeConnections.forEach((conn) => {
    if (conn.open) {
      conn.send({
        type: "CARD_CLEAR",
      });
    }
  });
}

export function discardTableCard() {
  const role = get(syncRole);
  if (role !== "host") return;

  const card = get(globalBroadcastCard);
  if (card) {
    discardPile.update((list) => [...list, card]);
    const currentList = get(discardPile);

    globalBroadcastCard.set(null);
    globalBroadcastCardFlipped.set(false);

    activeConnections.forEach((c) => {
      if (c.open) {
        c.send({
          type: "DISCARD_PILE_SYNC",
          cards: currentList,
        });
        c.send({
          type: "CARD_CLEAR",
        });
      }
    });

    showToast(`Discarded table card to the discard pile`);
  }
}

export function recallCardToGM(cardId) {
  const role = get(syncRole);
  if (role !== "host") return;

  const currentList = get(discardPile);
  const card = currentList.find((c) => c.id === cardId);

  if (card) {
    discardPile.update((list) => list.filter((c) => c.id !== cardId));
    const updatedList = get(discardPile);

    activeConnections.forEach((c) => {
      if (c.open) {
        c.send({
          type: "DISCARD_PILE_SYNC",
          cards: updatedList,
        });
      }
    });

    currentCard.set(card);
    cardFlipped.set(false);
    showToast(`Recalled card to GM screen`, "success");
  }
}

export function discardCardToPile(card) {
  if (!card) return;
  const role = get(syncRole);
  if (role === "client") {
    const conn = activeConnections[0];
    if (conn && conn.open) {
      conn.send({
        type: "DISCARD_EVENT",
        card: card,
      });
    }
    receivedCards.update((list) => list.filter((c) => c.id !== card.id));
    if (get(sharedCard) && get(sharedCard).id === card.id) {
      sharedCard.set(get(globalBroadcastCard));
      sharedCardFlipped.set(get(globalBroadcastCardFlipped));
      sharedCardShowText.set(false);
    }
  } else if (role === "host") {
    const broadcasted = get(globalBroadcastCard);
    if (broadcasted && broadcasted.id === card.id) {
      discardTableCard();
    } else {
      discardPile.update((list) => [...list, card]);
      const currentList = get(discardPile);
      activeConnections.forEach((c) => {
        if (c.open) {
          c.send({
            type: "DISCARD_PILE_SYNC",
            cards: currentList,
          });
        }
      });
      showToast("Card discarded to the discard pile");
    }
  }
}

export function requestRecall(cardId) {
  const role = get(syncRole);
  if (role === "client") {
    const conn = activeConnections[0];
    if (conn && conn.open) {
      conn.send({
        type: "RECALL_EVENT",
        cardId: cardId,
      });
    }
  } else if (role === "host") {
    recallCardToGM(cardId);
  }
}

export function passCardTo(targetPeerId, card) {
  if (!card || !targetPeerId) return;
  const role = get(syncRole);
  if (role === "client") {
    const conn = activeConnections[0];
    if (conn && conn.open) {
      conn.send({
        type: "TRADE_REQUEST",
        card: card,
        targetPeerId: targetPeerId,
      });
    }
  }
}

export function addVirtualPlayer(name) {
  const role = get(syncRole);
  if (role !== "host") return;

  const peerId = `virtual-${Math.random().toString(36).substring(2, 9)}`;
  connectedPlayers.update((list) => {
    return [...list, { peerId, name, isVirtual: true }];
  });
  clientCount.set(get(connectedPlayers).length);

  // Initialize empty hand for virtual player
  virtualPlayerHands.update((hands) => {
    return { ...hands, [peerId]: [] };
  });

  // Sync updated players list to all peered players
  const currentPlayers = get(connectedPlayers);
  activeConnections.forEach((c) => {
    if (c.open) {
      c.send({
        type: "PLAYERS_SYNC",
        players: currentPlayers,
      });
    }
  });

  showToast(`Virtual seat "${name}" added`, "success");
}

export function removeVirtualPlayer(peerId) {
  const role = get(syncRole);
  if (role !== "host") return;

  const player = get(connectedPlayers).find((p) => p.peerId === peerId);
  const name = player ? player.name : "Virtual Player";

  connectedPlayers.update((list) => list.filter((p) => p.peerId !== peerId));
  clientCount.set(get(connectedPlayers).length);

  virtualPlayerHands.update((hands) => {
    const updated = { ...hands };
    delete updated[peerId];
    return updated;
  });

  // Sync updated players list to all peered players
  const currentPlayers = get(connectedPlayers);
  activeConnections.forEach((c) => {
    if (c.open) {
      c.send({
        type: "PLAYERS_SYNC",
        players: currentPlayers,
      });
    }
  });

  showToast(`Virtual seat "${name}" removed`);
}

export function discardVirtualCard(peerId, card) {
  const role = get(syncRole);
  if (role !== "host") return;

  virtualPlayerHands.update((hands) => {
    const hand = hands[peerId] || [];
    return { ...hands, [peerId]: hand.filter((c) => c.id !== card.id) };
  });

  // Put card in shared discard pile
  discardPile.update((list) => [...list, card]);
  const currentList = get(discardPile);

  // Sync updated discard pile to all peered players
  activeConnections.forEach((c) => {
    if (c.open) {
      c.send({
        type: "DISCARD_PILE_SYNC",
        cards: currentList,
      });
    }
  });

  // Announce discard to all players
  const player = get(connectedPlayers).find((p) => p.peerId === peerId);
  const playerNameText = player ? player.name : "Virtual player";
  const announcementText = `🗑️ Virtual player ${playerNameText} discarded a card to the discard pile`;
  activeConnections.forEach((c) => {
    if (c.open) {
      c.send({
        type: "TRADE_ANNOUNCEMENT",
        text: announcementText,
      });
    }
  });

  showToast(`Discarded ${playerNameText}'s card`, "success");
}

