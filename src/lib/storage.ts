import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl as presign } from "@aws-sdk/s3-request-presigner";

let client: S3Client | null = null;

export type DocumentKind = "ordonnances" | "documents";

export function isStorageConfigured(): boolean {
  return Boolean(
    process.env.S3_ENDPOINT &&
      process.env.S3_BUCKET &&
      process.env.S3_ACCESS_KEY &&
      process.env.S3_SECRET_KEY &&
      process.env.S3_REGION
  );
}

function requireStorageConfig() {
  if (!isStorageConfigured()) {
    throw new Error("Le stockage S3 n'est pas encore configuré.");
  }

  return {
    endpoint: process.env.S3_ENDPOINT!,
    bucket: process.env.S3_BUCKET!,
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
    region: process.env.S3_REGION!,
  };
}

function getS3Client(): S3Client {
  if (client) return client;

  const config = requireStorageConfig();
  client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return client;
}

function getBucket(): string {
  return requireStorageConfig().bucket;
}

/** Clé d'objet déjà construite côté serveur (voir fichiers.ts : nomObjet) : aucun nom fourni par l'utilisateur. */
export function buildObjectKeyFromName(cle: string): string {
  if (!/^(ordonnances|documents)\/[0-9a-zA-Z-]{1,64}\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/.test(cle)) {
    throw new Error("Clé d'objet invalide.");
  }
  return cle;
}

export async function uploadObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return key;
}

export async function getSignedDownloadUrl(key: string, expiresInSeconds = 900): Promise<string> {
  return presign(
    getS3Client(),
    new GetObjectCommand({ Bucket: getBucket(), Key: key }),
    { expiresIn: expiresInSeconds }
  );
}

export async function deleteObject(key: string): Promise<void> {
  await getS3Client().send(
    new DeleteObjectCommand({ Bucket: getBucket(), Key: key })
  );
}
