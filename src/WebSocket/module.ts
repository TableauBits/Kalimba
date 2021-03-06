import { Message } from "chelys";
import { Client } from "../Types/client";

export type moduleFunction = {
	(message: Message<unknown>, client: Client): Promise<void>
}

export abstract class Module {
	public abstract prefix: string;
	protected moduleMap: Map<string, moduleFunction> = new Map();
	public abstract handleEvent(message: Message<unknown>, client: Client): Promise<boolean>;
	public abstract onClose(client: Client): void;
}

export abstract class SubModule<T> extends Module {
	public abstract updateData(data: T): void;
}
