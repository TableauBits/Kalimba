import { firestore } from "../../firebase";
import { SubModule } from "../../module";
import { Constitution, createMessage, CstGradeReqEdit, CstGradeReqGetSummary, CstGradeResSummaryUpdate, CstGradeResUserDataUpdate, EventType, extractMessageData, GradeSummary, GradeUserData, Message } from "chelys";
import { FS_CONSTITUTIONS_PATH } from "../../utility";
import { Client } from "../../../Types/client";
import { telemetry } from "../telemetry";

export class GradeVoteModule extends SubModule<Constitution> {
	public prefix = "GRADE";

	private path: string;
	private votes: Map<string, GradeUserData> = new Map();
	private allVotesListener: Set<Client> = new Set();

	private summary: GradeSummary;
	private summaryListeners: Set<Client> = new Set();

	constructor(private constitution: Constitution) {
		super();
		this.moduleMap.set(EventType.CST_GRADE_edit, this.edit);
		this.moduleMap.set(EventType.CST_GRADE_get_all, this.getAll);
		this.moduleMap.set(EventType.CST_GRADE_get_user, this.getUser);
		this.moduleMap.set(EventType.CST_GRADE_get_summary, this.getSummary);
		this.moduleMap.set(EventType.CST_GRADE_unsubscribe, this.unsubscribe);

		this.path = `${FS_CONSTITUTIONS_PATH}/${constitution.id}/votes`;

		this.summary = { voteCount: 0 };

		firestore.collection(this.path).onSnapshot((collection) => {
			for (const change of collection.docChanges()) {
				if (change.doc.id === "summary") {
					switch (change.type) {
						case "added": {
							const newSummary = change.doc.data() as GradeSummary;
							this.summary = newSummary;
						} break;

						case "modified": {
							telemetry.read(false);
							const newSummary = change.doc.data() as GradeSummary;
							this.summary = newSummary;
							const updateMessage = createMessage<CstGradeResSummaryUpdate>(
								EventType.CST_GRADE_summary_update,
								{ summary: newSummary }
							);
							this.summaryListeners.forEach((listener) => {
								listener.socket.send(updateMessage);
								telemetry.read();
							});
						} break;

						default:
							// SHOULD NOT HAPPEN
							break;
					}
				} else {
					// user data updated
					const newUserData = change.doc.data() as GradeUserData;
					const updateMessage = createMessage<CstGradeResUserDataUpdate>(
						EventType.CST_GRADE_userdata_update,
						{ status: change.type, userData: newUserData }
					);
					switch (change.type) {
						case "added":
							this.votes.set(newUserData.uid, newUserData);
							telemetry.read(false);
							break;

						case "modified": {
							this.votes.set(newUserData.uid, newUserData);
							const localVoteInfo = this.votes.get(newUserData.uid);
							telemetry.read(false);
						} break;

						case "removed":
							this.votes.delete(newUserData.uid);
							break;
					}

					this.allVotesListener.forEach((listener) => {
						listener.socket.send(updateMessage);
					});
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

	public onClose(_: Client): void { return; }

	public updateData(constitution: Constitution): void { this.constitution = constitution; }

	private async edit(_: Message<unknown>, _1: Client): Promise<void> {
		// const vote = extractMessageData<CstGradeReqEdit>(message).voteData;
	}

	private async getAll(_: Message<unknown>, _1: Client): Promise<void> {
		return;
	}

	private async getUser(_: Message<unknown>, _1: Client): Promise<void> {
		return;
	}

	private async getSummary(_: Message<unknown>, client: Client): Promise<void> {
		this.summaryListeners.add(client);
		client.socket.send(createMessage<CstGradeResSummaryUpdate>(EventType.CST_GRADE_summary_update, { summary: this.summary }));
	}

	private async unsubscribe(_: Message<unknown>, _1: Client): Promise<void> {
		return;
	}
}
