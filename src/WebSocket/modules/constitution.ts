import { Constitution, ConstitutionType, Message } from "chelys";
import { SubModule } from "../module";
import { Client } from "../../Types/client";
import { SongModule } from "./song";
import { GradeVoteModule } from "./vote-modules/grade";

export class ConstitutionModule {
	private submodules: SubModule<Constitution>[] = [];
	constructor(public data: Constitution) {
		this.submodules.push(new SongModule(data));
		switch (data.type) {
			case ConstitutionType.GRADE:
				this.submodules.push(new GradeVoteModule(data));
		}
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
