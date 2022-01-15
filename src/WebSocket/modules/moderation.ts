import { Module } from "../module";
import { createMessage, extractMessageData, Message, ResponseStatus, Role } from "chelys";
import { Client } from "../../Types/client";
import { userModule } from "./user";
import { isNil } from "lodash";
import { createID, firestore, firestoreTypes } from "../firebase";
import { telemetry } from "./telemetry";

interface ReqKick {
	uid: string;
	cstId: string;
}
interface ReqNeutralize {
	uid: string;
	cstId: string;
}
interface ReqClone {
	cstId: string;
}

interface Song {
	id: number
	shortTitle: string;
	platform: number;
	url: string;
	patron: string;
	author: string;
}
interface OldConstitution {
	id: string;
	season: number;
	part: number;
	name: string;
	isPublic: boolean;
	type: number;
	isLocked: boolean;
	isShowingResult: boolean;

	userTurnID?: string;
	// startDate: Date;
	round: number;

	// Users
	owner: string;
	users: string[];
	winnerUserID: string;
	numberMaxOfUser: number;
	isAnonymous: boolean;

	// Songs
	songs: Song[];
	winnerSongID: number;
	youtubePlaylistID: string;
	numberOfSongsPerUser: number;
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
		this.moduleMap.set("MOD-clone", this.clone);
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
		telemetry.read();
		if (isNil(requester) || !requester.data.roles.includes(Role.ADMIN)) {
			client.socket.send(createMessage<ResponseStatus>(message.event, { success: false, status: "You do not have the permissions to do that!" }));
			return;
		}

		const requestData = extractMessageData<ReqKick>(message);
		const kickedUID = requestData.uid;
		const constitutionID = requestData.cstId;

		telemetry.read(false);
		if (kickedUID == ((await firestore.collection("constitutions").doc(constitutionID).get()).data() as OldConstitution).owner) {
			client.socket.send(createMessage<ResponseStatus>(message.event, { success: false, status: "The owner of a constitution cannot be kicked!" }));
			return;
		}

		// Find user's songs
		const songRefs = await firestore.collection(`constitutions/${constitutionID}/songs`).where("patron", "==", kickedUID).get();
		songRefs.forEach(async (song) => {
			telemetry.read(false);
			song.ref.delete();
			telemetry.write(false);
			// Delete other users votes on user's songs
			const votesToRefs = await firestore.collection(`constitutions/${constitutionID}/votes`).where("songID", "==", (song.data() as Song).id).get();
			votesToRefs.forEach((vote) => {
				telemetry.read(false);
				vote.ref.delete();
				telemetry.write(false);
			});
		});

		// Find user's votes
		const votesFromRefs = await firestore.collection(`constitutions/${constitutionID}/votes`).where("userID", "==", kickedUID).get();
		votesFromRefs.forEach((vote) => {
			telemetry.read(false);
			vote.ref.delete();
			telemetry.write(false);
		});

		// Remove user from user list
		firestore.collection("constitutions").doc(constitutionID).update({ users: firestoreTypes.FieldValue.arrayRemove(kickedUID) });
		telemetry.write(false);

		client.socket.send(createMessage<ResponseStatus>(message.event, { success: true, status: `${kickedUID} was kicked successfully.` }));
	}

	private async neutralize(message: Message<unknown>, client: Client): Promise<void> {
		const requester = userModule.users.get(client.uid);
		telemetry.read();
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
			telemetry.read(false);
			songMap.add((song.data() as Song).id);
		});

		// Find user's votes, and update their values
		const votesFromRefs = await firestore.collection(`constitutions/${constitutionID}/votes`).where("userID", "==", neutralizedID).get();
		votesFromRefs.forEach((vote) => {
			telemetry.read(false);
			vote.ref.update({ grade: 4 });
			telemetry.write(false);
			songMap.delete((vote.data() as Vote).songID);
		});

		// For every vote still in the set, we need to create these votes correctly
		songMap.forEach((songID) => {
			const newVote: Vote = {
				grade: 4,
				id: createID(),
				songID: songID,
				userID: neutralizedID,
			};
			firestore.collection(`constitutions/${constitutionID}/votes`).doc(newVote.id).create(newVote);
			telemetry.write(false);
		});

		client.socket.send(createMessage<ResponseStatus>(message.event, { success: true, status: `${neutralizedID} was successfully neutralized.` }));
	}

	private async clone(message: Message<unknown>, client: Client): Promise<void> {
		const requester = userModule.users.get(client.uid);
		telemetry.read();
		if (isNil(requester) || !requester.data.roles.includes(Role.ADMIN)) {
			client.socket.send(createMessage<ResponseStatus>(message.event, { success: false, status: "You do not have the permissions to do that!" }));
			return;
		}

		const cstID = extractMessageData<ReqClone>(message).cstId;

		// Clone the constitutions's document
		const cstDoc = (await firestore.collection("constitutions").doc(cstID).get()).data() as OldConstitution;
		telemetry.read(false);
		const newCSTID = createID();
		cstDoc.id = newCSTID;
		firestore.collection("constitutions").doc(newCSTID).create(cstDoc);
		telemetry.write(false);

		// Clone the "songs" sub-collection
		(await firestore.collection(`constitutions/${cstID}/songs`).get()).forEach((song) => {
			telemetry.read(false);
			const songData = song.data() as Song;
			firestore.collection(`constitutions/${newCSTID}/songs`).doc(songData.id.toString()).create(songData);
			telemetry.write(false);
		});

		// Clone the "votes" sub-collection
		(await firestore.collection(`constitutions/${cstID}/votes`).get()).forEach((vote) => {
			telemetry.read(false);
			const voteData = vote.data() as Vote;
			firestore.collection(`constitutions/${newCSTID}/votes`).doc(voteData.id).create(voteData);
			telemetry.write(false);
		});

		client.socket.send(createMessage<ResponseStatus>(message.event, { success: true, status: `${cstID} was successfully cloned as ${newCSTID}.` }));
	}
}

export const moderationModule = new ModerationModule();
