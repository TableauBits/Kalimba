import { Client } from "../Types/client";
import { Message } from "../Types/common";

export type moduleFunction = {
	(message: Message<unknown>, client: Client): Promise<string>
}

export abstract class Module {
	public abstract handleEvent(message: Message<unknown>, client: Client): Promise<boolean>;
	public abstract prefix: string;
	protected moduleMap: Map<string, moduleFunction> = new Map();
}
