// app/components/home/EditorialSection.tsx
import { ProductCard } from "../ProductCard";

type CardProduct = {
  id: string;
  slug: string;
  name: string;
  price?: number | null;
  currency?: string | null;
  compare_at_price?: number | null;
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
  is_featured?: boolean | null;
  is_trending?: boolean | null;
  new_until?: string | null;
  short_description?: string | null;
  volume_ml?: number | null;
  net_weight_g?: number | null;
  country_of_origin?: string | null;
  hero_image_url?: string | null;
  hero_image_path?: string | null;
  brands?: { name?: string | null } | null;
};

interface EditorialSectionProps {
  title: string;
  description?: string;
  products: CardProduct[];
}

export function EditorialSection({
  title,
  description,
  products,
}: EditorialSectionProps) {
  return (
    <section>
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold mb-2">{title}</h2>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>

      {/* 2 columns on mobile, 4 on large screens */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {products.map((product) => (
          <ProductCard key={product.id} product={product as any} />
        ))}
      </div>
    </section>
  );
}
