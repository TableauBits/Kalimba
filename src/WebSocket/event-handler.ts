import WebSocket from "ws";
import { Client } from "../Types/client";
import { EventTypes, Message, ResponseStatus } from "../Types/common";
import { auth } from "./firebase";
import { Module } from "./module";
import { UserModule } from "./modules/user";
import { createMessage } from "./utility";

const modules: Module[] = [new UserModule()];
const clients: Client[] = [];

export function setupWS(ws: WebSocket): void {
	ws.onmessage = async (event) => {
		const message = JSON.parse(event.data.toString()) as Message<string>;
		if (message.event !== EventTypes.CLIENT_authenticate) {
			console.warn(`WS event receieved before authentication! Event ${event.data.toString()} ignored...`);
			return;
		}
		auth
			.verifyIdToken(message.data)
			.then((idToken) => {
				const newClient: Client = {
					socket: ws,
					firebaseJWT: message.data,
					uid: idToken.uid,
				};
				clients.push(newClient);
				console.log("New client authenticated:", newClient.uid);
				ws.onclose = onClose;
				ws.onmessage = handleEvents;
				const response: ResponseStatus = {
					success: true,
					status: idToken.uid
				};
				ws.send(createMessage(EventTypes.CLIENT_authenticate, response));
			})
			.catch((reason) => {
				const response: ResponseStatus = {
					success: false,
					status: reason,
				};
				console.error("Client failed to authenticate:", response);
				ws.send(createMessage(EventTypes.CLIENT_authenticate, response));
				ws.close();
			});
	};
}

function onClose(event: WebSocket.CloseEvent): void {
	// remove socket from client list
	const clientIndex = clients.findIndex((candidate) => candidate.socket === event.target);
	if (clientIndex === -1) {
		console.error("Could not remove client from list!");
	}
	clients.splice(clientIndex, 1);
}

async function delegateToModules(message: Message<unknown>, client: Client) {
	let handled = false;
	for (const module of modules) {
		if (message.event.startsWith(module.prefix)) {
			try {
				handled = await module.handleEvent(message, client);
			} catch (reason: unknown) {
				console.error("Internal error encountered:", reason);
				client.socket.send(createMessage<ResponseStatus>(message.event, {
					success: false, status: `Unknown error encountered (${reason}). ` +
						"Make sure your request is according to the documentation: https://github.com/TableauBits/Kalimba/wiki/Protocole-de-communication"
				}));
				handled = true;
			}
		}
	}

	if (!handled) {
		console.warn("Event", message, "was not handled by any module! Sending dummy response.");
		client.socket.send(createMessage(message.event, undefined));
	}
}

function handleEvents(event: WebSocket.MessageEvent): void {
	let message: Message<unknown>;
	try {
		message = JSON.parse(event.data.toString()) as Message<unknown>;
	} catch (error: unknown) {
		console.error(`Could not parse event (${event})!`);
		return;
	}
	const client = clients.find((candidate) => candidate.socket === event.target);
	if (client === undefined) {
		console.warn(`Event received for unregistered client (${event.target})!`);
		return;
	}

	delegateToModules(message, client);
}
