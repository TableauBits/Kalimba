const encryptedAdminSAK = process.env["MATBAY_SERVICE_ACCOUNT_KEY"];

if (encryptedAdminSAK == undefined) {
	console.log("Unable to start server: firebase admin service acount key not found in ENV: MATBAY_SERVICE_ACCOUNT_KEY");
	process.exit(-1);
}

export const ENCRYPTED_ADMIN_SAK = encryptedAdminSAK;

export const DASHBOARD_PASSWORD = process.env["DASHBOARD_PASSWORD"] || "";
