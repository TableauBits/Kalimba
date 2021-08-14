import * as dotenv from "dotenv";
import * as admin from "firebase-admin";

dotenv.config();
const encryptedAdminSAK = process.env["MATBAY_SERVICE_ACCOUNT_KEY"];

if (encryptedAdminSAK == undefined) {
	console.log("Unable to start server: firebase admin service acount key not found in ENV: MATBAY_SERVICE_ACCOUNT_KEY");
	process.exit(-1);
}

const adminSAK = JSON.parse(Buffer.from(encryptedAdminSAK, "base64").toString());

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
