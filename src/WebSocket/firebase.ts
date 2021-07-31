import * as dotenv from "dotenv";
import * as admin from "firebase-admin";

dotenv.config();
let encryptedAdminSAK = process.env["MATBAY_SERVICE_ACCOUNT_KEY"];

if (encryptedAdminSAK == undefined) {
	console.log("Unable to start server: firebase admin service acount key not found in ENV: MATBAY_SERVICE_ACCOUNT_KEY");
	encryptedAdminSAK = "";
	stop();
}

const adminSAK = JSON.parse(Buffer.from(encryptedAdminSAK, "base64").toString());

admin.initializeApp({
	credential: admin.credential.cert(adminSAK),
	databaseURL: "https://matbactivity.firebaseio.com"
});

export const auth = admin.auth();
export const firestore = admin.firestore();

export function createID(): string {
	return firestore.collection("persona5").doc().id;
}
