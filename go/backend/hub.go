package main

import (
	"fmt"
	"math/rand"

	"github.com/lxzan/gws"
)

const (
	MaxClients = 256
)

type CID uint16

type Client struct {
	ID   CID
	Conn *gws.Conn
}

// OutboundMessage is a message that is broadcasted to all clients.
type OutboundMessage struct {
	Opcode  gws.Opcode
	Payload []byte
}

// InboundMessage is a message that is received from a client.
type InboundMessage struct {
	Client  *Client
	Payload []byte
}

// Hub maintains a pool of clients and broadcasts messages to connected clients.
// Clients are registered and unregistered automatically.
type Hub struct {
	Clients     map[CID]*Client
	cidPool     []CID
	connections map[*gws.Conn]CID
	broadcast   chan *OutboundMessage
	register    chan *gws.Conn
	unregister  chan *gws.Conn
}

// NewHub creates an instance of Hub with a client pool of capacity {MaxClients}.
func NewHub() *Hub {
	hub := &Hub{
		Clients:     make(map[CID]*Client),
		connections: make(map[*gws.Conn]CID),
		broadcast:   make(chan *OutboundMessage),
		cidPool:     make([]CID, MaxClients),
		register:    make(chan *gws.Conn),
		unregister:  make(chan *gws.Conn),
	}
	for i := 0; i < MaxClients; i++ {
		hub.cidPool[i] = CID(i)
	}

	// Randomize the client IDs so clients won't know the order at which they joined.
	// Auto incrementing IDs are gross idk.
	rand.Shuffle(
		len(hub.cidPool),
		func(i, j int) {
			hub.cidPool[i], hub.cidPool[j] = hub.cidPool[j], hub.cidPool[i]
		},
	)
	go hub.run()
	return hub
}

// Run selects broadcast messages, incoming connections, and disconnection messages.
// Connections are registered automaticaly when opened by the client.
// Diconnect messages are sent when the connection is closed automatically.
func (h *Hub) run() {
	for {
		select {
		case conn := <-h.register: // register a new client
			if len(h.cidPool) == 0 {
				conn.NetConn().Close()
				return
			}
			id := h.cidPool[0]
			h.cidPool = h.cidPool[1:]
			h.connections[conn] = id
			h.Clients[id] = &Client{
				ID:   id,
				Conn: conn,
			}
			if Debug {
				fmt.Println("client registered, id: ", id)
				fmt.Println("curent connsections:")
				for _, c := range h.connections {
					fmt.Println("    id: ", c)
				}
				fmt.Println("curent clients:")
				for _, c := range h.Clients {
					fmt.Println("    id: ", c.ID, ", client address: ", c)
				}
			}
		case conn := <-h.unregister: // unregister a client
			if id, ok := h.connections[conn]; ok {
				delete(h.Clients, id)
				delete(h.connections, conn)
				h.cidPool = append(h.cidPool, id)
				if Debug {
					fmt.Println("client unregistered, id: ", id)
				}
			}
		case message := <-h.broadcast: // broadcast to all clients
			// This does premessage deflate just once rather than for every client.
			b := gws.NewBroadcaster(message.Opcode, message.Payload)
			defer b.Close()
			for _, client := range h.Clients {
				b.Broadcast(client.Conn)
			}
		}
	}
}
