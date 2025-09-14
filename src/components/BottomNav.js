import Link from "next/link";
import { useRouter } from "next/router";

export default function BottomNav() {
  const router = useRouter();
  const items = [
    { href: "/", label: "Craft", icon: CraftIcon },
    { href: "/aircraft", label: "Hangar", icon: HangarIcon },
    { href: "/leaderboard", label: "Leaders", icon: LeaderboardIcon },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50">
      <div className="mx-auto max-w-xl px-4 pb-[calc(env(safe-area-inset-bottom))]">
        <div className="glass-nav rounded-2xl mb-3 border border-white/10 bg-black/60 backdrop-blur-md">
          <ul className="grid grid-cols-3">
            {items.map(({ href, label, icon: Icon }) => {
              const active = router.pathname === href;
              return (
                <li key={href} className="relative">
                  <Link
                    href={href}
                    className={`flex flex-col items-center justify-center gap-1 py-3 text-xs transition-colors ${
                      active ? "text-cyan-200" : "text-white/70 hover:text-white"
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${active ? "text-cyan-300" : "text-white/70"}`} />
                    <span>{label}</span>
                    {active && (
                      <span className="absolute top-0 inset-x-8 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <style jsx>{`
        .glass-nav { box-shadow: 0 8px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06); }
      `}</style>
    </nav>
  );
}

function CraftIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 13h7l2-2 7-3 1 2-6 3 6 3-1 2-7-3-2-2H3z" />
    </svg>
  );
}

function HangarIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 9l9-5 9 5v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z" />
      <path d="M9 21V9h6v12" />
    </svg>
  );
}

function LeaderboardIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 21h4V10H4v11zM10 21h4V3h-4v18zM16 21h4v-6h-4v6z" />
    </svg>
  );
}
