// Réduit une photo de téléphone (souvent 3–8 Mo) avant envoi : Vercel refuse
// les requêtes de plus de 4,5 Mo. Les PDF et autres fichiers sont renvoyés tels quels.
export async function compresserImage(file: File, maxSide = 1800, quality = 0.8): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 700 * 1024) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
