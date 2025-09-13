import { withApiAuthRequired, getSession } from "@auth0/nextjs-auth0";

export default withApiAuthRequired(async function handler(req, res) {
  const { user } = await getSession(req, res);
  res.status(200).json({ ok: true, user });
});
