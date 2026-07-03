import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { CipherGCM, DecipherGCM } from "node:crypto";

const MEDIA_CREDENTIAL_ENCRYPTION_KEY_ENV =
  "MEDIA_CREDENTIAL_ENCRYPTION_KEY";

const ENCRYPTION_VERSION = "v1";
const ENCRYPTION_ALGORITHM = "aes-256-gcm";

const ENCRYPTION_KEY_BYTE_LENGTH = 32;
const INITIALIZATION_VECTOR_BYTE_LENGTH = 12;
const AUTH_TAG_BYTE_LENGTH = 16;

const CIPHERTEXT_SEPARATOR = ".";

export type MediaCredentialJsonPrimitive =
  | string
  | number
  | boolean
  | null;

export type MediaCredentialJsonValue =
  | MediaCredentialJsonPrimitive
  | MediaCredentialJsonObject
  | MediaCredentialJsonValue[];

export interface MediaCredentialJsonObject {
  [key: string]: MediaCredentialJsonValue;
}

export class MediaCredentialCryptoError extends Error {
  readonly code:
    | "SERVER_ONLY"
    | "MISSING_ENCRYPTION_KEY"
    | "INVALID_ENCRYPTION_KEY"
    | "INVALID_PLAINTEXT"
    | "INVALID_CIPHERTEXT"
    | "UNSUPPORTED_CIPHERTEXT_VERSION"
    | "ENCRYPTION_FAILED"
    | "DECRYPTION_FAILED"
    | "INVALID_DECRYPTED_JSON";

  constructor(
    code: MediaCredentialCryptoError["code"],
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);

    this.name = "MediaCredentialCryptoError";
    this.code = code;
  }
}

function assertServerRuntime(): void {
  if (typeof window !== "undefined") {
    throw new MediaCredentialCryptoError(
      "SERVER_ONLY",
      "Media credential cryptography can only run on the server.",
    );
  }
}

function normalizeBase64(value: string): string {
  return value.replace(/\s+/g, "");
}

function decodeEncryptionKey(encodedKey: string): Buffer {
  const normalizedKey = normalizeBase64(encodedKey);

  if (!normalizedKey) {
    throw new MediaCredentialCryptoError(
      "INVALID_ENCRYPTION_KEY",
      `${MEDIA_CREDENTIAL_ENCRYPTION_KEY_ENV} must not be empty.`,
    );
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalizedKey)) {
    throw new MediaCredentialCryptoError(
      "INVALID_ENCRYPTION_KEY",
      `${MEDIA_CREDENTIAL_ENCRYPTION_KEY_ENV} must be a valid Base64 string.`,
    );
  }

  let decodedKey: Buffer;

  try {
    decodedKey = Buffer.from(normalizedKey, "base64");
  } catch (error) {
    throw new MediaCredentialCryptoError(
      "INVALID_ENCRYPTION_KEY",
      `${MEDIA_CREDENTIAL_ENCRYPTION_KEY_ENV} could not be decoded.`,
      { cause: error },
    );
  }

  if (decodedKey.length !== ENCRYPTION_KEY_BYTE_LENGTH) {
    throw new MediaCredentialCryptoError(
      "INVALID_ENCRYPTION_KEY",
      `${MEDIA_CREDENTIAL_ENCRYPTION_KEY_ENV} must decode to exactly ${ENCRYPTION_KEY_BYTE_LENGTH} bytes.`,
    );
  }

  const canonicalBase64 = decodedKey.toString("base64");
  const normalizedWithoutPadding = normalizedKey.replace(/=+$/u, "");
  const canonicalWithoutPadding = canonicalBase64.replace(/=+$/u, "");

  const suppliedBuffer = Buffer.from(normalizedWithoutPadding, "utf8");
  const canonicalBuffer = Buffer.from(canonicalWithoutPadding, "utf8");

  if (
    suppliedBuffer.length !== canonicalBuffer.length ||
    !timingSafeEqual(suppliedBuffer, canonicalBuffer)
  ) {
    throw new MediaCredentialCryptoError(
      "INVALID_ENCRYPTION_KEY",
      `${MEDIA_CREDENTIAL_ENCRYPTION_KEY_ENV} must use canonical Base64 encoding.`,
    );
  }

  return decodedKey;
}

