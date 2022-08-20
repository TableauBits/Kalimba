import { areResultsPublic, canModifyVotes, Constitution, createMessage, CstFavReqAdd, CstFavResUpdate, EventType, extractMessageData, FAVORITES_MAX_LENGTH, Message, UserFavorites } from "chelys";
import { firestore, firestoreTypes } from "../firebase";
import { Client } from "../../Types/client";
import { SubModule } from "../module";
import { FS_CONSTITUTIONS_PATH } from "../utility";
import { telemetry } from "./telemetry";
import { isNil } from "lodash";

export class FavoriteModule extends SubModule<Constitution> {
	public prefix = "FAV";

	private path = "";
	private favorites: Map<string, UserFavorites> = new Map();

	private listeners: Set<Client> = new Set();

	constructor(private constitution: Constitution) {
		super();

		this.moduleMap.set(EventType.CST_FAV_add, this.add);
		this.moduleMap.set(EventType.CST_FAV_remove, this.remove);
		this.moduleMap.set(EventType.CST_FAV_get, this.get);
		this.moduleMap.set(EventType.CST_FAV_unsubscribe, this.unsubscribe);

		this.path = `${FS_CONSTITUTIONS_PATH}/${constitution.id}/favs`;

		firestore.collection(this.path).onSnapshot((collection) => {
			for (const change of collection.docChanges()) {
				const newFavData = change.doc.data() as UserFavorites;
				const updateMessage = createMessage<CstFavResUpdate>(EventType.CST_FAV_update, { userFavorites: newFavData });
				switch (change.type) {
					case "added":
						this.favorites.set(newFavData.uid, newFavData);
						telemetry.read(false);
						break;

					case "modified": {
						const favData = this.favorites.get(newFavData.uid);
						if (isNil(favData)) return;
						this.favorites.set(newFavData.uid, newFavData);
						telemetry.read(false);
					} break;

					case "removed":
						this.favorites.delete(newFavData.uid);
						break;
				}
				this.listeners.forEach((listener) => {
					if (areResultsPublic(this.constitution) || listener.uid === newFavData.uid) {
						listener.socket.send(updateMessage);
						telemetry.read();
					}
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

	public onClose(client: Client): void {
		this.listeners.delete(client);
	}

	public updateData(data: Constitution): void {
		if (this.constitution.state !== data.state) {
			this.favorites.forEach((favorite) => {
				const updateMessage = createMessage<CstFavResUpdate>(EventType.CST_FAV_update, { userFavorites: favorite });
				this.listeners.forEach((listener) => {
					if (areResultsPublic(this.constitution) || listener.uid !== favorite.uid) {
						listener.socket.send(updateMessage);
						telemetry.read();
					}
				});
			});
		}
		this.constitution = data;
	}

	private async add(message: Message<unknown>, client: Client): Promise<void> {
		if (!canModifyVotes(this.constitution)) return;
		const favorites = this.favorites.get(client.uid);
		if (isNil(favorites)) return;
		if (favorites.favs.length >= FAVORITES_MAX_LENGTH) return;

		const newFav = extractMessageData<CstFavReqAdd>(message);
		firestore.collection(this.path).doc(client.uid).update({ favs: firestoreTypes.FieldValue.arrayUnion(newFav.songId) });
	}

	private async remove(message: Message<unknown>, client: Client): Promise<void> {
		const favToRemove = extractMessageData<CstFavReqAdd>(message);
		firestore.collection(this.path).doc(client.uid).update({ favs: firestoreTypes.FieldValue.arrayRemove(favToRemove.songId) });
	}

	private async get(_: Message<unknown>, client: Client): Promise<void> {
		this.listeners.add(client);

		this.favorites.forEach((favorite) => {
			const updateMessage = createMessage<CstFavResUpdate>(EventType.CST_FAV_update, { userFavorites: favorite });
			if (areResultsPublic(this.constitution) || client.uid === favorite.uid) {
				client.socket.send(updateMessage);
				telemetry.read();
			}
		});
	}

	private async unsubscribe(_: Message<unknown>, client: Client): Promise<void> {
		this.listeners.delete(client);
	}
}
