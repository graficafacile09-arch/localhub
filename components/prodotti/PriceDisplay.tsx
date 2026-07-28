export function PriceDisplay({
  price,
  className = "",
}: {
  price: number;
  className?: string;
}) {
  console.log("[PriceDisplay] rendering, price:", price, typeof price);
  return (
    <p className={`text-2xl font-black text-emerald-700 ${className}`}>
      €{price.toFixed(2)}
    </p>
  );
}
