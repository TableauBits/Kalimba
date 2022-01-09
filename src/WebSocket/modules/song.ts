import { canModifySongs, Constitution, createMessage, CstSongReqAdd, CstSongReqRemove, CstSongResUpdate, CstSongReqUnsubscribe, EventType, extractMessageData, Message, Song, SongPlatform, ConstitutionType } from "chelys";
import { firestore } from "../firebase";
import { isNil, max } from "lodash";
import { Client } from "../../Types/client";
import { SubModule } from "../module";
import { telemetry } from "./telemetry";
import { cleanupString, FS_CONSTITUTIONS_PATH } from "../utility";
import { VoteData } from "../../Types/vote-data";
import { GradeVoteModule } from "./vote-modules/grade";

const SONG_NAME_LENGTH = 30;	// TODO
const SONG_AUTHOR_LENGTH = 30;

export class SongModule extends SubModule<Constitution> {
	public prefix = "SONG";

	private path = "";
	private songs: Map<number, Song> = new Map();

	private listeners: Set<Client> = new Set();

	private voteSubmodule: SubModule<VoteData>;

	constructor(private constitution: Constitution) {
		super();
		this.moduleMap.set(EventType.CST_SONG_add, this.add);
		this.moduleMap.set(EventType.CST_SONG_remove, this.remove);
		this.moduleMap.set(EventType.CST_SONG_get_all, this.getAll);
		this.moduleMap.set(EventType.CST_SONG_unsubscribe, this.unsubscribe);

		this.path = `${FS_CONSTITUTIONS_PATH}/${constitution.id}/songs`;

		switch (constitution.type) {
			case ConstitutionType.GRADE:
			default: {
				this.voteSubmodule = new GradeVoteModule({ constitution: this.constitution, songs: this.songs });
			} break;
		}

		firestore.collection(this.path).onSnapshot((collection) => {
			for (const change of collection.docChanges()) {
				const newSongData = change.doc.data() as Song;
				const updateMessage = createMessage<CstSongResUpdate>(EventType.CST_SONG_update, { status: change.type, songInfo: newSongData });
				switch (change.type) {
					case "added":
						this.songs.set(newSongData.id, newSongData);
						telemetry.read(false);
						break;

					case "modified": {
						const songData = this.songs.get(newSongData.id);
						if (isNil(songData)) return;
						this.songs.set(newSongData.id, newSongData);
						telemetry.read(false);
					} break;

					case "removed":
						this.songs.delete(newSongData.id);
						break;
				}
				this.listeners.forEach((listener) => {
					listener.socket.send(updateMessage);
					telemetry.read();
				});
			}
		});
	}

	public async handleEvent(message: Message<unknown>, client: Client): Promise<boolean> {
		if (message.event.startsWith(`CST-${this.prefix}-${this.voteSubmodule.prefix}`)) {
			return this.voteSubmodule.handleEvent(message, client);
		}

		const eventCallback = this.moduleMap.get(message.event);
		if (eventCallback === undefined) {
			return false;
		}

		eventCallback.apply(this, [message, client]);
		return true;
	}

	public onClose(client: Client): void {
		this.listeners.delete(client);
		this.voteSubmodule.onClose(client);
	}

	public updateData(constitution: Constitution): void {
		this.constitution = constitution;
		this.voteSubmodule.updateData({ constitution: constitution, songs: this.songs });
	}

	private nextSongId(): number {
		const songs = Array.from(this.songs.values());
		const maxId = max(songs.map(song => song.id));
		if (isNil(maxId)) return 0;
		return maxId + 1;
	}

	private async add(message: Message<unknown>, client: Client): Promise<void> {
		const requestData = extractMessageData<CstSongReqAdd>(message);

		if (isNil(requestData)) return;
		if (requestData.cstId !== this.constitution.id) return;
		if (!canModifySongs(this.constitution)) return;
		if (!this.constitution.users.includes(client.uid)) return;

		const length = Array.from(this.songs.values()).filter((song) => { return song.user === client.uid; }).length;
		if (length === this.constitution.numberOfSongsPerUser) return;

		const songData = requestData.songData;

		const song: Song = {
			id: this.nextSongId(),
			author: cleanupString(songData.author, SONG_AUTHOR_LENGTH),
			platform: songData.platform ?? SongPlatform.YOUTUBE,
			title: cleanupString(songData.title, SONG_NAME_LENGTH),
			url: songData.url,
			user: client.uid
		};

		firestore.collection(this.path).doc(song.id.toString()).create(song);
		telemetry.write(false);
	}

	private async remove(message: Message<unknown>, client: Client): Promise<void> {
		const requestData = extractMessageData<CstSongReqRemove>(message);

		if (isNil(requestData)) return;
		if (requestData.cstId !== this.constitution.id) return;
		if (!canModifySongs(this.constitution)) return;
		if (!this.constitution.users.includes(client.uid)) return;

		const song = this.songs.get(requestData.songId);
		if (isNil(song)) return;
		if (song.user !== client.uid) return;

		firestore.collection(this.path).doc(song.id.toString()).delete();
	}

	private async getAll(_: Message<unknown>, client: Client): Promise<void> {
		this.listeners.add(client);
		this.songs.forEach((song) => {
			client.socket.send(createMessage<CstSongResUpdate>(EventType.CST_SONG_update, { status: "added", songInfo: song }));
			telemetry.read();
		});
	}

	private async unsubscribe(message: Message<unknown>, client: Client): Promise<void> {
		const requestData = extractMessageData<CstSongReqUnsubscribe>(message);
		if (isNil(requestData)) return;
		if (requestData.cstId !== this.constitution.id) return;

		this.listeners.delete(client);
	}
}
