import { Constitution, Message } from "@tableaubits/hang";
import { SubModule } from "../module";
import { Client } from "../../Types/client";
import { SongModule } from "./song";

export class ConstitutionModule {
	private submodules: SubModule<Constitution>[] = [];
	
	constructor(public data: Constitution) {
		this.submodules.push(new SongModule(data));
	}

	public updateData(data: Constitution): void {
		this.data = data;
		this.submodules.forEach((submodule) => {
			submodule.updateData(data);
		});
	}

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
