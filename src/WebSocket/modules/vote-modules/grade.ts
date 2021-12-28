import { canModifyVotes, createMessage, EventType, extractMessageData, GradeReqEdit, GradeReqUnsubscribe, GradeResSummaryUpdate, Message, KGradeSummary, KGradeUserData, GradeResUserDataUpdate, Song } from "chelys";
import { inRange, isNil, toString } from "lodash";
import { Client } from "../../../Types/client";
import { VoteData } from "../../../Types/vote-data";
import { firestore } from "../../firebase";
import { SubModule } from "../../module";
import { FS_CONSTITUTIONS_PATH } from "../../utility";
import { telemetry } from "../telemetry";

export class GradeVoteModule extends SubModule<VoteData> {
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

	private async getSummary(_: Message<unknown>, client: Client): Promise<void> {
		this.summaryListeners.add(client);

		client.socket.send(createMessage<GradeResSummaryUpdate>(EventType.CST_SONG_GRADE_summary_update, { summary: this.summary }));
		telemetry.read();
	}

	private updateSummary(client: Client, song: Song) {
		// Add the user if he is not in the summary
		if (isNil(this.summary.userCount[client.uid])) {
			firestore.doc(`${FS_CONSTITUTIONS_PATH}/${this.data.constitution.id}/votes/summary`).update({ [`userCount.${client.uid}`]: 1 });
		}

		// If create a new vote, update the summary value
		if (isNil(this.userDatas.get(client.uid)?.values[toString(song.id)])) {
			firestore.doc(`${FS_CONSTITUTIONS_PATH}/${this.data.constitution.id}/votes/summary`).update({voteCount: this.summary.voteCount+1});
			
			const userCountValue = this.summary.userCount[client.uid];
			const newValue = userCountValue ? userCountValue + 1 : 1 ;
			firestore.doc(`${FS_CONSTITUTIONS_PATH}/${this.data.constitution.id}/votes/summary`).update({ [`userCount.${client.uid}`]: newValue});
		}

	}

	private async edit(message: Message<unknown>, client: Client): Promise<void> {
		const vote = extractMessageData<GradeReqEdit>(message).voteData;

		const song = this.data.songs.get(vote.songId);
		if (isNil(song)) return;
		if (song.user === client.uid) return;		// An user can't vote for his own songs
		if (!inRange(vote.grade, 1, 11)) return;

		this.updateSummary(client, song);

		firestore.doc(`${FS_CONSTITUTIONS_PATH}/${this.data.constitution.id}/votes/${client.uid}`).update({ [`values.${vote.songId}`]: vote.grade });
		telemetry.write(false);
	}

	private fetchUserData(uid: string): void {
		firestore.doc(`${FS_CONSTITUTIONS_PATH}/${this.data.constitution.id}/votes/${uid}`).onSnapshot((document) => {
			const docData = document.data() as KGradeUserData;
			this.userDatas.set(uid, docData);
			const listeners = this.userDataListeners.get(uid);
			if (!isNil(listeners)) {
				listeners.forEach((listener) => {
					listener.socket.send(createMessage<GradeResUserDataUpdate>(EventType.CST_SONG_GRADE_userdata_update, { status: "modified", userData: docData }));
				});
				telemetry.read();
			}
			telemetry.read(false);
		});
	}

	private async getUser(_: Message<unknown>, client: Client): Promise<void> {
		if (!this.userDatas.has(client.uid)) {
			this.userDataListeners.set(client.uid, new Set<Client>());
			this.userDataListeners.get(client.uid)?.add(client);
			this.fetchUserData(client.uid);
		} else {
			this.userDataListeners.get(client.uid)?.add(client);
			const userData = this.userDatas.get(client.uid);
			if (isNil(userData)) return;
			client.socket.send(createMessage<GradeResUserDataUpdate>(EventType.CST_SONG_GRADE_userdata_update, { status: "added", userData: userData })); 
		}
	}

	private async getAll(_: Message<unknown>, client: Client): Promise<void> {
		if (canModifyVotes(this.data.constitution)) return;

		for (const user in this.data.constitution.users) {
			if (!this.userDatas.has(user)) {
				this.fetchUserData(user);
				this.userDataListeners.get(user)?.add(client);
			}
		}
	}

	private async unsubscribe(message: Message<unknown>, client: Client): Promise<void> {
		const requestData = extractMessageData<GradeReqUnsubscribe>(message);
		if (isNil(requestData)) return;
		if (requestData.cstId !== this.data.constitution.id) return;

		this.userDataListeners.forEach((userDataListener) => {
			if (userDataListener.has(client)) userDataListener.delete(client);
		});

		this.summaryListeners.delete(client);
	}
}
