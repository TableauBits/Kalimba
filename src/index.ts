import * as dotenv from "dotenv";
import express from "express";
import * as admin from "firebase-admin";
import cors from "cors";
import { Server } from "ws";

dotenv.config();

const port = process.env.PORT || 3000;
let encryptedAdminSAK = process.env.MATBAY_SERVICE_ACCOUNT_KEY;

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

const server = express()
	.use(cors())
	.get("/auth/:id", (req, res) => {

		res.send("lol sa merch");
	})
	.listen(port, () => console.log(`server listening on ${port}`));

const wsServer = new Server({ server });
wsServer.on("connection", (ws) => {
	console.log("client connected");
	ws.on("close", () => console.log("client disconnected"));
	ws.onmessage = (message) => {
		admin
			.auth()
			.verifyIdToken(message.data.toString())
			.then(decodedToken => console.log(decodedToken.uid))
			.catch(reason => console.log(reason));
	};
});

