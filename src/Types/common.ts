export interface Message<T> {
	event: string;
	data: T;
}

export interface ResponseStatus {
	success: boolean;
	status: string;
}

export enum EventTypes {
	CLIENT_authenticate = "CLIENT-authenticate",
	USER_get_one = "USER-get-one",
	USER_get_many = "USER-get-many",
	USER_get_all = "USER-get-all",
	USER_edit = "USER-edit",
}