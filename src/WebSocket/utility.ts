import { Message } from "../Types/common";

export function createMessage<T>(event: string, data: T): string {
	return JSON.stringify({ event: event, data: data });
}

export function extractMessageData<T>(message: Message<unknown>): T {
	return message.data as T;
}

export function removeFromArray<T>(element: T, array: T[]): void {
	const index = array.findIndex((e) => e === element);
	if (index > 0) array.splice(index, 1);
}
