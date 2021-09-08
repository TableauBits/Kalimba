import { EventType, Message /*, CstSongResUpdate, createMessage */ } from "@tableaubits/hang";
import { Client } from "../../Types/client";
import { Module } from "../module";

export class SongModule extends Module {
		public prefix = "SONG";

		constructor( ) { 
			super();
			this.moduleMap.set(EventType.CST_SONG_add, this.add);
			this.moduleMap.set(EventType.CST_SONG_remove, this.remove);
			this.moduleMap.set(EventType.CST_SONG_get_all, this.getAll);
		}

		public async handleEvent(message: Message<unknown>, client: Client): Promise<boolean> { 
			const eventCallback = this.moduleMap.get(message.event);
			if (eventCallback === undefined) {
				return false;
			}

			eventCallback.apply(this, [message, client]);
			return true;
		}

		public onClose(): void { 
			return; 
		}

		private async add(_: Message<unknown>, client: Client): Promise<void> {
			client.socket.send("wesh");
		}

		private async remove(_1: Message<unknown>, _2: Client): Promise<void> {
			return;
		}

		private async getAll(_1: Message<unknown>, _2: Client): Promise<void> {
			return;
		}
}