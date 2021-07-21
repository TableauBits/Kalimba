import { isNil } from "lodash";
import { Client } from "../../Types/client";
import { EventTypes, Message, User } from "../../Types/common";
import { firestore } from "../firebase";
import { Module } from "../module";
import { createMessage, extractMessageData, removeFromArray } from "../utility";

const FS_USERS_PATH = "users/";

interface ReqGet {
	uids: string[];
}
interface ReqEdit {
	userData: User;
}
interface ReqUnsubscribe {
	uids: string[];
}

interface ResUpdate {
	userInfo: User;
}

interface SubscriptionData {
	userData: User;
	listeners: Client[];
}

export class UserModule extends Module {

	public prefix = "USER";
	private subscriptions: Map<string, SubscriptionData> = new Map();
	private allUsersListener: Client[] = [];

	constructor() {
		super();
		this.moduleMap.set(EventTypes.USER_get, this.get);
		this.moduleMap.set(EventTypes.USER_get_all, this.getAll);
		this.moduleMap.set(EventTypes.USER_edit, this.edit);
		this.moduleMap.set(EventTypes.USER_create, this.edit);
		this.moduleMap.set(EventTypes.USER_unsubscribe, this.unsubscribe);

		firestore.collection(FS_USERS_PATH).onSnapshot((collection) => {
			for (const change of collection.docChanges()) {
				const userData = change.doc.data() as User;
				const updateMessage = createMessage<ResUpdate>(EventTypes.USER_update, { userInfo: userData });
				switch (change.type) {
					case "added":
						this.subscriptions.set(userData.uid, { userData: userData, listeners: [...this.allUsersListener] });
						for (const listener of this.allUsersListener) {
							listener.socket.send(updateMessage);
						}
						break;

					case "removed":
						// @TODO(Ithyx): Send deletion event (or something idk)
						this.subscriptions.delete(userData.uid);
						break;

					case "modified": {
						const localData = this.subscriptions.get(userData.uid);
						if (isNil(localData)) return;
						localData.userData = userData;
						for (const listener of localData.listeners) {
							listener.socket.send(updateMessage);
						}
					} break;
				}
			}
		});
	}

	private async get(message: Message<unknown>, client: Client): Promise<void> {
		const uids = extractMessageData<ReqGet>(message).uids;
		for (const uid of uids) {
			const localData = this.subscriptions.get(uid);
			if (isNil(localData)) continue;

			localData.listeners.push(client);
			client.socket.send(createMessage<ResUpdate>(EventTypes.USER_update, { userInfo: localData.userData }));
		}
	}

	private async getAll(_: Message<unknown>, client: Client): Promise<void> {
		this.allUsersListener.push(client);
		this.subscriptions.forEach((subscription) => {
			subscription.listeners.push(client);
		});

		this.subscriptions.forEach((subscription) => {
			client.socket.send(createMessage<ResUpdate>(EventTypes.USER_update, { userInfo: subscription.userData }));
		});
	}

	private async edit(message: Message<unknown>, client: Client): Promise<void> {
		const user = extractMessageData<ReqEdit>(message).userData;
		if (client.uid !== user.uid) {
			return;
		}

		const DISPLAY_NAME_MAX_LENGTH = 25;
		const DESCRIPTION_MAX_LENGTH = 140;

		// Remove empty lines and limit username to 25 chars
		user.displayName.replace(/^\s*\n/gm, "");
		user.displayName = user.displayName.substring(0, Math.min(user.displayName.length, DISPLAY_NAME_MAX_LENGTH));

		// Remove empty lines and limit description to 140 chars
		user.description.replace(/^\s*\n/gm, "");
		user.description = user.description.substring(0, Math.min(user.description.length, DESCRIPTION_MAX_LENGTH));

		firestore.collection(FS_USERS_PATH).doc(user.uid).set(user, { merge: true });
	}

	private async unsubscribe(message: Message<unknown>, client: Client): Promise<void> {
		const uids = extractMessageData<ReqUnsubscribe>(message).uids;
		for (const uid of uids) {
			const localData = this.subscriptions.get(uid);
			if (isNil(localData)) continue;

			removeFromArray(client, localData.listeners);
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
		this.subscriptions.forEach((subData: SubscriptionData) => {
			removeFromArray(client, subData.listeners);
		});
		removeFromArray(client, this.allUsersListener);
	}
}
