import { auth0 } from "../../../lib/auth0";

export default async function handler(req, res) {
	// The `auth0` client exposes `handleAuth` as a method that accepts the req/res
	// and will route to login/callback/logout/etc. This matches the v4 SDK usage.
	return auth0.handleAuth(req, res);
}
