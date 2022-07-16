import { createMessage, EventType, PantheonSong, PantheonResUpdate, Message } from "chelys";
import { Client } from "../../Types/client";
import { firestore } from "../firebase";
import { Module } from "../module";
import { telemetry } from "./telemetry";

export class PantheonModule extends Module {
	public prefix = "PANTHEON";

	private path = "pantheon";
	private pantheon: Map<string, PantheonSong> = new Map();
	private listeners: Set<Client> = new Set();
	
	constructor() {
		super();

		this.moduleMap.set(EventType.PANTHEON_get_all, this.getAll);

		firestore.collection(this.path).onSnapshot((collection) => {
			collection.docChanges().forEach((change) => {
				const data = change.doc.data() as PantheonSong;
				switch (change.type) {
					case "added":
						this.pantheon.set(data.id, data);
						telemetry.read(false);
						this.listeners.forEach((listener) => {
							listener.socket.send(createMessage<PantheonResUpdate>(EventType.PANTHEON_update, {pantheon: data}));
						});
					// TODO : case modified / deleted ?
				}
			});
		});
	}

	public async handleEvent(message: Message<unknown>, client: Client): Promise<boolean> {
		const eventCallback = this.moduleMap.get(message.event);
		if (eventCallback === undefined) {
			return false;
		}

		eventCallback.apply(this, [message, client]);
		return true;
	}

	public onClose(client: Client): void {
		this.listeners.delete(client);
	}

	private async getAll(_: Message<unknown>, client: Client): Promise<void> {
		this.listeners.add(client);
		this.pantheon.forEach((pantheon) => {
			const updateMessage = createMessage<PantheonResUpdate>(EventType.PANTHEON_update, {pantheon});
			client.socket.send(updateMessage);
			telemetry.read();
		});
	}
}

export const pantheonModule = new PantheonModule();