function getEncryptionKey(): Buffer {
  assertServerRuntime();

  const encodedKey = process.env[MEDIA_CREDENTIAL_ENCRYPTION_KEY_ENV];

  if (!encodedKey) {
    throw new MediaCredentialCryptoError(
      "MISSING_ENCRYPTION_KEY",
      `${MEDIA_CREDENTIAL_ENCRYPTION_KEY_ENV} is not configured.`,
    );
  }

  return decodeEncryptionKey(encodedKey);
}

function encodeBase64Url(value: Buffer): string {
  return value.toString("base64url");
}

function decodeBase64Url(
  value: string,
  fieldName: "initialization vector" | "authentication tag" | "ciphertext",
): Buffer {
  if (!value || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new MediaCredentialCryptoError(
      "INVALID_CIPHERTEXT",
      `Encrypted credential contains an invalid ${fieldName}.`,
    );
  }

  try {
    return Buffer.from(value, "base64url");
  } catch (error) {
    throw new MediaCredentialCryptoError(
      "INVALID_CIPHERTEXT",
      `Encrypted credential contains an invalid ${fieldName}.`,
      { cause: error },
    );
  }
}

function applyAdditionalAuthenticatedData(
  cipher: CipherGCM | DecipherGCM,
  additionalAuthenticatedData?: string,
): void {
  if (additionalAuthenticatedData === undefined) {
    return;
  }

  if (!additionalAuthenticatedData) {
    throw new MediaCredentialCryptoError(
      "INVALID_PLAINTEXT",
      "Additional authenticated data must not be empty when provided.",
    );
  }

  cipher.setAAD(Buffer.from(additionalAuthenticatedData, "utf8"));
}

function parseEncryptedCredential(ciphertext: string): {
  version: string;
  initializationVector: Buffer;
  authTag: Buffer;
  encryptedValue: Buffer;
} {
  if (!ciphertext || typeof ciphertext !== "string") {
    throw new MediaCredentialCryptoError(
      "INVALID_CIPHERTEXT",
      "Encrypted credential must be a non-empty string.",
    );
  }

  const parts = ciphertext.split(CIPHERTEXT_SEPARATOR);

  if (parts.length !== 4) {
    throw new MediaCredentialCryptoError(
      "INVALID_CIPHERTEXT",
      "Encrypted credential has an invalid format.",
    );
  }

  const [version, initializationVectorValue, authTagValue, encryptedValue] =
    parts;

  if (version !== ENCRYPTION_VERSION) {
    throw new MediaCredentialCryptoError(
      "UNSUPPORTED_CIPHERTEXT_VERSION",
      "Encrypted credential uses an unsupported version.",
    );
  }

  const initializationVector = decodeBase64Url(
    initializationVectorValue,
    "initialization vector",
  );
  const authTag = decodeBase64Url(authTagValue, "authentication tag");
  const encryptedBuffer = decodeBase64Url(encryptedValue, "ciphertext");

  if (
    initializationVector.length !== INITIALIZATION_VECTOR_BYTE_LENGTH
  ) {
    throw new MediaCredentialCryptoError(
      "INVALID_CIPHERTEXT",
      "Encrypted credential contains an invalid initialization vector length.",
    );
  }

  if (authTag.length !== AUTH_TAG_BYTE_LENGTH) {
    throw new MediaCredentialCryptoError(
      "INVALID_CIPHERTEXT",
      "Encrypted credential contains an invalid authentication tag length.",
    );
  }

  if (encryptedBuffer.length === 0) {
    throw new MediaCredentialCryptoError(
      "INVALID_CIPHERTEXT",
      "Encrypted credential contains no encrypted data.",
    );
  }

  return {
    version,
    initializationVector,
    authTag,
    encryptedValue: encryptedBuffer,
  };
}

