import { Router } from "express";
import { userModule } from "../../../WebSocket/modules/user";

export const USER_INFO_PATH = "user-info";

const UserInfoController = Router();

const USER_UID = 0;
const USER_DISPLAY_NAME = 1;

UserInfoController.get("/", async (_, res) => {
	const uidToName: Record<string, string> = {};

	Array.from(userModule.users.entries()).forEach((entry) => {
		uidToName[entry[USER_UID]] = entry[USER_DISPLAY_NAME].data.displayName;
	});
  
	res.send(JSON.stringify(uidToName));
});

export { UserInfoController };