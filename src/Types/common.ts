export interface Message<T> {
	event: string;
	data: T;
}

export interface ResponseStatus {
	success: boolean;
	status: string;
}

export enum Roles {
	ADMIN = "admin",
	DEV = "dev",
	MEMBER = "member",
	TEST = "test",
}

export interface User {
	uid: string;
	email: string;
	displayName: string;
	photoURL: string;
	roles: Roles[];
	description: string;
}

export enum ConstitutionType {
	GRADE,
	LENGTH,
}

// TODO : Better names ?
export enum AnonymousLevel {
	PUBLIC,
	NO_USERNAME,
	SOUND_ONLY
}

export interface Constitution {
	id: string;
	season: number;
	part: number;
	name: string;
	isPublic: boolean;
	anonymousLevel: AnonymousLevel;
	type: ConstitutionType;
	state: number;

	users: string[]; // user[0] est le président
	numberOfSongsPerUser: number;
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

	CST_get = "CST-get",
	CST_get_from_user = "CST-get-from-user",
	CST_create = "CST-create",
	CST_join = "CST-join",
	CST_unsubscribe = "CST-unsubscribe",

	// From server
	USER_update = "USER-update",
	CST_update = "CST-update",
}
