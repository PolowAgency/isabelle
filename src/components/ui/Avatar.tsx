export function Avatar({
  initiales,
  couleur,
  size = 36,
}: {
  initiales: string;
  couleur: string;
  size?: number;
}) {
  return (
    <div
      className="flex items-center justify-center rounded-full font-semibold text-white shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: couleur,
        fontSize: size * 0.38,
      }}
    >
      {initiales}
    </div>
  );
}
