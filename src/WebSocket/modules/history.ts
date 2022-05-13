import { createMessage, EventType, History, HistoryResUpdate, Message } from "chelys";
import { Client } from "../../Types/client";
import { firestore } from "../firebase";
import { Module } from "../module";
import { telemetry } from "./telemetry";

export class HistoryModule extends Module {
	public prefix = "HISTORY";

	private path = "pantheon";
	private pantheon: Map<string, History> = new Map();
	private listeners: Set<Client> = new Set();
	
	constructor() {
		super();

		this.moduleMap.set(EventType.HISTORY_get_all, this.getAll);

		firestore.collection(this.path).onSnapshot((collection) => {
			collection.docChanges().forEach((change) => {
				const data = change.doc.data() as History;
				switch (change.type) {
					case "added":
						this.pantheon.set(data.id, data);
						telemetry.read(false);
						this.listeners.forEach((listener) => {
							listener.socket.send(createMessage<HistoryResUpdate>(EventType.HISTORY_update, {history: data}));
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
		this.pantheon.forEach((history) => {
			const updateMessage = createMessage<HistoryResUpdate>(EventType.HISTORY_update, {history});
			client.socket.send(updateMessage);
			telemetry.read();
		});
	}
}

export const historyModule = new HistoryModule();