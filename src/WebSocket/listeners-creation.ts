import * as admin from "firebase-admin";
import WebSocket from "ws";
import { Client } from "../Types/client";
import { EventTypes, Message, ResponseStatus } from "../Types/common";
import { createMessage } from "./utility";

const clients: Client[] = [];

export function authenticateWS(ws: WebSocket): void {
	ws.onmessage = async (event) => {
		const message = JSON.parse(event.data.toString()) as Message<string>;
		if (message.event !== EventTypes.CLIENT_authenticate) {
			console.warn(`WS event receieved before authentication! Event ${event.data.toString()} ignored...`);
			return;
		}
		admin
			.auth()
			.verifyIdToken(message.data)
			.then((value) => {
				const newClient: Client = {
					socket: ws,
					firebaseJWT: message.data,
					uid: value.uid,
				};
				clients.push(newClient);
				console.log("New client authenticated: ", newClient);
				ws.onmessage = createListeners;
				const response: ResponseStatus = {
					success: true,
					status: `Successfully authenticated as ${value.email}`
				};
				ws.send(response);
			})
			.catch((reason) => {
				const response: ResponseStatus = {
					success: false,
					status: reason,
				};
				console.error("Client failed to authenticate: ", response);
				ws.send(createMessage(EventTypes.CLIENT_authenticate, response));
				ws.close();
			});
	};
}

function createListeners(event: WebSocket.MessageEvent): void {
	const message = JSON.parse(event.data.toString()) as Message<unknown>;
	switch (message.event) {
		case "test":
			console.log("received test event");
			break;

		default:
			console.log("Unknown event received! ", message);
			break;
	}
}
