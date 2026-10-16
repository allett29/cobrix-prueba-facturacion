/**
 * Cifrado de la contraseña del proveedor en reposo (AES-256-GCM).
 * Clave: COBRIX_MASTER_KEY (32+ bytes recomendado) o derivación de desarrollo documentada.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const DEV_MASTER_SEED = 'cobrix-prueba-facturacion-dev-only'
const ALGO = 'aes-256-gcm'
const IV_BYTES = 12

function masterKey(): Buffer {
	const fromEnv = process.env.COBRIX_MASTER_KEY
	if (fromEnv && fromEnv.length >= 16) {
		return createHash('sha256').update(fromEnv, 'utf8').digest()
	}
	return createHash('sha256').update(DEV_MASTER_SEED, 'utf8').digest()
}

/** Formato almacenado: base64(iv || tag || ciphertext). */
export function encryptSecret(plaintext: string): string {
	const iv = randomBytes(IV_BYTES)
	const cipher = createCipheriv(ALGO, masterKey(), iv)
	const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
	const tag = cipher.getAuthTag()
	return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

export function decryptSecret(payload: string): string {
	const buf = Buffer.from(payload, 'base64')
	if (buf.length < IV_BYTES + 16 + 1) {
		throw new Error('Payload cifrado inválido')
	}
	const iv = buf.subarray(0, IV_BYTES)
	const tag = buf.subarray(IV_BYTES, IV_BYTES + 16)
	const data = buf.subarray(IV_BYTES + 16)
	const decipher = createDecipheriv(ALGO, masterKey(), iv)
	decipher.setAuthTag(tag)
	return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}
