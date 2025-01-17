package main

import (
	"log"
	"time"

	"github.com/lxzan/gws"
)

const (
	EventBufferSize = 2048
	UpdateInterval  = time.Second
)

type Game struct {
	hub     *Hub
	inbound chan *InboundMessage
}

func NewGame(hub *Hub) *Game {
	return &Game{
		hub:     hub,
		inbound: make(chan *InboundMessage, EventBufferSize),
	}
}

func (g *Game) Run() {
	ticker := time.NewTicker(UpdateInterval)
	quit := make(chan struct{})
	go func() {
		for {
			select {
			case <-ticker.C:
				g.tick()
			case <-quit:
				ticker.Stop()
				return
			}
		}
	}()
}

func (g *Game) tick() {
inbound:
	for {
		select {
		case message := <-g.inbound:
			log.Println("message ", message.Payload)
		default:
			{
				break inbound
			}
		}
	}

	g.hub.broadcast <- &OutboundMessage{
		Opcode:  gws.OpcodeBinary,
		Payload: []uint8{1, 2, 3},
	}
}
