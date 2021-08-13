import { Client } from "../../Types/client";
import { Message } from "../../Types/common";
import { Module } from "../module";

const REQUESTS_MAX_MEMORY = 30;

class TelemetryModule extends Module {
	public prefix = "";
	// Very approximate, firestore billing is pretty obscure
	public ioOperations = {
		reads: 0,
		writes: 0,
		internalReads: 0,
		internalWrites: 0, // Unused for now
	}
	public requestDeque: [string, string][] = []; // Event string to client uid

	public async handleEvent(message: Message<unknown>, client: Client): Promise<boolean> {
		if (this.requestDeque.length >= REQUESTS_MAX_MEMORY) {
			this.requestDeque.shift();
		}
		this.requestDeque.push([message.event, client.uid]);

		return false;
	}

	public onClose(_: Client): void { return; }

	public read(internal = true): void {
		if (internal) ++this.ioOperations.internalReads;
		else ++this.ioOperations.reads;
	}

	public write(internal = true): void {
		if (internal) ++this.ioOperations.internalWrites;
		else ++this.ioOperations.writes;
	}
}

export const telemetry = new TelemetryModule();
