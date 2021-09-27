import { Constitution, ConstitutionType, CstReqCreate, CstReqGet, CstReqJoin, CstReqUnsubscribe, CstResUpdate, EventType, extractMessageData, GradeSummary, Message, Role } from "chelys";
import { clamp, isNil } from "lodash";
import { Client } from "../../Types/client";
import { createID, firestore, firestoreTypes } from "../firebase";
import { Module } from "../module";
import { cleanupString, createMessage, FS_CONSTITUTIONS_PATH } from "../utility";
import { telemetry } from "./telemetry";
import { userModule } from "./user";
import { ConstitutionModule } from "./constitution";

interface SubscriptionData {
	module: ConstitutionModule;
	listeners: Set<Client>;
}

interface ConstitutionID {
	cstId: string;
}

class ConstitutionManagerModule extends Module {
	public prefix = "CST";
	public constitutions: Map<string, SubscriptionData> = new Map();
	private allConstitutionsListener: Set<Client> = new Set();
	private pendingListens: Map<string, Client> = new Map();

	constructor() {
		super();
		this.moduleMap.set(EventType.CST_get, this.get);
		this.moduleMap.set(EventType.CST_get_from_user, this.getFromUser);
		this.moduleMap.set(EventType.CST_create, this.create);
		this.moduleMap.set(EventType.CST_join, this.join);
		this.moduleMap.set(EventType.CST_unsubscribe, this.unsubscribe);

		firestore.collection(FS_CONSTITUTIONS_PATH).onSnapshot((collection) => {
			for (const change of collection.docChanges()) {
				const newConstitutionData = change.doc.data() as Constitution;
				const updateMessage = createMessage<CstResUpdate>(EventType.CST_update, { cstInfo: newConstitutionData });
				switch (change.type) {
					case "added": {
						const newListeners: Set<Client> = new Set(this.allConstitutionsListener);
						const pendingListener = this.pendingListens.get(newConstitutionData.id);
						if (!isNil(pendingListener)) {
							newListeners.add(pendingListener);
							this.pendingListens.delete(newConstitutionData.id);
						}
						this.constitutions.set(newConstitutionData.id, { module: new ConstitutionModule(newConstitutionData), listeners: newListeners });
						newListeners.forEach((listener) => {
							listener.socket.send(createMessage<CstResUpdate>(EventType.CST_update, { cstInfo: newConstitutionData }));
							telemetry.read();
						});
						telemetry.read(false);
					} break;

					case "removed":
						// @TODO(Ithyx): Send deletion event (or something idk)
						this.constitutions.delete(newConstitutionData.id);
						break;

					case "modified": {
						const constitution = this.constitutions.get(newConstitutionData.id);
						if (isNil(constitution)) return;
						constitution.module.updateData(newConstitutionData);
						constitution.listeners.forEach((listener) => {
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
		const uids = extractMessageData<CstReqGet>(message).ids;
		for (const uid of uids) {
			const constitution = this.constitutions.get(uid);
			if (isNil(constitution)) continue;

			constitution.listeners.add(client);
			client.socket.send(createMessage<CstResUpdate>(EventType.CST_update, { cstInfo: constitution.module.data }));
			telemetry.read();
		}
	}

	private async getFromUser(_: Message<unknown>, client: Client): Promise<void> {
		// Constitutions a user can access:
		//  * public constitutions
		//  * constitutions they are already a member of

		this.constitutions.forEach((constitution) => {
			const { isPublic, users } = constitution.module.data;
			if (isPublic || users.includes(client.uid)) {
				constitution.listeners.add(client);
				client.socket.send(createMessage<CstResUpdate>(EventType.CST_update, { cstInfo: constitution.module.data }));
				telemetry.read();
			}
		});
	}

	private async create(message: Message<unknown>, client: Client): Promise<void> {
		const requestData = extractMessageData<CstReqCreate>(message).cstData;

		if (isNil(requestData)) return;
		const user = userModule.users.get(client.uid);
		// A user can create a constitution if they are admin
		if (isNil(user) || !user.data.roles.includes(Role.ADMIN)) return;
		if (requestData.type ?? ConstitutionType.LENGTH >= ConstitutionType.LENGTH) return;
		if (isNil(requestData.playlistLink)) return;

		const NAME_MAX_LENGTH = 30;

		const constitution: Constitution = {
			id: createID(),
			season: requestData.season ?? 0,
			part: requestData.part ?? 0,
			name: cleanupString(requestData.name ?? "", NAME_MAX_LENGTH),
			isPublic: requestData.isPublic ?? false,
			anonymousLevel: requestData.anonymousLevel ?? 0,
			type: requestData.type ?? ConstitutionType.GRADE,
			state: 0,
			playlistLink: requestData.playlistLink,
			users: [client.uid],
			maxUserCount: clamp(requestData.maxUserCount ?? 1, 1, 10),
			numberOfSongsPerUser: clamp(requestData.numberOfSongsPerUser ?? 1, 1, 25),
		};

		this.pendingListens.set(constitution.id, client);

		firestore.collection(FS_CONSTITUTIONS_PATH).doc(constitution.id).create(constitution);

		//@TODO(Ithyx): Make a callback map instead
		switch (constitution.type) {
			case ConstitutionType.GRADE: {
				const summary: GradeSummary = { voteCount: 0 };
				firestore.doc(`${FS_CONSTITUTIONS_PATH}/${constitution.id}/votes/summary`).create(summary);
				telemetry.write(false);
			} break;
		}

		telemetry.write(false);
	}

	private async join(message: Message<unknown>, client: Client): Promise<void> {
		const constitutionID = extractMessageData<CstReqJoin>(message).id;
		if (isNil(constitutionID) || !this.constitutions.has(constitutionID)) return;

		firestore.collection(FS_CONSTITUTIONS_PATH).doc(constitutionID).update({ users: firestoreTypes.FieldValue.arrayUnion(client.uid) });
		telemetry.write(false);
	}

	private async unsubscribe(message: Message<unknown>, client: Client): Promise<void> {
		const uids = extractMessageData<CstReqUnsubscribe>(message).ids;
		for (const uid of uids) {
			const constitution = this.constitutions.get(uid);
			if (isNil(constitution)) continue;

			constitution.listeners.delete(client);
		}
	}

	public async handleEvent(message: Message<unknown>, client: Client): Promise<boolean> {
		const eventCallback = this.moduleMap.get(message.event);
		if (eventCallback === undefined) {
			// Try to send event to constitution
			const cstID = (message.data as ConstitutionID).cstId;
			if (!isNil(cstID)) {
				const constitution = this.constitutions.get(cstID);
				if (!isNil(constitution)) return await constitution.module.handleEvent(message, client);
			}
			return false;
		}

		eventCallback.apply(this, [message, client]);
		return true;
	}

	public onClose(client: Client): void {
		this.constitutions.forEach(constitution => constitution.listeners.delete(client));
		this.allConstitutionsListener.delete(client);
	}
}

export const constitutionModule = new ConstitutionManagerModule();
