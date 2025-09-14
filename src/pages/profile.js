import { auth0 } from "@/lib/auth0";

function ProfilePage({ user }) {

  return (
    <div className="min-h-dvh bg-gradient-to-br from-[#050816] via-[#071032] to-[#07101a] text-white font-sans p-6 sm:p-10">
      <main className="max-w-xl mx-auto mt-8">
        <section className="glass rounded-2xl p-6">
          <h2 className="text-2xl font-bold mb-4">Profile</h2>
          {user && (
            <div className="space-y-2 text-sm">
              <div><span className="text-white/60">Name:</span> {user.name}</div>
              <div><span className="text-white/60">Email:</span> {user.email}</div>
              <div className="flex items-center gap-3 mt-3">
                {user.picture && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.picture} alt="avatar" className="w-12 h-12 rounded-full" />
                )}
                <a href="/auth/logout" className="px-3 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20 transition-colors">Logout</a>
              </div>
            </div>
          )}
        </section>
      </main>

      <style jsx>{`
        .glass { background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1); }
      `}</style>
    </div>
  );
}

export default auth0.withPageAuthRequired(ProfilePage);

export const getServerSideProps = auth0.withPageAuthRequired({
  async getServerSideProps(ctx) {
    const { user } = await auth0.getSession(ctx.req);
    return { props: { user } };
  },
});
