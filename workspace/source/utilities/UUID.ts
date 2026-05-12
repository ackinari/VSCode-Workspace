import * as crypto from 'crypto'

export function generateUUID(): string {
    return crypto.randomUUID()
}

export function generateManifestUUIDs(): {
    behaviorHeaderUuid: string,
    behaviorModuleUuid: string,
    resourceHeaderUuid: string,
    resourceModuleUuid: string
} {
    return {
        behaviorHeaderUuid: generateUUID(),
        behaviorModuleUuid: generateUUID(),
        resourceHeaderUuid: generateUUID(),
        resourceModuleUuid: generateUUID()
    }
}