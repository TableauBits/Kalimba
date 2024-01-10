import * as dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { Server } from "ws";
import { createEndpoints } from "./REST/endpoint-creation";
import { setupWS } from "./WebSocket/event-handler";

const isProd = process.env["ENVIRONMENT"] === "PRODUCTION";

// create HTTP server
const port = parseInt(process.env["PORT"] || "3000");
const listenIP = isProd ? "0.0.0.0" : "localhost";
const server = createEndpoints(
    express()
        .use(cors())
        .use(express.json())
)
    .listen(port, listenIP, () => console.log(`server listening on ${listenIP}:${port}`));

// create WS server
const wsServer = new Server({ server });
wsServer.on("connection", (ws) => {
    console.log("client connected");
    ws.on("close", () => console.log("client disconnected"));
    setupWS(ws);
});
