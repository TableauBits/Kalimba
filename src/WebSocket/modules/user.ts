import { isNil } from "lodash";
import { Client } from "../../Types/client";
import { EventTypes, Message, User } from "../../Types/common";
import { firestore } from "../firebase";
import { Module } from "../module";
import { createMessage, extractMessageData } from "../utility";

const FS_USERS_PATH = "users/";

interface ReqGet {
	uids: string[];
}
interface ReqEdit {
	userData: User;
}

interface ResUpdate {
	userInfo: User;
}

interface SubscriptionData {
	clients: Client[];
	unsubscribe: () => void;
}

export class UserModule extends Module {

	public prefix = "USER";
	private subscriptions: Map<string, SubscriptionData> = new Map();

	constructor() {
		super();
		this.moduleMap.set(EventTypes.USER_get, this.get);
		this.moduleMap.set(EventTypes.USER_get_all, this.getAll);
		this.moduleMap.set(EventTypes.USER_edit, this.edit);
		this.moduleMap.set(EventTypes.USER_create, this.create);
	}

	private async subscribeToUIDs(uids: string[], client: Client): Promise<void> {
		const userCollection = firestore.collection(FS_USERS_PATH);
		for (const uid of uids) {
			// Check if requested user exists in DB
			const userDoc = await userCollection.doc(uid).get();
			if (!userDoc.exists || isNil(uid)) continue;

			// Check if user already has clients listening for it's changes
			if (!this.subscriptions.has(uid)) {
				// New listener: Firestore automatically sends initial data through an update
				this.subscriptions.set(uid, { clients: [client], unsubscribe: () => { return; } });
				const subData = this.subscriptions.get(uid);
				if (!isNil(subData)) {
					const unsubscribe = firestore.collection(FS_USERS_PATH).doc(uid).onSnapshot((doc) => {
						console.log("update received for USER", uid, "sending to", subData.clients.length, "clients.");
						subData.clients.forEach((client) => {
							client.socket.send(createMessage<ResUpdate>(EventTypes.USER_update, { userInfo: doc.data() as User }));
						});
					});
					subData.unsubscribe = unsubscribe;
				}
			} else {
				// Already existing listener: we need to replicate firestore's initial update
				this.subscriptions.get(uid)?.clients.push(client);
				client.socket.send(createMessage<ResUpdate>(EventTypes.USER_update, { userInfo: userDoc.data() as User }));
				console.log("sending fake initial update from uid", uid);
			}
		}
	}

	private async get(message: Message<unknown>, client: Client): Promise<void> {
		const uids = extractMessageData<ReqGet>(message).uids;
		this.subscribeToUIDs(uids, client);
	}

	private async getAll(_: Message<unknown>, client: Client): Promise<void> {
		const uids: string[] = [];
		(await firestore.collection(FS_USERS_PATH).get()).forEach((userDoc) => {
			uids.push((userDoc.data() as User).uid);
		});
		this.subscribeToUIDs(uids, client);
	}

	private async edit(message: Message<unknown>, client: Client): Promise<void> {
		const user = extractMessageData<ReqEdit>(message).userData;
		if (client.uid !== user.uid) {
			return;
		}

		firestore.collection(FS_USERS_PATH).doc(user.uid).set(user, { merge: true });
	}

	private async create(message: Message<unknown>, client: Client): Promise<void> {
		this.edit(message, client);
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
			const index = subData.clients.findIndex((c) => c === client);
			if (index > 0) subData.clients.splice(index, 1);
		});
	}
}
