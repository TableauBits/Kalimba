import { createMessage, EventType, extractMessageData, Invite, InvReqCheck, InvReqDelete, InvResCheck, InvResUpdate, Message, Role } from "chelys";
import { isNil } from "lodash";
import { Client } from "../../Types/client";
import { auth, createID, firestore } from "../firebase";
import { Module } from "../module";
import { telemetry } from "./telemetry";
import { userModule } from "./user";


class InviteModule extends Module {
	public prefix = "INVITE";

	private path = "invites";
	private invites: Map<string, Invite> = new Map();

	private listeners: Set<Client> = new Set();

	constructor() {
		super();

		this.moduleMap.set(EventType.INVITE_new, this.new);
		this.moduleMap.set(EventType.INVITE_delete, this.delete);
		this.moduleMap.set(EventType.INVITE_get_all, this.getAll);
		this.moduleMap.set(EventType.INVITE_check, this.check);
		this.moduleMap.set(EventType.INVITE_unsubscribe, this.unsubscribe);

		firestore.collection(this.path).onSnapshot((collection) => {
			for (const change of collection.docChanges()) {
				const data = change.doc.data() as Invite;
				let updateMessage: string;
				switch (change.type) {
					case "added" || "modified":
						this.invites.set(data.id, data);
						telemetry.read(false);
						updateMessage = createMessage<InvResUpdate>(EventType.INVITE_update, { invite: data, status: "added" });
						break;
					case "removed":
						this.invites.delete(data.id);
						updateMessage = createMessage<InvResUpdate>(EventType.INVITE_update, { invite: data, status: "removed" });
						break;
				}
				this.listeners.forEach((listener) => {
					listener.socket.send(updateMessage);
					telemetry.read();
				});
			}
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

	private isDev(uid: string): boolean {
		const user = userModule.users.get(uid);
		return !(isNil(user) || !user.data.roles.includes(Role.DEV));
	}

	public async new(_: Message<unknown>, client: Client): Promise<void> {
		if (!this.isDev(client.uid)) return;

		const invite: Invite = {
			createdBy: client.uid,
			date: new Date().toISOString(),
			id: createID()
		};

		firestore.doc(`${this.path}/${invite.id}`).create(invite);
		telemetry.write(false);
	}

	public async delete(message: Message<unknown>, client: Client): Promise<void> {
		if (!this.isDev(client.uid)) return;

		const id = extractMessageData<InvReqDelete>(message).id;

		firestore.doc(`${this.path}/${id}`).delete();
	}

	public async getAll(_: Message<unknown>, client: Client): Promise<void> {
		if (!this.isDev(client.uid)) return;

		this.listeners.add(client);

		this.invites.forEach((invite) => {
			const updateMessage = createMessage<InvResUpdate>(EventType.INVITE_update, { invite: invite, status: "added" });
			client.socket.send(updateMessage);
			telemetry.read();
		});
	}

	public async check(message: Message<unknown>, client: Client): Promise<void> {
		const request = extractMessageData<InvReqCheck>(message);
		const invite = this.invites.get(request.id);
		telemetry.read();

		if (isNil(invite)) {
			const response = createMessage<InvResCheck>(EventType.INVITE_check, { status: { success: false, status: "The invite doesn't exist !" } });
			client.socket.send(response);
			return;
		}

		const newAccount = {
			uid: request.account.uid,
			email: request.account.email,
			displayName: request.account.displayName,
			photoURL: request.account.photoURL
		};

		try {
			await auth.createUser(newAccount);
		} catch (error) {
			console.log(`Failed to create new firebase user: ${error}`);
			return;
		}
		try {
			await userModule.createUser(newAccount);
		} catch (error) {
			console.log(`Failed to create new MATBay! user: ${error}`);
			await auth.deleteUser(newAccount.uid);
			return;
		}

		this.invites.delete(invite.id);
	}

	public async unsubscribe(_: Message<unknown>, client: Client): Promise<void> {
		this.listeners.delete(client);
	}

	public onClose(client: Client): void {
		this.listeners.delete(client);
	}
}

export const inviteModule = new InviteModule();

