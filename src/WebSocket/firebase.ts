import * as admin from "firebase-admin";
import { ENCRYPTED_ADMIN_SAK } from "../constants";

const adminSAK = JSON.parse(Buffer.from(ENCRYPTED_ADMIN_SAK, "base64").toString());

admin.initializeApp({
	credential: admin.credential.cert(adminSAK),
	databaseURL: "https://matbactivity.firebaseio.com"
});

export const auth = admin.auth();
export const firestore = admin.firestore();

export const authTypes = admin.auth;
export const firestoreTypes = admin.firestore;

export function createID(): string {
	return firestore.collection("persona5").doc().id;
}
