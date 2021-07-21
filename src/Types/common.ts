export interface Message<T> {
	event: string;
	data: T;
}

export interface ResponseStatus {
	success: boolean;
	status: string;
}

export interface User {
	uid: string;
	email: string;
	displayName: string;
	photoURL: string;
	roles: string[];
	description: string;
}

export enum EventTypes {
	// From client
	CLIENT_authenticate = "CLIENT-authenticate",
	CLIENT_ping = "CLIENT-ping",

	USER_get = "USER-get",
	USER_get_all = "USER-get-all",
	USER_edit = "USER-edit",
	USER_create = "USER-create",
	USER_unsubscribe = "USER-unsubscribe",

	// From server
	USER_update = "USER-update",
}