export function encryptMediaCredentialString(
  plaintext: string,
  additionalAuthenticatedData?: string,
): string {
  assertServerRuntime();

  if (!plaintext) {
    throw new MediaCredentialCryptoError(
      "INVALID_PLAINTEXT",
      "Media credential plaintext must be a non-empty string.",
    );
  }

  const encryptionKey = getEncryptionKey();
  const initializationVector = randomBytes(
    INITIALIZATION_VECTOR_BYTE_LENGTH,
  );

  try {
    const cipher = createCipheriv(
      ENCRYPTION_ALGORITHM,
      encryptionKey,
      initializationVector,
      {
        authTagLength: AUTH_TAG_BYTE_LENGTH,
      },
    );

    applyAdditionalAuthenticatedData(
      cipher,
      additionalAuthenticatedData,
    );

    const encryptedValue = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return [
      ENCRYPTION_VERSION,
      encodeBase64Url(initializationVector),
      encodeBase64Url(authTag),
      encodeBase64Url(encryptedValue),
    ].join(CIPHERTEXT_SEPARATOR);
  } catch (error) {
    if (error instanceof MediaCredentialCryptoError) {
      throw error;
    }

    throw new MediaCredentialCryptoError(
      "ENCRYPTION_FAILED",
      "Media credential encryption failed.",
      { cause: error },
    );
  } finally {
    encryptionKey.fill(0);
  }
}

export function decryptMediaCredentialString(
  ciphertext: string,
  additionalAuthenticatedData?: string,
): string {
  assertServerRuntime();

  const {
    initializationVector,
    authTag,
    encryptedValue,
  } = parseEncryptedCredential(ciphertext);

  const encryptionKey = getEncryptionKey();

  try {
    const decipher = createDecipheriv(
      ENCRYPTION_ALGORITHM,
      encryptionKey,
      initializationVector,
      {
        authTagLength: AUTH_TAG_BYTE_LENGTH,
      },
    );

    applyAdditionalAuthenticatedData(
      decipher,
      additionalAuthenticatedData,
    );

    decipher.setAuthTag(authTag);

    const decryptedValue = Buffer.concat([
      decipher.update(encryptedValue),
      decipher.final(),
    ]);

    return decryptedValue.toString("utf8");
  } catch (error) {
    if (error instanceof MediaCredentialCryptoError) {
      throw error;
    }

    throw new MediaCredentialCryptoError(
      "DECRYPTION_FAILED",
      "Media credential decryption failed.",
      { cause: error },
    );
  } finally {
    encryptionKey.fill(0);
  }
}

export function encryptMediaCredentialJson(
  credential: MediaCredentialJsonObject,
  additionalAuthenticatedData?: string,
): string {
  if (
    !credential ||
    typeof credential !== "object" ||
    Array.isArray(credential)
  ) {
    throw new MediaCredentialCryptoError(
      "INVALID_PLAINTEXT",
      "Media credential JSON must be an object.",
    );
  }

  let serializedCredential: string;

  try {
    serializedCredential = JSON.stringify(credential);
  } catch (error) {
    throw new MediaCredentialCryptoError(
      "INVALID_PLAINTEXT",
      "Media credential JSON could not be serialized.",
      { cause: error },
    );
  }

  if (!serializedCredential || serializedCredential === "{}") {
    throw new MediaCredentialCryptoError(
      "INVALID_PLAINTEXT",
      "Media credential JSON must contain at least one property.",
    );
  }

  return encryptMediaCredentialString(
    serializedCredential,
    additionalAuthenticatedData,
  );
}

export function decryptMediaCredentialJson<
  T extends MediaCredentialJsonObject = MediaCredentialJsonObject,
>(
  ciphertext: string,
  additionalAuthenticatedData?: string,
): T {
  const decryptedValue = decryptMediaCredentialString(
    ciphertext,
    additionalAuthenticatedData,
  );

  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(decryptedValue);
  } catch (error) {
    throw new MediaCredentialCryptoError(
      "INVALID_DECRYPTED_JSON",
      "Decrypted media credential is not valid JSON.",
      { cause: error },
    );
  }

  if (
    !parsedValue ||
    typeof parsedValue !== "object" ||
    Array.isArray(parsedValue)
  ) {
    throw new MediaCredentialCryptoError(
      "INVALID_DECRYPTED_JSON",
      "Decrypted media credential JSON must be an object.",
    );
  }

  return parsedValue as T;
}

export function validateMediaCredentialEncryptionKey(): void {
  const encryptionKey = getEncryptionKey();

  encryptionKey.fill(0);
}