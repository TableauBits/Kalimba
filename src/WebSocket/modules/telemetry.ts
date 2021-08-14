import { isNil } from "lodash";
import { Client } from "../../Types/client";
import { Message } from "../../Types/common";
import { Module } from "../module";

class TelemetryModule extends Module {
	public prefix = "";
	// Very approximate, firestore billing is pretty obscure
	public ioOperations = {
		reads: 0,
		writes: 0,
		internalReads: 0,
		internalWrites: 0, // Unused for now
	}
	public eventHeatmap: Map<string, number> = new Map();

	public async handleEvent(message: Message<unknown>, _: Client): Promise<boolean> {
		const count = this.eventHeatmap.get(message.event);
		if (isNil(count)) this.eventHeatmap.set(message.event, 1);
		else this.eventHeatmap.set(message.event, count + 1);

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
