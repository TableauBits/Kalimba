import * as dotenv from "dotenv";
import * as admin from "firebase-admin";
import express from "express";
import cors from "cors";
import { Server } from "ws";
import { createEndpoints } from "./REST/endpoint-creation";
import { authenticateWS } from "./WebSocket/listeners-creation";

dotenv.config();

const port = process.env["PORT"] || 3000;
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

const server = createEndpoints(express())
	.use(cors())
	.listen(port, () => console.log(`server listening on ${port}`));

const wsServer = new Server({ server });
wsServer.on("connection", (ws) => {
	console.log("client connected");
	ws.on("close", () => console.log("client disconnected"));
	authenticateWS(ws);
});

