import { createMessage, EventType, GradeResSummaryUpdate, GradeSummary, Message } from "chelys";
import { Client } from "../../../Types/client";
import { VoteData } from "../../../Types/vote-data";
import { firestore } from "../../firebase";
import { SubModule } from "../../module";
import { FS_CONSTITUTIONS_PATH } from "../../utility";

export class GradeVoteModule extends SubModule<VoteData> {
	prefix = "GRADE";

	private summary: GradeSummary = { voteCount: 0 };
	private summaryListeners: Set<Client> = new Set();

	constructor(private data: VoteData) {
		super();

		this.moduleMap.set(EventType.CST_SONG_GRADE_get_summary, this.getSummary);

		firestore.doc(`${FS_CONSTITUTIONS_PATH}/${this.data.constitution.id}/votes/summary`).onSnapshot((document) => {
			if (!document.exists) return;
			this.summary = document.data() as GradeSummary;
			this.summaryListeners.forEach((listener) => {
				listener.socket.send(createMessage<GradeResSummaryUpdate>(EventType.CST_SONG_GRADE_summary_update, { summary: this.summary }));
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
	}
}
