import { Constitution, Message } from "@tableaubits/hang";
import { Module } from "../module";
import { Client } from "../../Types/client";
import { SongModule } from "./song";

export class ConstitutionModule {
	private submodules: Module[] = [new SongModule()];
	
	constructor(public data: Constitution) {}

	public async handleEvent(message: Message<unknown>, client: Client): Promise<boolean> {
		for (const submodule of this.submodules) {
			if (message.event.startsWith(`CST-${submodule.prefix}`)) {
				const handled = await submodule.handleEvent(message, client);
				return handled;
			}
		}

		return false;
	}
}
