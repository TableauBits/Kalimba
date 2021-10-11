import { canModifyVotes, createMessage, EventType, extractMessageData, GradeReqEdit, GradeResSummaryUpdate, GradeResUserDataUpdate, GradeSummary, GradeUserData, Message } from "chelys";
import { inRange, isNil } from "lodash";
import { Client } from "../../../Types/client";
import { VoteData } from "../../../Types/vote-data";
import { firestore } from "../../firebase";
import { SubModule } from "../../module";
import { FS_CONSTITUTIONS_PATH } from "../../utility";
import { telemetry } from "../telemetry";

export class GradeVoteModule extends SubModule<VoteData> {
	prefix = "GRADE";

	private summary: GradeSummary = { voteCount: 0 };
	private summaryListeners: Set<Client> = new Set();

	private userDatas: Map<string, GradeUserData> = new Map();
	private userDataListeners: Map<string, Set<Client>> = new Map();

	constructor(private data: VoteData) {
		super();

		this.moduleMap.set(EventType.CST_SONG_GRADE_get_summary, this.getSummary);
		this.moduleMap.set(EventType.CST_SONG_GRADE_edit, this.edit);
		this.moduleMap.set(EventType.CST_SONG_GRADE_get_user, this.getUser);
		this.moduleMap.set(EventType.CST_SONG_GRADE_get_all, this.getAll);

		firestore.doc(`${FS_CONSTITUTIONS_PATH}/${this.data.constitution.id}/votes/summary`).onSnapshot((document) => {
			if (!document.exists) return;
			this.summary = document.data() as GradeSummary;
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

	private fetchUserData(uid: string): void {
		firestore.doc(`${FS_CONSTITUTIONS_PATH}/${this.data.constitution.id}/votes/${uid}`).onSnapshot((document) => {
			const newUserData = document.data() as GradeUserData;
			this.userDatas.set(uid, newUserData);
			const listeners = this.userDataListeners.get(uid);
			if (!isNil(listeners)) {
				listeners.forEach((listener) => {
					listener.socket.send(createMessage<GradeResUserDataUpdate>(EventType.CST_SONG_GRADE_userdata_update, { status: "modified", userData: newUserData }));
				});
				telemetry.read();
			}
			telemetry.read(false);
		});
	}

	private async getSummary(_: Message<unknown>, client: Client): Promise<void> {
		this.summaryListeners.add(client);

		client.socket.send(createMessage<GradeResSummaryUpdate>(EventType.CST_SONG_GRADE_summary_update, { summary: this.summary }));
		telemetry.read();
	}

	private async edit(message: Message<unknown>, client: Client): Promise<void> {
		const vote = extractMessageData<GradeReqEdit>(message).voteData;

		const song = this.data.songs.get(vote.songId);
		if (isNil(song)) return;
		if (song.user !== client.uid) return;
		if (!inRange(vote.grade, 1, 10)) return;

		firestore.doc(`${FS_CONSTITUTIONS_PATH}/${this.data.constitution.id}/votes/${client.uid}`).update({ [`values.${vote.songId}`]: vote.grade });
		telemetry.write(false);
	}

	private async getUser(_: Message<unknown>, client: Client): Promise<void> {
		if (!this.userDatas.has(client.uid)) {
			this.fetchUserData(client.uid);
			this.userDataListeners.get(client.uid)?.add(client);
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
}
