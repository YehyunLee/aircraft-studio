import { Auth0Client } from "@auth0/nextjs-auth0/server";

// Singleton Auth0 client using env vars from .env.local
// Configure optional hooks to control what is saved in the session
export const auth0 = new Auth0Client({
	// Example: restrict session user fields to a minimal subset
	async beforeSessionSaved(session, idToken) {
		const safeUser = {
			sub: session.user?.sub,
			name: session.user?.name,
			email: session.user?.email,
			picture: session.user?.picture,
		};
		return {
			...session,
			user: safeUser,
		};
	},
});