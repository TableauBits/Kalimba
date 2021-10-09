import { createMessage, EventType, extractMessageData, GradeReqEdit, GradeResSummaryUpdate, GradeSummary, GradeVote, Message } from "chelys";
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

	constructor(private data: VoteData) {
		super();

		this.moduleMap.set(EventType.CST_SONG_GRADE_get_summary, this.getSummary);
		this.moduleMap.set(EventType.CST_SONG_GRADE_edit, this.edit);

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

	private async getSummary(_: Message<unknown>, client: Client): Promise<void> {
		this.summaryListeners.add(client);

		client.socket.send(createMessage<GradeResSummaryUpdate>(EventType.CST_SONG_GRADE_summary_update, { summary: this.summary }));
		telemetry.read();
	}

	private async edit(message: Message<unknown>, client: Client): Promise<void> {
		const vote = extractMessageData<GradeReqEdit>(message).voteData;

		firestore.doc(`${FS_CONSTITUTIONS_PATH}/${this.data.constitution.id}/votes/${client.uid}`).update({ [`values.${vote.songId}`]: vote.grade });
		telemetry.write(false);
	}
}
