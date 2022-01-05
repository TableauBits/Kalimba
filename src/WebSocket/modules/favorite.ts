import { Constitution, createMessage, CstFavResUpdate, EventType, Message, UserFavorites } from "chelys";
import { firestore } from "../firebase";
import { Client } from "../../Types/client";
import { SubModule } from "../module";
import { FS_CONSTITUTIONS_PATH } from "../utility";

export class FavoriteModule extends SubModule<Constitution> {
	public prefix = "FAV";

	private path = "";
	private favorites: Map<string, UserFavorites> = new Map();
	
	constructor(private constitution: Constitution) {
		super();
		this.constitution = constitution;
		
		this.moduleMap.set(EventType.CST_FAV_add, this.add);
		this.moduleMap.set(EventType.CST_FAV_remove, this.remove);
		this.moduleMap.set(EventType.CST_FAV_get, this.get);
		this.moduleMap.set(EventType.CST_FAV_unsubscribe, this.unsubscribe);

		this.path = `${FS_CONSTITUTIONS_PATH}/${constitution.id}/favs`;

		firestore.collection(this.path).onSnapshot((collection) => {
			for (const change of collection.docChanges()) {
				const newFavData = change.doc.data() as UserFavorites;
				const updateMessage = createMessage<CstFavResUpdate>(EventType., { status: change.type, songInfo: newSongData });
				switch (change.type) {
					case "added":
						this.favorites.set(newFavData.id, newSongData);
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

	public updateData(data: Constitution): void {
		this.constitution = data;
	}

	private async add(message: Message<unknown>, client: Client): Promise<void> {
		// TODO
		return;
	}

	private async remove(message: Message<unknown>, client: Client): Promise<void> {
		// TODO
		return;
	}

	private async get(message: Message<unknown>, client: Client): Promise<void> {
		// TODO
		return;
	}

	private async unsubscribe(message: Message<unknown>, client: Client): Promise<void> {
		// TODO
		return;
	}
}
