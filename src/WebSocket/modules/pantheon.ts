import { createMessage, EventType, PantheonSong, PantheonResUpdate, Message, extractMessageData, PantheonReqAdd, Role } from "chelys";
import { isNil } from "lodash";
import { Client } from "../../Types/client";
import { createID, firestore } from "../firebase";
import { Module } from "../module";
import { telemetry } from "./telemetry";
import { userModule } from "./user";

export class PantheonModule extends Module {
	public prefix = "PANTHEON";

	private path = "pantheon";
	private pantheon: Map<string, PantheonSong> = new Map();
	private listeners: Set<Client> = new Set();
	
	constructor() {
		super();

		this.moduleMap.set(EventType.PANTHEON_get_all, this.getAll);
		this.moduleMap.set(EventType.PANTHEON_unsubscribe, this.unsubscribe);
		this.moduleMap.set(EventType.PANTHEON_add, this.add);

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

	private isAdmin(uid: string): boolean {
		const user = userModule.users.get(uid);
		if (isNil(user)) return false;
		return user?.data.roles.includes(Role.ADMIN);
	}

	private async add(message: Message<unknown>, client: Client): Promise<void> {
		// Only admin can update the pantheon
		if (this.isAdmin(client.uid)) return;
		
		const data = extractMessageData<PantheonReqAdd>(message).pantheon;

		const song: PantheonSong = {
			...data,
			id: createID()
		};
		firestore.doc(`${this.path}/${song.id}`).create(song);
		telemetry.write(false);
	}

	private async getAll(_: Message<unknown>, client: Client): Promise<void> {
		this.listeners.add(client);
		this.pantheon.forEach((pantheon) => {
			const updateMessage = createMessage<PantheonResUpdate>(EventType.PANTHEON_update, {pantheon});
			client.socket.send(updateMessage);
			telemetry.read();
		});
	}

	private async unsubscribe(_: Message<unknown>, client: Client): Promise<void> {
		this.listeners.delete(client);
		return;
	}
}

export const pantheonModule = new PantheonModule();