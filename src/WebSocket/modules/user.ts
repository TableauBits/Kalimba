import { isEmpty, isNil } from "lodash";
import { Client } from "../../Types/client";
import { EventTypes, Message, ResponseStatus, User } from "../../Types/common";
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

interface ResGet {
	userInfos: User[];
}
interface ResGetAll {
	userInfos: User[];
}
interface ResEdit {
	response: ResponseStatus;
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

	private async get(message: Message<unknown>, client: Client): Promise<string> {
		const uids = extractMessageData<ReqGet>(message).uids;
		const references: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>[] = [];
		const userCollection = firestore.collection(FS_USERS_PATH);
		for (const uid of uids) {
			references.push(userCollection.doc(uid));
			if (!this.subscriptions.has(uid)) {
				this.subscriptions.set(uid, { clients: [client], unsubscribe: () => { return; } });
				const subData = this.subscriptions.get(uid);
				if (!isNil(subData)) {
					const unsubscribe = firestore.collection(FS_USERS_PATH).doc(uid).onSnapshot((doc) => {
						subData.clients.forEach((client) => {
							console.log("sending update...");
							client.socket.send(createMessage<ResUpdate>(EventTypes.USER_update, { userInfo: doc.data() as User }));
						});
					});
					subData.unsubscribe = unsubscribe;
				}
			} else {
				this.subscriptions.get(uid)?.clients.push(client);
			}
		}

		const userDatas: User[] = [];
		const documents = await firestore.getAll(...references);
		for (const document of documents) {
			if (!document.exists) continue;
			userDatas.push(document.data() as User);
		}

		return createMessage<ResGet>(EventTypes.USER_get, { userInfos: userDatas });
	}

	private async getAll(_m: Message<unknown>, _c: Client): Promise<string> {
		const documents = await firestore.collection(FS_USERS_PATH).get();

		const userDatas: User[] = [];
		documents.forEach((document) => {
			userDatas.push(document.data() as User);
		});
		return createMessage<ResGetAll>(EventTypes.USER_get_all, { userInfos: userDatas });
	}

	private async edit(message: Message<unknown>, client: Client): Promise<string> {
		const user = extractMessageData<ReqEdit>(message).userData;
		if (client.uid !== user.uid) {
			const status: ResponseStatus = {
				success: false,
				status: "You do not have the permissions to change the provided user's data!"
			};
			return createMessage<ResEdit>(EventTypes.USER_edit, { response: status });
		}

		const status: ResponseStatus = await firestore.collection(FS_USERS_PATH).doc(user.uid).set(user, { merge: true })
			.then(() => { return { success: true, status: "Successfully updated user profile." }; })
			.catch((reason) => { return { success: false, status: `Failed to update user profile: ${reason}` }; });

		return createMessage<ResEdit>(EventTypes.USER_edit, { response: status });
	}

	private async create(message: Message<unknown>, client: Client): Promise<string> {
		const user = extractMessageData<ReqEdit>(message).userData;
		if (client.uid !== user.uid) {
			const status: ResponseStatus = {
				success: false,
				status: "Provided UID does not match your UID!"
			};
			return createMessage<ResEdit>(EventTypes.USER_edit, { response: status });
		}

		const status: ResponseStatus = await firestore.collection(FS_USERS_PATH).doc(user.uid).set(user, { merge: true })
			.then(() => { return { success: true, status: "Successfully updated user profile." }; })
			.catch((reason) => { return { success: false, status: `Failed to update user profile: ${reason}` }; });

		return createMessage<ResEdit>(EventTypes.USER_edit, { response: status });
	}

	public async handleEvent(message: Message<unknown>, client: Client): Promise<boolean> {
		const eventCallback = this.moduleMap.get(message.event);
		if (eventCallback === undefined) {
			return false;
		}

		client.socket.send(await eventCallback.apply(this, [message, client]));
		return true;
	}

	public onClose(client: Client): void {
		this.subscriptions.forEach((subData: SubscriptionData, uid: string) => {
			const index = subData.clients.findIndex((c) => c === client);
			if (index > 0) subData.clients.splice(index, 1);
			if (isEmpty(subData.clients)) {
				subData.unsubscribe();
				this.subscriptions.delete(uid);
			}
		});
	}
}
