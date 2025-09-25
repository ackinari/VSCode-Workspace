import { world } from "@minecraft/server";

// Teste dos diferentes tipos de import
import { clamp, lerp } from 'libraries/maths';           // Usando index.js
import { map } from 'libraries/maths/clamp';             // Direto do arquivo
import { clamp as clamp2 } from '@workspace/maths';      // Usando @workspace

// Testando as funções das libraries
const health = clamp(50, 0, 100);
const smooth = lerp(0, 100, 0.5);
const mapped = map(50, 0, 100, 0, 1);
const health2 = clamp2(75, 0, 100);

world.sendMessage(`Libraries test - Health: ${health}, Smooth: ${smooth}, Mapped: ${mapped}, Health2: ${health2}`);

console.log("Test script loaded with libraries!");
