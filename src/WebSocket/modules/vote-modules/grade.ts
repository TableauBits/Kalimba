import { canModifyVotes, createMessage, EventType, extractMessageData, GradeReqEdit, GradeReqUnsubscribe, GradeResSummaryUpdate, Message, KGradeSummary, KGradeUserData, GradeResUserDataUpdate, Song } from "chelys";
import { inRange, isNil, toString } from "lodash";
import { Client } from "../../../Types/client";
import { VoteData } from "../../../Types/vote-data";
import { firestore, firestoreTypes } from "../../firebase";
import { FS_CONSTITUTIONS_PATH } from "../../utility";
import { telemetry } from "../telemetry";
import { VoteModule } from "./vote";

export class GradeVoteModule extends VoteModule {
	prefix = "GRADE";

	private summary: KGradeSummary = { voteCount: 0, userCount: {} };
	private summaryListeners: Set<Client> = new Set();

	private userDatas: Map<string, KGradeUserData> = new Map();
	private userDataListeners: Map<string, Set<Client>> = new Map();

	constructor(private data: VoteData) {
		super();

		this.moduleMap.set(EventType.CST_SONG_GRADE_get_summary, this.getSummary);
		this.moduleMap.set(EventType.CST_SONG_GRADE_edit, this.edit);
		this.moduleMap.set(EventType.CST_SONG_GRADE_get_user, this.getUser);
		this.moduleMap.set(EventType.CST_SONG_GRADE_get_all, this.getAll);
		this.moduleMap.set(EventType.CST_SONG_GRADE_unsubscribe, this.unsubscribe);

		firestore.doc(`${FS_CONSTITUTIONS_PATH}/${this.data.constitution.id}/votes/summary`).onSnapshot((document) => {
			if (!document.exists) return;
			this.summary = document.data() as KGradeSummary;
			this.summaryListeners.forEach((listener) => {
				listener.socket.send(createMessage<GradeResSummaryUpdate>(EventType.CST_SONG_GRADE_summary_update, { summary: this.summary }));
				telemetry.read();
			});
		});

		firestore.collection(`${FS_CONSTITUTIONS_PATH}/${this.data.constitution.id}/votes`)
			.where(firestoreTypes.FieldPath.documentId(), "!=", "summary")
			.onSnapshot((query) => {
				for (let change of query.docChanges()) {
					const changeData = change.doc.data() as KGradeUserData;
					const updateMessage = createMessage<GradeResUserDataUpdate>(EventType.CST_SONG_GRADE_userdata_update, { status: change.type, userData: changeData })
					switch (change.type) {
						case "added":
							this.userDatas.set(changeData.uid, changeData);
							this.userDataListeners.set(changeData.uid, new Set());
							telemetry.read(false);
							break;

						case "modified": {
							const oldData = this.userDatas.get(changeData.uid);
							if (isNil(oldData)) return;
							this.userDatas.set(changeData.uid, changeData);
							telemetry.read(false);
							break;
						}

						case "removed":
							this.userDatas.delete(changeData.uid);
							break;
					}

					const userListeners = this.userDataListeners.get(changeData.uid);
					if (!isNil(userListeners)) {
						userListeners.forEach((listener) => {
							listener.socket.send(updateMessage);
							telemetry.read();
						})
					}
				}
			});
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
		// TODO
		return;
	}

	public updateData(data: VoteData): void {
		this.data = data;
	}

	public deleteSong(songID: number): void {
		for (let [uid, votes] of this.userDatas) {
			if (!isNil(votes.values[toString(songID)])) {
				// Update global summary
				this.updateSummary(uid, songID, "remove");

				// Remove entry from user votemap
				firestore.doc(`${FS_CONSTITUTIONS_PATH}/${this.data.constitution.id}/votes/${uid}`)
					.update({ [`values.${songID}`]: firestoreTypes.FieldValue.delete() });
				telemetry.write(false);
			}
		}
		console.log("All done")
	}

