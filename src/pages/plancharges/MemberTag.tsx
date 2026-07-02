import type { UserProfile } from '@/contexts/AuthContext'

export function MemberTag({ profile }: { profile: UserProfile }) {
  const initials = profile.trigramme ?? (profile.display_name ?? '?').slice(0,2).toUpperCase()
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[9px] font-bold shrink-0"
        style={{ background: profile.couleur ?? '#4A4CC8' }}>
        {initials.slice(0,2)}
      </span>
      <span className="text-[10px] text-navy/70 font-medium truncate max-w-[100px]">
        {profile.prenom ?? profile.display_name ?? initials}
      </span>
    </span>
  )
}
