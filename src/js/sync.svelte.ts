import { Peer, type DataConnection } from "peerjs";
import { showToast } from "./toastStore.svelte";
import { appState, type Card } from "./state.svelte";

export interface Player {
  peerId: string;
  name: string;
  isVirtual: boolean;
}

class SyncManager {
  // Reactive properties using runes
  role = $state<"none" | "host" | "client">("none");
  roomCode = $state<string>("");
  connectionState = $state<"disconnected" | "connecting" | "connected" | "error">("disconnected");
  clientCount = $state<number>(0);
  sharedCard = $state<Card | null>(null);
  sharedCardFlipped = $state<boolean>(false);
  sharedCardShowText = $state<boolean>(false);
  syncError = $state<string>("");

  #playerName = $state<string>(localStorage.getItem("playerName") || "Player");
  get playerName() {
    return this.#playerName;
  }
  set playerName(val: string) {
    this.#playerName = val;
    localStorage.setItem("playerName", val);
  }

  connectedPlayers = $state<Player[]>([]); // Array of { peerId, name, isVirtual }
  receivedCards = $state<Card[]>([]); // Array of card objects (Player's hand)
  globalBroadcastCard = $state<Card | null>(null); // Last public card broadcasted by GM
  globalBroadcastCardFlipped = $state<boolean>(false); // Flip state of last public card
  autoShareMode = $state<string>("global"); // "global", "private", "player"
  autoShareTarget = $state<string>(""); // peerId of target player
  discardPile = $state<Card[]>([]); // Array of card objects (Shared discard pile)
  virtualPlayerHands = $state<Record<string, Card[]>>({}); // Dictionary of peerId -> card[]
}

export const syncState = new SyncManager();

let peer: Peer | null = null;
let activeConnections: DataConnection[] = [];

