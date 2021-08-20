import { EventType, Message, Role, User, UsrReqEdit, UsrReqGet, UsrReqUnsubscribe, UsrResUpdate, createMessage, extractMessageData } from "@tableaubits/hang";
import { isNil } from "lodash";
import { Client } from "../../Types/client";
import { createID, firestore } from "../firebase";
import { Module } from "../module";
import { cleanupString } from "../utility";
import { telemetry } from "./telemetry";

const FS_USERS_PATH = "users/";

interface SubscriptionData {
	data: User;
	listeners: Set<Client>;
}

const DISPLAY_NAME_MAX_LENGTH = 25;
const DESCRIPTION_MAX_LENGTH = 140;

class UserModule extends Module {

	public prefix = "USER";
	public users: Map<string, SubscriptionData> = new Map();
	private allUsersListener: Set<Client> = new Set();

	constructor() {
		super();
		this.moduleMap.set(EventType.USER_get, this.get);
		this.moduleMap.set(EventType.USER_get_all, this.getAll);
		this.moduleMap.set(EventType.USER_edit, this.edit);
		this.moduleMap.set(EventType.USER_create, this.create);
		this.moduleMap.set(EventType.USER_unsubscribe, this.unsubscribe);

		firestore.collection(FS_USERS_PATH).onSnapshot((collection) => {
			for (const change of collection.docChanges()) {
				const newUserData = change.doc.data() as User;
				const updateMessage = createMessage<UsrResUpdate>(EventType.USER_update, { userInfo: newUserData });
				switch (change.type) {
					case "added":
						this.users.set(newUserData.uid, { data: newUserData, listeners: new Set(this.allUsersListener) });
						this.allUsersListener.forEach((listener) => {
							listener.socket.send(updateMessage);
							telemetry.read();
						});
						telemetry.read(false);
						break;

					case "removed":
						// @TODO(Ithyx): Send deletion event (or something idk)
						this.users.delete(newUserData.uid);
						break;

					case "modified": {
						const user = this.users.get(newUserData.uid);
						if (isNil(user)) return;
						user.data = newUserData;
						user.listeners.forEach((listener) => {
							listener.socket.send(updateMessage);
							telemetry.read();
						});
						telemetry.read(false);
					} break;
				}
			}
		});
	}

	private async get(message: Message<unknown>, client: Client): Promise<void> {
		const uids = extractMessageData<UsrReqGet>(message).uids;
		for (const uid of uids) {
			const user = this.users.get(uid);
			if (isNil(user)) continue;

			user.listeners.add(client);
			client.socket.send(createMessage<UsrResUpdate>(EventType.USER_update, { userInfo: user.data }));
			telemetry.read();
		}
	}

	private async getAll(_: Message<unknown>, client: Client): Promise<void> {
		this.allUsersListener.add(client);
		this.users.forEach((user) => {
			user.listeners.add(client);
			client.socket.send(createMessage<UsrResUpdate>(EventType.USER_update, { userInfo: user.data }));
			telemetry.read();
		});
	}

	private async edit(message: Message<unknown>, client: Client): Promise<void> {
		const requestData = extractMessageData<UsrReqEdit>(message).userData;
		const localUser = this.users.get(requestData.uid);
		if (client.uid !== requestData.uid || isNil(localUser)) {
			return;
		}

		const updateData = {
			displayName: cleanupString(requestData.displayName ?? localUser.data.displayName, DISPLAY_NAME_MAX_LENGTH),
			photoURL: requestData.photoURL ?? localUser.data.photoURL,
			description: cleanupString(requestData.description ?? localUser.data.description, DESCRIPTION_MAX_LENGTH),
		};

		firestore.collection(FS_USERS_PATH).doc(client.uid).update(updateData);
		telemetry.write(false);
	}

	private async create(message: Message<unknown>, client: Client): Promise<void> {
		const requestData = extractMessageData<UsrReqEdit>(message).userData;
		if (isNil(requestData)
			|| client.uid !== requestData.uid
			|| isNil(requestData.email)
			|| isNil(requestData.displayName)
			|| isNil(requestData.photoURL)
			|| isNil(requestData.description)) {
			return;
		}

		const user: User = {
			uid: createID(),
			email: requestData.email,
			displayName: cleanupString(requestData.displayName, DISPLAY_NAME_MAX_LENGTH),
			photoURL: requestData.photoURL,
			roles: [Role.MEMBER],
			description: cleanupString(requestData.description, DESCRIPTION_MAX_LENGTH),
		};

		firestore.collection(FS_USERS_PATH).doc(requestData.uid).create(user);
		telemetry.write(false);
	}

	private async unsubscribe(message: Message<unknown>, client: Client): Promise<void> {
		const uids = extractMessageData<UsrReqUnsubscribe>(message).uids;
		for (const uid of uids) {
			const user = this.users.get(uid);
			if (isNil(user)) continue;

			user.listeners.delete(client);
		}
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
		this.users.forEach((user: SubscriptionData) => {
			user.listeners.delete(client);
		});
		this.allUsersListener.delete(client);
	}
}

export const userModule = new UserModule();
