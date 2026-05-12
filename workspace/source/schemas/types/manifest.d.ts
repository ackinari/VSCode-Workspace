/**
 * The minecraft manifest schema.
 */
export interface ManifestSchema {
    format_version: number
    header: {
        name: string
        description: string
        uuid: string
        version: number[]
        min_engine_version: number[]
    }
    modules: Array<{
        uuid: string
        type: string
        version: number[]
    }>
    dependencies?: Array<{
        uuid: string
        version: number[]
    }>
}