import { useEffect, type RefObject } from 'react'

export function useClickOutside(ref: RefObject<HTMLElement | null>, onOutside: () => void, active = true) {
  useEffect(() => {
    if (!active) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside()
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  // ref est stable (identité constante d'un render à l'autre) et sa valeur
  // .current est lue au moment du clic, pas figée à la pose de l'effet.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, onOutside])
}
