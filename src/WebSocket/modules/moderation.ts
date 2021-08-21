import { Module } from "../module";
import { createMessage, extractMessageData, Message, ResponseStatus, Role } from "@tableaubits/hang";
import { Client } from "../../Types/client";
import { userModule } from "./user";
import { isNil } from "lodash";
import { createID, firestore, firestoreTypes } from "../firebase";

interface ReqKick {
	uid: string;
	cstId: string;
}
interface ReqNeutralize {
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

interface Vote {
	grade: number;
	id: string;
	songID: number;
	userID: string
}

class ModerationModule extends Module {
	public prefix = "MOD";

	constructor() {
		super();
		this.moduleMap.set("MOD-kick", this.kick);
		this.moduleMap.set("MOD-neutralize", this.neutralize);
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

	private async neutralize(message: Message<unknown>, client: Client): Promise<void> {
		const requester = userModule.users.get(client.uid);
		if (isNil(requester) || !requester.data.roles.includes(Role.ADMIN)) {
			client.socket.send(createMessage<ResponseStatus>(message.event, { success: false, status: "You do not have the permissions to do that!" }));
			return;
		}

		const requestData = extractMessageData<ReqNeutralize>(message);
		const neutralizedID = requestData.uid;
		const constitutionID = requestData.cstId;

		// Build the set of songs where a user should have voted for
		const songMap: Set<number> = new Set();
		const totalSongRefs = await firestore.collection(`constitutions/${constitutionID}/songs`).where("patron", "!=", neutralizedID).get();
		totalSongRefs.forEach((song) => {
			songMap.add((song.data() as Song).id);
		});

		// Find user's votes, and update their values
		const votesFromRefs = await firestore.collection(`constitutions/${constitutionID}/votes`).where("userID", "==", neutralizedID).get();
		votesFromRefs.forEach((vote) => {
			vote.ref.update({ grade: 5 });
			songMap.delete((vote.data() as Vote).songID);
		});

		// For every vote still in the set, we need to create these votes correctly
		songMap.forEach((songID) => {
			const newVote: Vote = {
				grade: 5,
				id: createID(),
				songID: songID,
				userID: neutralizedID,
			};
			firestore.collection(`constitutions/${constitutionID}/votes`).doc(newVote.id).create(newVote);
		});

		client.socket.send(createMessage<ResponseStatus>(message.event, { success: true, status: `${neutralizedID} was successfully neutralized.` }));
	}

}

export const moderationModule = new ModerationModule();
