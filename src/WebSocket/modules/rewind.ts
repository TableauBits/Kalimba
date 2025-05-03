import { createMessage, EventType, extractMessageData, Message, RewindPerYear, RwdReqGet, RwdReqUnsubscribe, RwdResUpdate } from "chelys";
import { Client } from "../../Types/client";
import { Module } from "../module";
import { isNil } from "lodash";
import { telemetry } from "./telemetry";
import { firestore } from "../firebase";

const FS_REWIND_ROOT_PATH = "rewind";
const FS_REWIND_PER_YEAR_COLLECTION = "per_year";

interface SubscriptionData {
    data: RewindPerYear;
    listeners: Set<Client>;
}

type UserRewinds = Map<number, SubscriptionData>

class RewindModule extends Module {
    public prefix = "RWD";
    private rewinds: Map<string, UserRewinds> = new Map(); // uid -> year -> data

    constructor() {
        super();
        this.moduleMap.set(EventType.REWIND_get, this.get);
        this.moduleMap.set(EventType.REWIND_unsubscribe, this.unsubscribe);

        firestore.collection(FS_REWIND_ROOT_PATH).onSnapshot((collection) => {
            for (const change of collection.docChanges()) {
                const uid = change.doc.id;

                switch (change.type) {
                    case "added": {
                        firestore.collection(`${FS_REWIND_ROOT_PATH}/${uid}/${FS_REWIND_PER_YEAR_COLLECTION}/`)
                            .onSnapshot((collection) => {
                                for (const change of collection.docChanges()) {
                                    const year = parseInt(change.doc.id);
                                    const newRewindData = change.doc.data() as RewindPerYear;

                                    switch (change.type) {
                                        case "added": {
                                            if (!this.rewinds.has(uid)) this.rewinds.set(uid, new Map());
                                            this.rewinds.get(uid)!.set(year, { data: newRewindData, listeners: new Set() })

                                            telemetry.read(false);
                                        } break;

                                        case "modified": {
                                            const userRewinds = this.rewinds.get(uid);
                                            if (isNil(userRewinds)) continue;
                                            const yearSubscription = userRewinds.get(year);
                                            if (isNil(yearSubscription)) continue;

                                            yearSubscription.data = newRewindData;
                                            const updateMessage = createMessage<RwdResUpdate>(EventType.REWIND_update, { year, rewind: newRewindData });
                                            yearSubscription.listeners.forEach((listener) => {
                                                listener.socket.send(updateMessage);
                                                telemetry.read();
                                            });
                                            telemetry.read(false);
                                        } break;

                                        case "removed": {
                                            const userRewinds = this.rewinds.get(uid);
                                            if (isNil(userRewinds)) continue;
                                            userRewinds.delete(year);
                                        } break;
                                    }
                                }
                            });
                    } break;

                    // ignored...
                    case "modified": { } break;
                    case "removed": { } break;
                }
            }
        })
    }

    private async get(message: Message<unknown>, client: Client): Promise<void> {
        const requestData = extractMessageData<RwdReqGet>(message);

        if (isNil(requestData)) return;
        // if (client.uid !== requestData.uid) return;

        const userRewinds = this.rewinds.get(requestData.uid);
        if (isNil(userRewinds)) return;

        userRewinds.forEach((rewind, year) => {
            rewind.listeners.add(client);
            client.socket.send(createMessage<RwdResUpdate>(EventType.REWIND_update, { year, rewind: rewind.data }));
            telemetry.read();
        });
    }

    private async unsubscribe(message: Message<unknown>, client: Client): Promise<void> {
        const requestData = extractMessageData<RwdReqUnsubscribe>(message);

        if (isNil(requestData)) return;

        const userRewinds = this.rewinds.get(requestData.uid);
        if (isNil(userRewinds)) return;

        userRewinds.forEach(rewind => {
            rewind.listeners.delete(client);
        });
    }

    public async handleEvent(message: Message<unknown>, client: Client): Promise<boolean> {
        const eventCallback = this.moduleMap.get(message.event);
        if (eventCallback === undefined) {
            return false;
        }

        eventCallback.apply(this, [message, client]);
        return true;
    }

    public onClose(client: Client): void {
        this.rewinds.forEach((user_rewinds) => {
            user_rewinds.forEach((rewind) => rewind.listeners.delete(client));
        });
    }
}

export const rewindModule = new RewindModule();