import { createMessage, EventType, GuessResUserDataUpdate, Message, KGuessUserData, extractMessageData, GuessReqEdit, canModifyVotes } from "chelys";
import { Client } from "../../Types/client";
import { SongData } from "../../Types/song-data";
import { FS_CONSTITUTIONS_PATH } from "../utility";
import { firestore, firestoreTypes } from "../firebase";
import { telemetry } from "./telemetry";
import { isNil, toString } from "lodash";
import { SubModule } from "../module";


export class GuessesModule extends SubModule<SongData> {
	prefix = "GUESS";

	private userDatas: Map<string, KGuessUserData> = new Map();
	private listeners: Map<string, Set<Client>> = new Map();

	constructor(private data: SongData) {
		super();

		this.moduleMap.set(EventType.CST_SONG_GUESS_edit, this.edit);
		this.moduleMap.set(EventType.CST_SONG_GUESS_get_all, this.getAll);
		this.moduleMap.set(EventType.CST_SONG_GUESS_get_user, this.getUser);
		this.moduleMap.set(EventType.CST_SONG_GUESS_unsubscribe, this.unsubscribe);

		firestore.collection(`${FS_CONSTITUTIONS_PATH}/${this.data.constitution.id}/guess`)
			.onSnapshot((query) => {
				for (const change of query.docChanges()) {
					const changeData = change.doc.data() as KGuessUserData;
					const updateMessage = createMessage<GuessResUserDataUpdate>(EventType.CST_SONG_GUESS_update, { status: change.type, userData: changeData });
					switch (change.type) {
						case "added":
							this.userDatas.set(changeData.uid, changeData);
							this.listeners.set(changeData.uid, new Set());
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

					const userListeners = this.listeners.get(changeData.uid);
					if (!isNil(userListeners)) {
						userListeners.forEach((listener) => {
							listener.socket.send(updateMessage);
							telemetry.read();
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


	public onClose(_: Client): void {
		// TODO
		return;
	}

	public updateData(data: SongData): void {
		this.data = data;
	}

	public deleteSong(songID: number): void {
		for (const [uid, guesses] of this.userDatas) {
			if (!isNil(guesses.values[toString(songID)])) {
				// Remove entry from user votemap
				firestore.doc(`${FS_CONSTITUTIONS_PATH}/${this.data.constitution.id}/guess/${uid}`)
					.update({ [`values.${songID}`]: firestoreTypes.FieldValue.delete() });
				telemetry.write(false);
			}
		}
	}

	private async edit(message: Message<unknown>, client: Client): Promise<void> {
		const guess = extractMessageData<GuessReqEdit>(message).guessData;

		const song = this.data.songs.get(guess.songId);
		if (isNil(song)) return;
		if (song.user === client.uid) return;		// An user can't guess for his own songs

		if (!this.data.constitution.users.includes(guess.guess)) return;

		firestore.doc(`${FS_CONSTITUTIONS_PATH}/${this.data.constitution.id}/guess/${client.uid}`)
			.update({ [`values.${guess.songId}`]: guess.guess });

		telemetry.write(false);
	}

	private async getUser(_: Message<unknown>, client: Client): Promise<void> {
		this.listeners.get(client.uid)?.add(client);
		const userData = this.userDatas.get(client.uid);
		if (isNil(userData)) return;
		client.socket.send(createMessage<GuessResUserDataUpdate>(EventType.CST_SONG_GRADE_userdata_update, { status: "added", userData: userData }));
	}

	private async getAll(_: Message<unknown>, client: Client): Promise<void> {
		if (canModifyVotes(this.data.constitution)) return;

		for (const [user, data] of this.userDatas) {
			this.listeners.get(user)?.add(client);

			client.socket.send(createMessage<GuessResUserDataUpdate>(EventType.CST_SONG_GRADE_userdata_update, { status: "added", userData: data }));
		}
	}

	private async unsubscribe(_: Message<unknown>, client: Client): Promise<void> {
		this.listeners.forEach((userDataListener) => {
			if (userDataListener.has(client)) userDataListener.delete(client);
		});
	}
}