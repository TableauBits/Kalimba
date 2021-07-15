import { Client } from "../../Types/client";
import { EventTypes, Message, ResponseStatus, User } from "../../Types/common";
import { firestore } from "../firebase";
import { Module } from "../module";
import { createMessage, extractMessageData } from "../utility";

const FS_USERS_PATH = "users/";

interface ReqGetOne {
	uid: string;
}
interface ReqGetMany {
	uids: string[];
}
interface ReqEdit {
	userData: User;
}

interface ResGetOne {
	userInfo: User
}
interface ResGetMany {
	userInfos: User[]
}
interface ResGetAll {
	userInfos: User[]
}
interface ResEdit {
	response: ResponseStatus
}


export class UserModule extends Module {

	public prefix = "USER";

	constructor() {
		super();
		this.moduleMap.set(EventTypes.USER_get_one, this.getOne);
		this.moduleMap.set(EventTypes.USER_get_many, this.getMany);
		this.moduleMap.set(EventTypes.USER_get_all, this.getAll);
		this.moduleMap.set(EventTypes.USER_edit, this.edit);
		this.moduleMap.set(EventTypes.USER_create, this.create);
	}

	private async getOne(message: Message<unknown>, _: Client): Promise<string> {
		const uid = extractMessageData<ReqGetOne>(message).uid;

		const document = await firestore.collection(FS_USERS_PATH).doc(uid).get();
		if (!document.exists) {
			throw new Error(`User with userid ${uid} does not exist!`);
		}
		return createMessage<ResGetOne>(EventTypes.USER_get_one, { userInfo: document.data() as User });
	}

	private async getMany(message: Message<unknown>, _: Client): Promise<string> {
		const uids = extractMessageData<ReqGetMany>(message).uids;

		const references: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>[] = [];
		const userCollection = firestore.collection(FS_USERS_PATH);
		for (const uid of uids) {
			references.push(userCollection.doc(uid));
		}

		const userDatas: User[] = [];
		const documents = await firestore.getAll(...references);
		for (const document of documents) {
			if (!document.exists)
				continue;
			userDatas.push(document.data() as User);
		}
		return createMessage<ResGetMany>(EventTypes.USER_get_many, { userInfos: userDatas });
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

		client.socket.send(await eventCallback(message, client));
		return true;
	}
}
