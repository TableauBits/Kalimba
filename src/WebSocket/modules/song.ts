import { canModifySongs, Constitution, createMessage, CstSongReqAdd, CstSongReqRemove, CstSongResUpdate, CstSongReqUnsubscribe, EventType, extractMessageData, Message, Song, SongPlatform} from "@tableaubits/hang";
import { firestore } from "../firebase";
import { isNil, max } from "lodash";
import { Client } from "../../Types/client";
import { SubModule } from "../module";
import { telemetry } from "./telemetry";

export class SongModule extends SubModule<Constitution> {
	public prefix = "SONG";

	private path = "";
	private songs: Map<number, Song> = new Map();

	private listeners: Set<Client> = new Set();

	constructor(private constitution: Constitution) { 
		super();
		this.moduleMap.set(EventType.CST_SONG_add, this.add);
		this.moduleMap.set(EventType.CST_SONG_remove, this.remove);
		this.moduleMap.set(EventType.CST_SONG_get_all, this.getAll);
		this.moduleMap.set(EventType.CST_SONG_unsubscribe, this.unsubscribe);

		this.path = `matday/${constitution.id}/songs`;

		firestore.collection(this.path).onSnapshot((collection) => {
			for (const change of collection.docChanges()) {
				const newSongData = change.doc.data() as Song;
				const updateMessage = createMessage<CstSongResUpdate>(EventType.CST_SONG_update, {status: change.type, songInfo: newSongData});
				switch (change.type) {
					case "added":
						this.songs.set(newSongData.id, newSongData);
						telemetry.read(false);
						break;

					case "modified": {
						telemetry.read(false);
						const songData = this.songs.get(newSongData.id);
						if (isNil(songData)) return;
					} break;

					case "removed":
						this.songs.delete(newSongData.id);
						break;
				}
				this.listeners.forEach((listener) => {
					listener.socket.send(updateMessage);
				});
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

	public updateData(constitution: Constitution): void {
		this.constitution = constitution;
	}

	public onClose(client: Client): void {
		this.listeners.delete(client);
		return; 
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

		const songData = requestData.songData;
		
		const song: Song = {
			id: this.nextSongId(),
			author: songData.author,
			platform: songData.platform ?? SongPlatform.YOUTUBE,
			title: songData.title,
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
			client.socket.send(createMessage<CstSongResUpdate>(EventType.CST_SONG_update, {status: "added", songInfo: song}));
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