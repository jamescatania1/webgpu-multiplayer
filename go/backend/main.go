package main

import (
	"log"
	"net/http"
	"time"

	"github.com/lxzan/gws"
)

const (
	Debug    = true
	PingWait = 10 * time.Second
)

var hub = NewHub()
var game = NewGame(hub)

func main() {
	upgrader := gws.NewUpgrader(&Handler{}, &gws.ServerOption{
		ParallelEnabled:   true,
		Recovery:          gws.Recovery,
		PermessageDeflate: gws.PermessageDeflate{Enabled: true},
	})
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("hi!"))
	})
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r)
		if err != nil {
			return
		}
		go func() {
			conn.ReadLoop()
		}()
	})

	go game.Run()

	http.ListenAndServe("0.0.0.0:8080", nil)
}

type Handler struct{}

func (c *Handler) OnOpen(conn *gws.Conn) {
	_ = conn.SetDeadline(time.Now().Add(time.Hour * 12))
	hub.register <- conn
}

func (c *Handler) OnClose(conn *gws.Conn, err error) {
	conn.NetConn().Close()
	hub.unregister <- conn
}

func (c *Handler) OnPing(conn *gws.Conn, payload []byte) {
	_ = conn.SetDeadline(time.Now().Add(PingWait))
	_ = conn.WritePong(nil)
}

func (c *Handler) OnPong(socket *gws.Conn, payload []byte) {}

func (c *Handler) OnMessage(conn *gws.Conn, message *gws.Message) {
	defer message.Close()
	if client, ok := hub.Clients[hub.connections[conn]]; ok {
		game.inbound <- &InboundMessage{
			Client:  client,
			Payload: message.Bytes(),
		}
	} else {
		conn.NetConn().Close()
		if Debug {
			log.Println("Received message from unregistered client. Closing connection.")
		}
	}
}