export function startHosting(): void {
  disconnect();

  syncState.connectionState = "connecting";
  syncState.role = "host";
  syncState.syncError = "";

  // Generate a random 6-digit room code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  syncState.roomCode = code;

  const peerId = `vibedeck-room-${code}`;

  try {
    peer = new Peer(peerId, {
      debug: 1, // Only log errors
    });
  } catch (e: any) {
    console.error(e);
    syncState.connectionState = "error";
    syncState.syncError = "Could not initialize peer connection.";
    return;
  }

  peer.on("open", () => {
    syncState.connectionState = "connected";
    showToast(`Table created! Code: ${code}`, "success");

    // Push the current card if one is already drawn
    const card = appState.currentCard;
    if (card) {
      pushCard(card);
    }
  });

  peer.on("connection", (conn: DataConnection) => {
    conn.on("open", () => {
      // Avoid duplicate connections in our tracking
      if (!activeConnections.find((c) => c.peer === conn.peer)) {
        activeConnections.push(conn);
      }
    });

    conn.on("data", (data: any) => {
      if (data && typeof data === "object") {
        if (data.type === "JOIN_NAME") {
          syncState.connectedPlayers = [
            ...syncState.connectedPlayers.filter((p) => p.peerId !== conn.peer),
            { peerId: conn.peer, name: data.name, isVirtual: false },
          ];
          syncState.clientCount = syncState.connectedPlayers.length;
          showToast(`${data.name} joined the table`, "success");

          // Sync updated players list to all players
          const currentPlayers = syncState.connectedPlayers;
          activeConnections.forEach((c) => {
            if (c.open) {
              c.send({
                type: "PLAYERS_SYNC",
                players: currentPlayers,
              });
            }
          });

          // Sync last globally broadcasted card immediately to the new player
          const card = syncState.globalBroadcastCard;
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
              cardFlipped: syncState.globalBroadcastCardFlipped,
              isPrivate: false,
            });
          }

          // Sync current discard pile immediately to the new player
          const dCards = syncState.discardPile;
          if (dCards.length > 0) {
            conn.send({
              type: "DISCARD_PILE_SYNC",
              cards: dCards,
            });
          }
        } else if (data.type === "TRADE_REQUEST") {
          const sender = syncState.connectedPlayers.find((p) => p.peerId === conn.peer);
          const senderName = sender ? sender.name : "A player";
          const recipient = syncState.connectedPlayers.find((p) => p.peerId === data.targetPeerId);
          const recipientName = recipient ? recipient.name : "another player";

          // Broker virtual player trade
          if (recipient && recipient.isVirtual) {
            const hand = syncState.virtualPlayerHands[data.targetPeerId] || [];
            if (!hand.some((c) => c.id === data.card.id)) {
              syncState.virtualPlayerHands[data.targetPeerId] = [...hand, data.card];
            }

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
          const sender = syncState.connectedPlayers.find((p) => p.peerId === conn.peer);
          const senderName = sender ? sender.name : "A player";

          syncState.discardPile.push(data.card);
          const currentList = syncState.discardPile;

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
          const sender = syncState.connectedPlayers.find((p) => p.peerId === conn.peer);
          const senderName = sender ? sender.name : "A player";

          const cardId = data.cardId;
          const currentList = syncState.discardPile;
          const card = currentList.find((c) => c.id === cardId);

          if (card) {
            syncState.discardPile = syncState.discardPile.filter((c) => c.id !== cardId);
            const updatedList = syncState.discardPile;

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
      const closingPlayer = syncState.connectedPlayers.find((p) => p.peerId === conn.peer);
      const name = closingPlayer ? closingPlayer.name : "A player";

      activeConnections = activeConnections.filter((c) => c !== conn);
      syncState.connectedPlayers = syncState.connectedPlayers.filter((p) => p.peerId !== conn.peer);
      syncState.clientCount = syncState.connectedPlayers.length;
      showToast(`${name} left the table`);

      // Sync updated players list to all players
      const currentPlayers = syncState.connectedPlayers;
      activeConnections.forEach((c) => {
        if (c.open) {
          c.send({
            type: "PLAYERS_SYNC",
            players: currentPlayers,
          });
        }
      });
    });

    conn.on("error", (err: any) => {
      console.error("Connection error:", err);
      activeConnections = activeConnections.filter((c) => c !== conn);
      syncState.connectedPlayers = syncState.connectedPlayers.filter((p) => p.peerId !== conn.peer);
      syncState.clientCount = syncState.connectedPlayers.length;

      // Sync updated players list to all players
      const currentPlayers = syncState.connectedPlayers;
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

  peer.on("error", (err: any) => {
    console.error("Peer error:", err);
    if (err.type === "unavailable-id") {
      // Retry once with a new code
      startHosting();
    } else {
      syncState.connectionState = "error";
      syncState.syncError = `Connection error: ${err.message || err.type}`;
      showToast("Table connection error", "error");
    }
  });
}

export function joinTable(code: string, name?: string): void {
  if (!code || code.trim().length !== 6) {
    showToast("Room code must be 6 digits", "error");
    return;
  }

  disconnect();

  syncState.connectionState = "connecting";
  syncState.role = "client";
  syncState.roomCode = code;
  syncState.syncError = "";

  try {
    peer = new Peer({
      debug: 1,
    });
  } catch (e: any) {
    console.error(e);
    syncState.connectionState = "error";
    syncState.syncError = "Could not initialize peer connection.";
    return;
  }

  peer.on("open", () => {
    const hostPeerId = `vibedeck-room-${code}`;
    const conn = peer!.connect(hostPeerId, {
      reliable: true,
    });

    conn.on("open", () => {
      syncState.connectionState = "connected";
      showToast("Connected to GM's table!", "success");
      activeConnections = [conn];

      // Send name to GM immediately
      conn.send({
        type: "JOIN_NAME",
        name: name || syncState.playerName,
      });
    });

    conn.on("data", (data: any) => {
      if (data && typeof data === "object") {
        if (data.type === "CARD_PUSH") {
          if (data.card) {
            if (data.isPrivate) {
              // Add to player hand
              if (!syncState.receivedCards.some((c) => c.id === data.card.id)) {
                syncState.receivedCards.push(data.card);
              }

              if (data.tradeFrom) {
                showToast(`You received a card from ${data.tradeFrom}!`, "success");
              } else {
                showToast("You received a private card from the GM!", "success");
              }

              // Focus on screen only if currently viewing nothing
              if (syncState.sharedCard === null) {
                syncState.sharedCard = data.card;
                syncState.sharedCardFlipped = data.cardFlipped || false;
                syncState.sharedCardShowText = false;
              }
            } else {
              // Update global broadcast card state
              syncState.globalBroadcastCard = data.card;
              syncState.globalBroadcastCardFlipped = data.cardFlipped || false;

              // Auto-focus on public cards
              syncState.sharedCard = data.card;
              syncState.sharedCardFlipped = data.cardFlipped || false;
              syncState.sharedCardShowText = false;
              showToast("GM shared a card with everyone!", "success");
            }
          } else {
            // Null card is equivalent to clear
            syncState.globalBroadcastCard = null;
            syncState.globalBroadcastCardFlipped = false;
            syncState.sharedCard = null;
            syncState.sharedCardFlipped = false;
            syncState.sharedCardShowText = false;
          }
        } else if (data.type === "CARD_FLIP") {
          // Keep background state of global card correct
          syncState.globalBroadcastCardFlipped = data.cardFlipped;

          // Only flip player's active screen if they are focusing the global card
          const currentFocused = syncState.sharedCard;
          const globalCard = syncState.globalBroadcastCard;
          if (currentFocused && globalCard && currentFocused.id === globalCard.id) {
            syncState.sharedCardFlipped = data.cardFlipped;
          }
        } else if (data.type === "CARD_CLEAR") {
          const currentFocused = syncState.sharedCard;
          const oldGlobal = syncState.globalBroadcastCard;

          syncState.globalBroadcastCard = null;
          syncState.globalBroadcastCardFlipped = false;

          // Clear player screen only if they were focusing the global card
          if (!currentFocused || (oldGlobal && currentFocused.id === oldGlobal.id)) {
            syncState.sharedCard = null;
            syncState.sharedCardFlipped = false;
            syncState.sharedCardShowText = false;
          }
        } else if (data.type === "TRADE_CONFIRMED") {
          syncState.receivedCards = syncState.receivedCards.filter((c) => c.id !== data.cardId);
          const currentFocused = syncState.sharedCard;
          if (currentFocused && currentFocused.id === data.cardId) {
            syncState.sharedCard = syncState.globalBroadcastCard;
            syncState.sharedCardFlipped = syncState.globalBroadcastCardFlipped;
            syncState.sharedCardShowText = false;
          }
          showToast(`Passed card to ${data.targetName}`, "success");
        } else if (data.type === "TRADE_ANNOUNCEMENT") {
          showToast(data.text);
        } else if (data.type === "DISCARD_PILE_SYNC") {
          syncState.discardPile = data.cards;
        } else if (data.type === "PLAYERS_SYNC") {
          const myId = peer ? peer.id : null;
          const filteredPlayers = data.players.filter((p: Player) => p.peerId !== myId);
          syncState.connectedPlayers = filteredPlayers;
          syncState.clientCount = data.players.length;
        }
      }
    });

    conn.on("close", () => {
      syncState.connectionState = "disconnected";
      showToast("Disconnected from GM's table", "error");
      disconnect();
    });

    conn.on("error", (err: any) => {
      console.error("Connection error:", err);
      syncState.connectionState = "error";
      syncState.syncError = "Lost connection to GM.";
      showToast("Connection to GM failed", "error");
    });
  });

  peer.on("error", (err: any) => {
    console.error("Peer error:", err);
    syncState.connectionState = "error";
    if (err.type === "peer-unavailable") {
      syncState.syncError = `Table ${code} not found. Verify room code.`;
    } else {
      syncState.syncError = `Connection error: ${err.message || err.type}`;
    }
    showToast("Failed to join table", "error");
  });
}

export function disconnect(): void {
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

  syncState.role = "none";
  syncState.roomCode = "";
  syncState.connectionState = "disconnected";
  syncState.clientCount = 0;
  syncState.sharedCard = null;
  syncState.sharedCardFlipped = false;
  syncState.sharedCardShowText = false;
  syncState.syncError = "";
  syncState.connectedPlayers = [];
  syncState.receivedCards = [];
  syncState.discardPile = [];
  syncState.virtualPlayerHands = {};
}

export function pushCard(card: Card | null): void {
  const role = syncState.role;
  if (role !== "host") return;

  // Track globally broadcasted card on the host
  syncState.globalBroadcastCard = card;
  syncState.globalBroadcastCardFlipped = appState.cardFlipped;

  const payload = {
    type: "CARD_PUSH",
    card: card
      ? {
          id: card.id,
          front: card.front,
          back: card.back,
          text: card.text,
          pageNum: card.pageNum,
          annotations: card.annotations,
        }
      : null,
    cardFlipped: appState.cardFlipped,
    isPrivate: false,
  };

  activeConnections.forEach((conn) => {
    if (conn.open) {
      conn.send(payload);
    }
  });
}

export function sendCardTo(peerId: string, card: Card | null): void {
  const role = syncState.role;
  if (role !== "host" || !card) return;

  const player = syncState.connectedPlayers.find((p) => p.peerId === peerId);
  if (!player) return;

  if (player.isVirtual) {
    const hand = syncState.virtualPlayerHands[peerId] || [];
    if (!hand.some((c) => c.id === card.id)) {
      syncState.virtualPlayerHands[peerId] = [...hand, card];
    }

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
            annotations: card.annotations,
          }
        : null,
      cardFlipped: false,
      isPrivate: true,
    });

    showToast(`Sent card privately to ${player.name}`, "success");
  }
}

export function pushFlip(isFlipped: boolean): void {
  const role = syncState.role;
  if (role !== "host") return;

  // Only push flip if the GM is currently focusing the active table card
  const current = appState.currentCard;
  const broadcasted = syncState.globalBroadcastCard;
  if (current && broadcasted && current.id === broadcasted.id) {
    syncState.globalBroadcastCardFlipped = isFlipped;
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

export function pushClear(): void {
  const role = syncState.role;
  if (role !== "host") return;

  syncState.globalBroadcastCard = null;
  syncState.globalBroadcastCardFlipped = false;

  activeConnections.forEach((conn) => {
    if (conn.open) {
      conn.send({
        type: "CARD_CLEAR",
      });
    }
  });
}

export function discardTableCard(): void {
  const role = syncState.role;
  if (role !== "host") return;

  const card = syncState.globalBroadcastCard;
  if (card) {
    syncState.discardPile.push(card);
    const currentList = syncState.discardPile;

    syncState.globalBroadcastCard = null;
    syncState.globalBroadcastCardFlipped = false;

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

export function recallCardToGM(cardId: string): void {
  const role = syncState.role;
  if (role !== "host") return;

  const currentList = syncState.discardPile;
  const card = currentList.find((c) => c.id === cardId);

  if (card) {
    syncState.discardPile = syncState.discardPile.filter((c) => c.id !== cardId);
    const updatedList = syncState.discardPile;

    activeConnections.forEach((c) => {
      if (c.open) {
        c.send({
          type: "DISCARD_PILE_SYNC",
          cards: updatedList,
        });
      }
    });

    appState.currentCard = card;
    appState.cardFlipped = false;
    showToast(`Recalled card to GM screen`, "success");
  }
}

export function discardCardToPile(card: Card | null): void {
  if (!card) return;
  const role = syncState.role;
  if (role === "client") {
    const conn = activeConnections[0];
    if (conn && conn.open) {
      conn.send({
        type: "DISCARD_EVENT",
        card: card,
      });
    }
    syncState.receivedCards = syncState.receivedCards.filter((c) => c.id !== card.id);
    const currentFocused = syncState.sharedCard;
    if (currentFocused && currentFocused.id === card.id) {
      syncState.sharedCard = syncState.globalBroadcastCard;
      syncState.sharedCardFlipped = syncState.globalBroadcastCardFlipped;
      syncState.sharedCardShowText = false;
    }
  } else if (role === "host") {
    const broadcasted = syncState.globalBroadcastCard;
    if (broadcasted && broadcasted.id === card.id) {
      discardTableCard();
    } else {
      syncState.discardPile.push(card);
      const currentList = syncState.discardPile;
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

export function requestRecall(cardId: string): void {
  const role = syncState.role;
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

export function passCardTo(targetPeerId: string, card: Card | null): void {
  if (!card || !targetPeerId) return;
  const role = syncState.role;
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

export function addVirtualPlayer(name: string): void {
  const role = syncState.role;
  if (role !== "host") return;

  const peerId = `virtual-${Math.random().toString(36).substring(2, 9)}`;
  syncState.connectedPlayers.push({ peerId, name, isVirtual: true });
  syncState.clientCount = syncState.connectedPlayers.length;

  // Initialize empty hand for virtual player
  syncState.virtualPlayerHands[peerId] = [];

  // Sync updated players list to all peered players
  const currentPlayers = syncState.connectedPlayers;
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

export function removeVirtualPlayer(peerId: string): void {
  const role = syncState.role;
  if (role !== "host") return;

  const player = syncState.connectedPlayers.find((p) => p.peerId === peerId);
  const name = player ? player.name : "Virtual Player";

  syncState.connectedPlayers = syncState.connectedPlayers.filter((p) => p.peerId !== peerId);
  syncState.clientCount = syncState.connectedPlayers.length;

  delete syncState.virtualPlayerHands[peerId];

  // Sync updated players list to all peered players
  const currentPlayers = syncState.connectedPlayers;
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

export function discardVirtualCard(peerId: string, card: Card): void {
  const role = syncState.role;
  if (role !== "host") return;

  const hand = syncState.virtualPlayerHands[peerId] || [];
  syncState.virtualPlayerHands[peerId] = hand.filter((c) => c.id !== card.id);

  // Put card in shared discard pile
  syncState.discardPile.push(card);
  const currentList = syncState.discardPile;

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
  const player = syncState.connectedPlayers.find((p) => p.peerId === peerId);
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
