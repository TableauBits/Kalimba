import WebSocket from "ws";

// represents a client form the point of view of the server
export interface Client {
	socket: WebSocket;
	firebaseJWT: string;
	uid: string;
}
