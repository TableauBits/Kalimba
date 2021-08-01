import { clamp, isNil } from "lodash";
import { Client } from "../../Types/client";
import { Constitution, ConstitutionType as ConstitutionTypes, EventTypes, Message, Roles } from "../../Types/common";
import { createID, firestore, firestoreTypes } from "../firebase";
import { Module } from "../module";
import { cleanupString, createMessage, extractMessageData } from "../utility";
import { users } from "./user";

const FS_CONSTITUTION_PATH = "matday/";

interface ReqGet {
	ids: string[];
}
interface ReqCreate {
	cstData: Constitution;
}
interface ReqJoin {
	id: string;
}
interface ReqUnsubscribe {
	ids: string[];
}

interface ResUpdate {
	cstInfo: Constitution;
}

interface SubscriptionData {
	data: Constitution;
	listeners: Set<Client>;
}

export class ConstitutionModule extends Module {
	public prefix = "CST";
	private constitutions: Map<string, SubscriptionData> = new Map();
	private allConstitutionsListener: Set<Client> = new Set();
	private pendingListens: Map<string, Client> = new Map();

	constructor() {
		super();
		this.moduleMap.set(EventTypes.CST_get, this.get);
		this.moduleMap.set(EventTypes.CST_get_from_user, this.getFromUser);
		this.moduleMap.set(EventTypes.CST_create, this.create);
		this.moduleMap.set(EventTypes.CST_join, this.join);
		this.moduleMap.set(EventTypes.CST_unsubscribe, this.unsubscribe);

		firestore.collection(FS_CONSTITUTION_PATH).onSnapshot((collection) => {
			for (const change of collection.docChanges()) {
				const newConstitutionData = change.doc.data() as Constitution;
				const updateMessage = createMessage<ResUpdate>(EventTypes.USER_update, { cstInfo: newConstitutionData });
				switch (change.type) {
					case "added": {
						const newListeners: Set<Client> = new Set(this.allConstitutionsListener);
						const pendingListener = this.pendingListens.get(newConstitutionData.id);
						if (!isNil(pendingListener)) {
							newListeners.add(pendingListener);
							this.pendingListens.delete(newConstitutionData.id);
						}
						this.constitutions.set(newConstitutionData.id, { data: newConstitutionData, listeners: newListeners });
						newListeners.forEach((listener) => {
							listener.socket.send(createMessage<ResUpdate>(EventTypes.CST_update, { cstInfo: newConstitutionData }));
						});
					} break;

					case "removed":
						// @TODO(Ithyx): Send deletion event (or something idk)
						this.constitutions.delete(newConstitutionData.id);
						break;

					case "modified": {
						const constitution = this.constitutions.get(newConstitutionData.id);
						if (isNil(constitution)) return;
						constitution.data = newConstitutionData;
						constitution.listeners.forEach((listener) => {
							listener.socket.send(updateMessage);
						});
					} break;
				}
			}
		});
	}

	private async get(message: Message<unknown>, client: Client): Promise<void> {
		const uids = extractMessageData<ReqGet>(message).ids;
		for (const uid of uids) {
			const constitution = this.constitutions.get(uid);
			if (isNil(constitution)) continue;

			constitution.listeners.add(client);
			client.socket.send(createMessage<ResUpdate>(EventTypes.USER_update, { cstInfo: constitution.data }));
		}
	}

	private async getFromUser(_: Message<unknown>, client: Client): Promise<void> {
		// Constitutions a user can access:
		//  * public constitutions
		//  * constitutions they are already a member of

		this.constitutions.forEach((constitution) => {
			const { isPublic, users } = constitution.data;
			if (isPublic || users.includes(client.uid)) {
				constitution.listeners.add(client);
				client.socket.send(createMessage<ResUpdate>(EventTypes.CST_update, { cstInfo: constitution.data }));
			}
		});
	}

	private async create(message: Message<unknown>, client: Client): Promise<void> {
		const requestData = extractMessageData<ReqCreate>(message).cstData;

		if (isNil(requestData)) return;
		const user = users.get(client.uid);
		// A user can create a constitution if they are admin
		if (isNil(user) || !user.data.roles.includes(Roles.ADMIN)) return;
		if (requestData.type ?? ConstitutionTypes.LENGTH >= ConstitutionTypes.LENGTH) return;

		const NAME_MAX_LENGTH = 30;

		const constitution: Constitution = {
			id: createID(),
			season: requestData.season ?? 0,
			part: requestData.part ?? 0,
			name: cleanupString(requestData.name ?? "", NAME_MAX_LENGTH),
			isPublic: requestData.isPublic ?? false,
			anonymousLevel: requestData.anonymousLevel ?? 0,
			type: requestData.type ?? ConstitutionTypes.GRADE,
			state: 0,
			users: [client.uid],
			numberOfSongsPerUser: clamp(requestData.numberOfSongsPerUser ?? 1, 1, 25),
		};

		this.pendingListens.set(constitution.id, client);

		firestore.collection(FS_CONSTITUTION_PATH).doc(constitution.id).create(constitution);
	}

	private async join(message: Message<unknown>, client: Client): Promise<void> {
		const constitutionID = extractMessageData<ReqJoin>(message).id;
		if (isNil(constitutionID) || !this.constitutions.has(constitutionID)) return;

		firestore.collection(FS_CONSTITUTION_PATH).doc(constitutionID).update({ users: firestoreTypes.FieldValue.arrayUnion(client.uid) });
	}

	private async unsubscribe(message: Message<unknown>, client: Client): Promise<void> {
		const uids = extractMessageData<ReqUnsubscribe>(message).ids;
		for (const uid of uids) {
			const constitution = this.constitutions.get(uid);
			if (isNil(constitution)) continue;

			constitution.listeners.delete(client);
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
		this.constitutions.forEach((constitution: SubscriptionData) => {
			constitution.listeners.delete(client);
		});
		this.allConstitutionsListener.delete(client);
	}
}
