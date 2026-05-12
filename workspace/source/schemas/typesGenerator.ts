import fs from 'fs'
import { compile, Options } from 'json-schema-to-typescript'
import path from 'path'

const render_controllers = "https://raw.githubusercontent.com/Blockception/Minecraft-bedrock-json-schemas/58a278c62aeff1e32810742f7ed3b1824b86d6ba/resource/render_controllers/render_controllers.json"
const model_entity = "https://raw.githubusercontent.com/Blockception/Minecraft-bedrock-json-schemas/58a278c62aeff1e32810742f7ed3b1824b86d6ba/resource/models/entity/model_entity.json"
const behavior_entities = "https://raw.githubusercontent.com/Blockception/Minecraft-bedrock-json-schemas/58a278c62aeff1e32810742f7ed3b1824b86d6ba/behavior/entities/entities.json"
const resource_entity = "https://raw.githubusercontent.com/Blockception/Minecraft-bedrock-json-schemas/58a278c62aeff1e32810742f7ed3b1824b86d6ba/resource/entity/entity.json"
const sounds = "https://raw.githubusercontent.com/Blockception/Minecraft-bedrock-json-schemas/58a278c62aeff1e32810742f7ed3b1824b86d6ba/resource/sounds.json"
const resource_animation_controller = "https://raw.githubusercontent.com/Blockception/Minecraft-bedrock-json-schemas/2eacc5eae80e5ceb9c8c7bec7e5f50a0547c48ba/resource/animation_controllers/animation_controller.json"
const manifest = "https://raw.githubusercontent.com/Blockception/Minecraft-bedrock-json-schemas/0e2d4242bbfd87a7654c06859c94675b34cf2711/general/manifest.json"

async function loadSchema(schema: any | string) {
    if (typeof schema === 'string') {
        const res = await fetch(schema)
        if (!res.ok) throw new Error(`Error trying to fetch schema: ${res.status}`)
        return await res.json()
    }
    return schema
}

async function generateSchema(schema: any | string, name: string, outputPath: string = './workspace/source/schemas/types') {
    const outputFile = path.join(outputPath, `${name}.d.ts`)
    !fs.existsSync(outputPath) && fs.mkdirSync(outputPath, { recursive: true })

    const options: Partial<Options> = {
        bannerComment: "",
        unreachableDefinitions: true,
        style: {
            singleQuote: true,
        },
        format: false,
    }

    const resolvedSchema = await loadSchema(schema)

    let ts = await compile(resolvedSchema, "MinecraftEntity", options)

    ts = ts.replace(/export type (\d+)/g, 'export type Type$1')
    ts = ts.replace(/: (\d+)([A-Z])/g, ': Type$1$2')
    ts = ts.replace(/: (\d+);/g, ': Type$1;')
    ts = ts.replace(/: (\d+)\?/g, ': Type$1?')
    ts = ts.replace(/: (\d+)\|/g, ': Type$1|')
    ts = ts.replace(/\| (\d+)([A-Z])/g, '| Type$1$2')
    ts = ts.replace(/\[key: string\]: (\d+)/g, '[key: string]: Type$1')
    ts = ts.replace(/Array<(\d+)/g, 'Array<Type$1')
    ts = ts.replace(/export interface (\d+)/g, 'export interface Type$1')

    fs.writeFileSync(outputFile, ts, 'utf-8')
    console.log(`Json Schema created at: ${outputFile}`)
}

generateSchema(behavior_entities, 'BehaviorEntity')
generateSchema(resource_entity, 'ResourceEntity')
generateSchema(render_controllers, 'render_controllers')
generateSchema(model_entity, 'model_entity')
generateSchema(sounds, 'sounds')
generateSchema(resource_animation_controller, 'resource_animation_controller')
generateSchema(manifest, 'manifest')