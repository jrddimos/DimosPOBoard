import { useCallback, useEffect, useState } from 'react'

// Colonne "titre" redimensionnable pour les arbres en grille (exigences,
// couverture, backlog…) : la largeur max de la première colonne devient une
// variable CSS (--col-titre) posée sur le conteneur de l'arbre, que chaque
// ligne consomme dans son grid-template-columns — pas besoin de threader la
// valeur jusqu'aux composants de ligne. Persistée par vue (localStorage).
export function useColonneTitre(storageKey: string, defaultWidth: number, min = 200, max = 1100) {
  const [width, setWidth] = useState(() => {
    const s = Number(localStorage.getItem(storageKey))
    return s >= min && s <= max ? s : defaultWidth
  })
  useEffect(() => { localStorage.setItem(storageKey, String(Math.round(width))) }, [storageKey, width])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    const onMove = (ev: MouseEvent) => setWidth(Math.min(max, Math.max(min, startW + ev.clientX - startX)))
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [width, min, max])

  return { width, onMouseDown }
}

// Poignée verticale pleine hauteur, à poser dans le conteneur (position:
// relative) de l'arbre — `left` = largeur de la colonne + padding gauche des
// lignes. Zone de saisie large (7px), trait fin visible au survol seulement.
export function ColonneTitreHandle({ left, onMouseDown }: { left: number; onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div onMouseDown={onMouseDown} title="Glisser pour redimensionner la colonne titre"
      className="absolute top-0 bottom-0 w-[7px] -translate-x-1/2 cursor-col-resize z-20 group/rsz"
      style={{ left }}>
      <div className="mx-auto h-full w-[2px] bg-transparent group-hover/rsz:bg-indigo-300 group-active/rsz:bg-indigo-400 transition-colors" />
    </div>
  )
}
