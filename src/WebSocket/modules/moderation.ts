import { Module } from "../module";
import { createMessage, extractMessageData, Message, ResponseStatus, Role } from "@tableaubits/hang";
import { Client } from "../../Types/client";
import { userModule } from "./user";
import { isNil } from "lodash";
import { firestore, firestoreTypes } from "../firebase";

interface ReqKick {
	uid: string;
	cstId: string;
}

interface Song {
	id: number;
	patron: string;
}

interface OldConstitution {
	owner: string;
}

class ModerationModule extends Module {
	public prefix = "MOD";

	constructor() {
		super();
		this.moduleMap.set("MOD-kick", this.kick);
	}

	public async handleEvent(message: Message<unknown>, client: Client): Promise<boolean> {
		const eventCallback = this.moduleMap.get(message.event);
		if (eventCallback === undefined) {
			return false;
		}

		eventCallback.apply(this, [message, client]);
		return true;
	}

	public onClose(_: Client): void {
		return;
	}

	private async kick(message: Message<unknown>, client: Client): Promise<void> {
		const requester = userModule.users.get(client.uid);
		if (isNil(requester) || !requester.data.roles.includes(Role.ADMIN)) {
			client.socket.send(createMessage<ResponseStatus>(message.event, { success: false, status: "You do not have the permissions to do that!" }));
			return;
		}

		const requestData = extractMessageData<ReqKick>(message);
		const kickedUID = requestData.uid;
		const constitutionID = requestData.cstId;

		if (kickedUID == ((await firestore.collection("constitutions").doc(constitutionID).get()).data() as OldConstitution).owner) {
			client.socket.send(createMessage<ResponseStatus>(message.event, { success: false, status: "The owner of a constitution cannot be kicked!" }));
			return;
		}

		// Find user's songs
		const songRefs = await firestore.collection(`constitutions/${constitutionID}/songs`).where("patron", "==", kickedUID).get();
		songRefs.forEach(async (song) => {
			song.ref.delete();
			// Delete other users votes on user's songs
			const votesToRefs = await firestore.collection(`constitutions/${constitutionID}/votes`).where("songID", "==", (song.data() as Song).id).get();
			votesToRefs.forEach((vote) => {
				vote.ref.delete();
			});
		});

		// Find user's votes
		const votesFromRefs = await firestore.collection(`constitutions/${constitutionID}/votes`).where("userID", "==", kickedUID).get();
		votesFromRefs.forEach((vote) => {
			vote.ref.delete();
		});

		// Remove user from user list
		firestore.collection("constitutions").doc(constitutionID).update({ users: firestoreTypes.FieldValue.arrayRemove(kickedUID) });

		client.socket.send(createMessage<ResponseStatus>(message.event, { success: true, status: `${kickedUID} was kicked successfully.` }));
	}

}

export const moderationModule = new ModerationModule();
