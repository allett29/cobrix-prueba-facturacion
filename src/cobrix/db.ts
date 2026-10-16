/**
 * Apertura e inicialización de data/cobrix.sqlite.
 */

import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

import { COBRIX_SCHEMA } from './schema.ts'
import { type CobrixSeedOptions, seedCobrixDefaults } from './seed.ts'

export const DEFAULT_COBRIX_DB = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/cobrix.sqlite')

export interface CobrixDatabase {
	readonly db: DatabaseSync
	readonly path: string
}

export function openCobrixDatabase(dbPath: string, seedOptions: CobrixSeedOptions): CobrixDatabase {
	mkdirSync(dirname(dbPath), { recursive: true })
	const db = new DatabaseSync(dbPath)
	db.exec('PRAGMA foreign_keys = ON')
	db.exec(COBRIX_SCHEMA)
	seedCobrixDefaults(db, seedOptions)
	return { db, path: dbPath }
}

export function closeCobrixDatabase(handle: CobrixDatabase): void {
	handle.db.close()
}