	private async getSummary(_: Message<unknown>, client: Client): Promise<void> {
		this.summaryListeners.add(client);

		client.socket.send(createMessage<GradeResSummaryUpdate>(EventType.CST_SONG_GRADE_summary_update, { summary: this.summary }));
		telemetry.read();
	}

	private updateSummary(clientUID: string, songID: number, action: "add" | "remove") {
		// Add the user if he is not in the summary
		if (isNil(this.summary.userCount[clientUID])) {
			firestore.doc(`${FS_CONSTITUTIONS_PATH}/${this.data.constitution.id}/votes/summary`)
				.update({ [`userCount.${clientUID}`]: 1 });
			telemetry.write(false);
		}

		const existsInVotemap = !isNil(this.userDatas.get(clientUID)?.values[toString(songID)]);

		if (action === "add" && !existsInVotemap) {
			firestore.doc(`${FS_CONSTITUTIONS_PATH}/${this.data.constitution.id}/votes/summary`)
				.update({ voteCount: firestoreTypes.FieldValue.increment(1) });
			telemetry.write(false);

			const userCountValue = this.summary.userCount[clientUID];
			const newValue = userCountValue ? userCountValue + 1 : 1;
			firestore.doc(`${FS_CONSTITUTIONS_PATH}/${this.data.constitution.id}/votes/summary`)
				.update({ [`userCount.${clientUID}`]: newValue });
			telemetry.write(false);
		}

		if (action === "remove" && existsInVotemap) {
			firestore.doc(`${FS_CONSTITUTIONS_PATH}/${this.data.constitution.id}/votes/summary`)
				.update({ voteCount: firestoreTypes.FieldValue.increment(-1) }); // Why is there no "decrement" firestore, do you hate me that much ?
			telemetry.write(false);

			const userCountValue = this.summary.userCount[clientUID];
			const newValue = userCountValue ? userCountValue - 1 : 0;
			firestore.doc(`${FS_CONSTITUTIONS_PATH}/${this.data.constitution.id}/votes/summary`)
				.update({ [`userCount.${clientUID}`]: newValue });
			telemetry.write(false);
		}
	}

	private async edit(message: Message<unknown>, client: Client): Promise<void> {
		const vote = extractMessageData<GradeReqEdit>(message).voteData;

		const song = this.data.songs.get(vote.songId);
		if (isNil(song)) return;
		if (song.user === client.uid) return;		// An user can't vote for his own songs
		if (!inRange(vote.grade, 1, 11)) return;

		this.updateSummary(client.uid, song.id, "add");

		firestore.doc(`${FS_CONSTITUTIONS_PATH}/${this.data.constitution.id}/votes/${client.uid}`)
			.update({ [`values.${vote.songId}`]: vote.grade });
		telemetry.write(false);
	}

	private async getUser(_: Message<unknown>, client: Client): Promise<void> {
		this.userDataListeners.get(client.uid)?.add(client);
		const userData = this.userDatas.get(client.uid);
		if (isNil(userData)) return;
		client.socket.send(createMessage<GradeResUserDataUpdate>(EventType.CST_SONG_GRADE_userdata_update, { status: "added", userData: userData }));
	}

	private async getAll(_: Message<unknown>, client: Client): Promise<void> {
		if (canModifyVotes(this.data.constitution)) return;

		for (let [user, data] of this.userDatas) {
			this.userDataListeners.get(user)?.add(client);

			client.socket.send(createMessage<GradeResUserDataUpdate>(EventType.CST_SONG_GRADE_userdata_update, { status: "added", userData: data }));
		}
	}

	private async unsubscribe(_: Message<unknown>, client: Client): Promise<void> {
		this.userDataListeners.forEach((userDataListener) => {
			if (userDataListener.has(client)) userDataListener.delete(client);
		});

		this.summaryListeners.delete(client);
	}
}
