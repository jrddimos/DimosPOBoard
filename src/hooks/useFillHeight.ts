import { useState, useLayoutEffect, type RefObject } from 'react'

// Occupe tout l'espace vertical restant sous un élément dans la page
// (jusqu'en bas de la fenêtre) plutôt qu'une hauteur fixe — utilisé par les
// arbres react-arborist, qui virtualisent et scrollent en interne si le
// contenu dépasse la hauteur mesurée.
export function useFillHeight(containerRef: RefObject<HTMLDivElement | null>, min = 320) {
  const [height, setHeight] = useState(min)
  useLayoutEffect(() => {
    function measure() {
      if (!containerRef.current) return
      const top = containerRef.current.getBoundingClientRect().top
      setHeight(Math.max(min, window.innerHeight - top - 16))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [containerRef, min])
  return height
}
