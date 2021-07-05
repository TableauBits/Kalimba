export function createMessage<T>(event: string, data: T): string {
	return JSON.stringify({ event: event, data: data });
}
