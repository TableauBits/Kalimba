import { EMPTY_USER, Inviter, InvReqPOST, InvResGET, InvResPOST } from "chelys";
import { Router } from "express";
import { isNil } from "lodash";
import { auth } from "../../../WebSocket/firebase";
import { inviteModule } from "../../../WebSocket/modules/invite";
import { telemetry } from "../../../WebSocket/modules/telemetry";
import { userModule } from "../../../WebSocket/modules/user";

export const INVITES_PATH = "invite";

const InvitesController = Router();

InvitesController.get("/:id", async (req, res) => {
	const errorMessage: InvResGET = { isValid: false, inviter: EMPTY_USER };
	const id = req.params["id"];
	if (isNil(id)) {
		res.send(errorMessage);
		return;
	}

	const invite = inviteModule.invites.get(id);
	telemetry.read();
	if (isNil(invite)) {
		res.send(errorMessage);
		return;
	}

	const inviter: Inviter = { displayName: "unknown user", photoURL: "https://i.imgur.com/RGurtQW.png" };
	const inviterData = userModule.users.get(invite.createdBy);
	telemetry.read();
	if (!isNil(inviterData)) {
		inviter.displayName = inviterData.data.displayName;
		inviter.photoURL = inviterData.data.photoURL;
	}
	const successMessage: InvResGET = { isValid: true, inviter };
	res.send(successMessage);
});

InvitesController.post("/:id", async (req, res) => {
	const errorMessage: InvResPOST = { response: { success: false, status: "Invalid invite ID" } };
	const inviteID = req.params["id"];
	if (isNil(inviteID)) {
		res.send(errorMessage);
		return;
	}

	const invite = inviteModule.invites.get(inviteID);
	telemetry.read();
	if (isNil(invite)) {
		res.send(errorMessage);
		return;
	}

	errorMessage.response.status = "Invalid request: missing account info";
	const newAccount = (req.body as InvReqPOST).newAccount;
	if (isNil(newAccount)) {
		res.send(errorMessage);
		return;
	}

	inviteModule.deleteInvite(inviteID);

	try {
		await auth.createUser(newAccount);
	} catch (error) {
		errorMessage.response.status = `Failed to create matbay account: ${error}`;
		res.send(errorMessage);
		return;
	}

	try {
		await userModule.createUser(newAccount);
	} catch (error) {
		await auth.deleteUser(newAccount.uid);
		errorMessage.response.status = `Failed to create matbay account: ${error}`;
		res.send(errorMessage);
		return;
	}

	const successMessage: InvResPOST = { response: { success: true, status: "New user successfully created" } };
	res.send(successMessage);
});

export { InvitesController };