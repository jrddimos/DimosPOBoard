import { Layout } from '@/components/layout/Layout'
import { Spinner } from '@/components/ui/Spinner'
import { useProduits } from '@/hooks/useProduits'
import { useProduit } from '@/contexts/ProduitContext'
import { ProduitDashboardBody } from './ProduitDashboardBody'

export default function ProduitDashboardPage() {
  const { produitActif }        = useProduit()
  const { data: produits = [], isLoading } = useProduits()

  if (isLoading) return <Layout><Spinner /></Layout>

  const produit = produits.find(p => p.id === produitActif?.id)

  if (!produit) return (
    <Layout>
      <div className="text-center py-20 text-subtle text-sm">Aucun produit actif</div>
    </Layout>
  )

  return (
    <Layout title={`Dashboard — ${produit.nom}`}>
      <ProduitDashboardBody produit={produit} />
    </Layout>
  )
}
