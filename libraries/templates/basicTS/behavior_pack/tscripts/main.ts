import { world } from "@minecraft/server";
world.sendMessage('batata');

import { clamp } from '@workspace/maths';

const health = clamp(0, 0, 100);