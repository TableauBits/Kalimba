import express from "express";
import cors from "cors";
import { Server } from "ws";
import { createEndpoints } from "./REST/endpoint-creation";
import { setupWS } from "./WebSocket/event-handler";

// create HTTP server
const port = process.env["PORT"] || 3000;
const server = createEndpoints(express())
	.use(cors())
	.listen(port, () => console.log(`server listening on ${port}`));

// create WS server
const wsServer = new Server({ server });
wsServer.on("connection", (ws) => {
	console.log("client connected");
	ws.on("close", () => console.log("client disconnected"));
	setupWS(ws);
});
