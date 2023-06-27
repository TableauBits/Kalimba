import { Constitution, ConstitutionType, CstReqCreate, CstReqGet, CstReqJoin, CstResJoin, CstReqState, CstReqUnsubscribe, CstResUpdate, EventType, extractMessageData, KGradeSummary, Message, OWNER_INDEX, ResponseStatus, Role, CstReqNameURL, CstReqDelete, CstResDelete } from "chelys";
import { clamp, isNil } from "lodash";
import { Client } from "../../Types/client";
import { createID, firestore, firestoreTypes } from "../firebase";
import { Module } from "../module";
import { cleanupString, createMessage, FS_CONSTITUTIONS_PATH } from "../utility";
import { telemetry } from "./telemetry";
import { userModule } from "./user";
import { ConstitutionModule } from "./constitution";

const NAME_MAX_LENGTH = 30;

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
		this.moduleMap.set(EventType.CST_name_url, this.nameURL);
		this.moduleMap.set(EventType.CST_state, this.state);
		this.moduleMap.set(EventType.CST_unsubscribe, this.unsubscribe);
		this.moduleMap.set(EventType.CST_delete, this.delete);

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
						this.constitutions.get(newConstitutionData.id)?.listeners.forEach((listener) => {
							listener.socket.send((createMessage<CstResDelete>(EventType.CST_delete, {id: newConstitutionData.id})));
						});

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

		this.allConstitutionsListener.add(client);

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

		const startDate = new Date();

		// Only keep the end date if it happen after the start date (the date of creation)
		let endDate = requestData.endDate;
		if (!isNil(endDate)) {
			const date = new Date(endDate);
			if (date < startDate)
				endDate = undefined;
			else 
				endDate = date.toISOString();
		}

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
			startDate: startDate.toISOString(),
			endDate: endDate,
		};

		this.pendingListens.set(constitution.id, client);

		firestore.collection(FS_CONSTITUTIONS_PATH).doc(constitution.id).create(constitution);
		telemetry.write(false);

		//@TODO(Ithyx): Make a callback map instead
		switch (constitution.type) {
			case ConstitutionType.GRADE: {
				const summary: KGradeSummary = { voteCount: 0, userCount: {} };
				firestore.doc(`${FS_CONSTITUTIONS_PATH}/${constitution.id}/votes/summary`).create(summary);
				telemetry.write(false);

				firestore.doc(`${FS_CONSTITUTIONS_PATH}/${constitution.id}/votes/${client.uid}`).create({ uid: client.uid, values: {} });
				telemetry.write(false);
			} break;
		}

		firestore.doc(`${FS_CONSTITUTIONS_PATH}/${constitution.id}/favs/${client.uid}`).create({ uid: client.uid, favs: [] });
		telemetry.write(false);
	}

	private async delete(message: Message<unknown>, client: Client): Promise<void> {
		const constitutionID = extractMessageData<CstReqDelete>(message).id;
		const constitution = this.constitutions.get(constitutionID);

		if (isNil(constitutionID) || isNil(constitution)) return;

		if (constitution.module.data.users[OWNER_INDEX] !== client.uid) return;		// only the owner can delete a constitution

		const doc = firestore.doc(`${FS_CONSTITUTIONS_PATH}/${constitution.module.data.id}`);
		firestore.recursiveDelete(doc);
	}

	private async join(message: Message<unknown>, client: Client): Promise<void> {
		const constitutionID = extractMessageData<CstReqJoin>(message).id;
		const constitution = this.constitutions.get(constitutionID);
		
		if (isNil(constitutionID) || isNil(constitution)) {
			const response: ResponseStatus = {
				success: false,
				status: "no_constitution",
			};
			client.socket.send(createMessage<CstResJoin>(EventType.CST_join, {status: response}));
			return;
		}

		if (constitution.module.data.maxUserCount === constitution.module.data.users.length) {
			const response: ResponseStatus = {
				success: false,
				status: "constitution_full",
			};
			client.socket.send(createMessage<CstResJoin>(EventType.CST_join, {status: response}));
			return;
		}
		
		if (constitution.module.data.users.includes(client.uid)) {
			const response: ResponseStatus = {
				success: false,
				status: "already_here",
			};
			client.socket.send(createMessage<CstResJoin>(EventType.CST_join, {status: response}));
			return;
		}

		firestore.collection(FS_CONSTITUTIONS_PATH).doc(constitutionID).update({ users: firestoreTypes.FieldValue.arrayUnion(client.uid) });
		telemetry.write(false);

		//@TODO(Ithyx): Make a callback map instead
		switch (constitution.module.data.type) {
			case ConstitutionType.GRADE: {
				firestore.doc(`${FS_CONSTITUTIONS_PATH}/${constitutionID}/votes/${client.uid}`).create({ uid: client.uid, values: {} });
				telemetry.write(false);
			} break;
		}

		firestore.doc(`${FS_CONSTITUTIONS_PATH}/${constitutionID}/favs/${client.uid}`).create({ uid: client.uid, favs: [] });
		telemetry.write(false);
    
		const response: ResponseStatus = {
			success: true,
			status: "",
		};
		client.socket.send(createMessage<CstResJoin>(EventType.CST_join, {status: response}));

	}

	private async nameURL(message: Message<unknown>, client: Client): Promise<void> {
		const req = extractMessageData<CstReqNameURL>(message);
		const cst = this.constitutions.get(req.id);
		if (cst?.module.data.users[OWNER_INDEX] !== client.uid) return;

		firestore.collection(FS_CONSTITUTIONS_PATH).doc(req.id).update({
			name: req.name ? cleanupString(req.name, NAME_MAX_LENGTH) : cst.module.data.name,
			playlistLink : req.url ? req.url : cst.module.data.playlistLink
		});
		telemetry.write(false);
	}

	private async state(message: Message<unknown>, client: Client): Promise<void> {
		const req = extractMessageData<CstReqState>(message);
		const cst = this.constitutions.get(req.id);
		if (cst?.module.data.users[OWNER_INDEX] !== client.uid) return;

		firestore.collection(FS_CONSTITUTIONS_PATH).doc(req.id).update({ state: req.state });		// TODO : Check if state is correct
		telemetry.write(false);
	}

	private async unsubscribe(message: Message<unknown>, client: Client): Promise<void> {
		this.allConstitutionsListener.delete(client);
		
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
