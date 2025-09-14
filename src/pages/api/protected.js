import { auth0 } from "@/lib/auth0";

export default auth0.withApiAuthRequired(async function handler(req, res) {
  const { user } = await auth0.getSession(req);
  res.status(200).json({ ok: true, user });
});
