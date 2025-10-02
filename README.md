# Minecraft Bedrock Workspace

Este workspace permite trabalhar com projetos Minecraft Bedrock de forma modular, com transpilação automática de TypeScript para JavaScript e sincronização automática com a pasta `.com.mojang`.

## Estrutura do Workspace

```py
workspace/
├─ .vscode/                     # Configurações gerais
│   ├─ extensions.json          # .
│   ├─ launch.json              # .
│   └─ tasks.json               # Configuração Prettier
├─ scripts/                     # Bibliotecas globais compartilhadas
├─ libraries/                   # Bibliotecas globais compartilhadas
│   └─ maths/                   # Exemplo: biblioteca matemática
│       └─ clamp.js             # Funções utilitárias
├─ projects/                    # Seus projetos
│   └─ template/                # Exemplo de projeto
│       ├─ .vscode/             # VS Code tasks específicas
│       ├─ behavior_pack/       # Behavior Pack do Minecraft
│       │   └─ tscripts/        # Código TypeScript (será transpilado)
│       └─ resource_pack/       # Resource Pack do Minecraft
└─ README.md                    # Esta documentação
```