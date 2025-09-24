# Minecraft Bedrock Workspace

Este workspace permite trabalhar com projetos Minecraft Bedrock de forma modular, com transpilação automática de TypeScript para JavaScript e sincronização automática com a pasta `.com.mojang`.

## Estrutura do Workspace

```
workspace/
├─ eslint/                    # Configurações centralizadas
│   ├─ node_modules/         # Dependências compartilhadas
│   ├─ .vscode/              # Configurações do VS Code
│   ├─ workspace-manager.js  # Script principal de automação
│   ├─ package.json          # Dependências e scripts
│   ├─ tsconfig.json         # Configuração TypeScript
│   ├─ eslint.config.mjs     # Configuração ESLint
│   └─ .prettierrc.json      # Configuração Prettier
├─ libraries/                # Bibliotecas globais compartilhadas
│   └─ maths/               # Exemplo: biblioteca matemática
│       └─ clamp.js         # Funções utilitárias
├─ projects/                 # Seus projetos
│   └─ template/          # Exemplo de projeto
│       ├─ .vscode/         # VS Code tasks específicas
│       ├─ behavior_pack/   # Behavior Pack do Minecraft
│       │   └─ tscripts/    # Código TypeScript (será transpilado)
│       └─ resource_pack/   # Resource Pack do Minecraft
└─ README.md                # Esta documentação
```

## Como Usar

### 1. Configuração Inicial

Navegue até a pasta `eslint` e instale as dependências:

```bash
cd workspace/eslint
npm install
```

### 2. Criar um Novo Projeto

1. Crie uma pasta para seu projeto em `workspace/projects/`
2. Dentro da pasta do projeto, crie:
   - `behavior_pack/` - Para o behavior pack
   - `behavior_pack/tscripts/` - Para código TypeScript (opcional)
   - `behavior_pack/scripts/` - Para código JavaScript (opcional)
   - `resource_pack/` - Para o resource pack (opcional)

### 3. Iniciar Desenvolvimento

**Opção 1: VS Code Tasks (Recomendado)**
```bash
cd workspace/projects/template
code .
# Pressione Ctrl+Shift+P → "Tasks: Run Task" → "Start Minecraft Project"
```

**Opção 2: Command Line**
```bash
cd workspace/projects/template
node ../../eslint/workspace-manager.js start-current
```

### 4. VS Code Tasks Disponíveis

Quando estiver na pasta de um projeto, use `Ctrl+Shift+P` e digite "Tasks":

- **Start Minecraft Project** - Inicia monitoramento automático (padrão)
- **Build Project Once** - Compila e sincroniza apenas uma vez
- **Stop Minecraft Project** - Para todos os processos Node.js
- **Debug Project Info** - Mostra informações de debug do projeto
- **List Available Libraries** - Lista bibliotecas globais disponíveis

### 5. Comandos CLI Disponíveis

```bash
# Monitoramento automático
npm run start-project NomeDoProjeto    # Projeto específico
npm run start-current                  # Projeto atual

# Build único (sem monitoramento)
node workspace-manager.js build NomeDoProjeto
node workspace-manager.js build-current

# Utilitários
node workspace-manager.js list                # Listar projetos
node workspace-manager.js list-libraries      # Listar bibliotecas
node workspace-manager.js debug [projeto]     # Informações de debug
node workspace-manager.js stop NomeDoProjeto  # Parar monitoramento
```

## Funcionalidades

### Transpilação Automática

- **TypeScript**: Monitora `behavior_pack/tscripts/` e compila diretamente para development
- **JavaScript**: Usa arquivos em `behavior_pack/scripts/` diretamente
- **Sem arquivos .map**: Source maps não são copiados para Minecraft
- **Dependências compartilhadas**: Usa `eslint/node_modules` para todos os projetos

### Sincronização Inteligente

- **Compilação direta**: TypeScript vai direto para `.com.mojang/development_behavior_packs/`
- **Smart sync**: Só atualiza arquivos modificados
- **Preservação**: Mantém pasta `scripts` compilada no development
- **Limpeza automática**: Remove arquivos que não existem mais no source

### Sistema de Libraries Globais

- **Pasta `libraries/`**: Bibliotecas compartilhadas entre todos os projetos
- **Auto-importação**: Libraries são automaticamente disponibilizadas
- **Exemplo de uso**:
  ```javascript
  // Em seu projeto TypeScript/JavaScript
  import { clamp, lerp } from './libraries/maths/clamp.js';
  
  const value = clamp(playerHealth, 0, 100);
  ```

### Monitoramento de Arquivos

- **Watch automático**: Detecta mudanças em TypeScript, JavaScript e recursos
- **Detecção dinâmica**: Reconhece criação de pastas `tscripts` durante execução
- **Logs limpos**: Saída organizada em inglês, sem emojis
- **Tratamento de erros**: Continua funcionando mesmo com erros de compilação

## Fluxo de Trabalho

### Projeto TypeScript:
```
1. Edite: behavior_pack/tscripts/main.ts
2. Compilação: Automática para development/.../scripts/main.js
3. Sync: Exclui tscripts do workspace, preserva scripts no development
4. Teste: Diretamente no Minecraft
```

### Projeto JavaScript:
```
1. Edite: behavior_pack/scripts/main.js
2. Sync: Copia diretamente para development
3. Teste: Diretamente no Minecraft
```

## Vantagens

- **✅ Modular**: Cada projeto isolado com VS Code tasks próprias
- **✅ Automático**: Transpilação e sincronização sem intervenção
- **✅ Flexível**: Suporte para TypeScript e JavaScript
- **✅ Eficiente**: Dependências e libraries compartilhadas
- **✅ Estável**: Smart sync evita recriação constante de pastas
- **✅ Integrado**: Tasks do VS Code para fácil acesso
- **✅ Debugável**: Ferramentas de debug e informações detalhadas

## Funcionalidades Avançadas

### Build Único vs Monitoramento
- **Monitoramento**: Ideal para desenvolvimento ativo (auto-save)
- **Build único**: Ideal para testes pontuais ou CI/CD

### Debug e Troubleshooting
- Use a task "Debug Project Info" para diagnosticar problemas
- Verifica estrutura do projeto, arquivos TypeScript, e status do Minecraft

### Libraries Personalizadas
1. Crie uma pasta em `libraries/nome-da-lib/`
2. Adicione arquivos `.js` com exports
3. Use `import` em seus projetos para acessar as funções

## Notas Importantes

- **Pasta `tscripts`**: Localizada dentro de `behavior_pack/` (não na raiz do projeto)
- **Sem arquivos .map**: Source maps não são copiados para Minecraft
- **Auto-detecção**: Sistema detecta automaticamente se é projeto TS ou JS
- **Minecraft folder**: Detectado automaticamente (UWP e Beta)
- **Dependências**: Centralizadas em `eslint/node_modules` para eficiência

## Exemplo de Uso Completo

```bash
# 1. Configurar workspace
cd workspace/eslint && npm install

# 2. Criar projeto
mkdir projects/MeuProjeto
cd projects/MeuProjeto

# 3. Abrir no VS Code
code .

# 4. Usar Command Palette
# Ctrl+Shift+P → "Tasks: Run Task" → "Start Minecraft Project"

# 5. Criar código TypeScript
mkdir behavior_pack/tscripts
echo "import { world } from '@minecraft/server'; world.sendMessage('Hello!');" > behavior_pack/tscripts/main.ts

# 6. Ver compilação automática e teste no Minecraft!
