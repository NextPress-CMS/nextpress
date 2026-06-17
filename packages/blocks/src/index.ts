// ── Types ──
export type {
  BlockData,
  BlockDefinition,
  BlockRenderProps,
  BlockEditProps,
  BlockCategory,
  InferAttributes,
} from "./types";
export { createBlockData, generateBlockId, BLOCK_CATEGORIES } from "./types";

// ── Registry ──
export {
  registerBlock,
  unregisterBlock,
  getBlockDefinition,
  getAllBlockDefinitions,
  getBlocksByCategory,
  isBlockRegistered,
  overrideRenderComponent,
  migrateBlockAttributes,
  validateBlockAttributes,
} from "./registry";

// ── Renderer ──
export { BlockRenderer } from "./renderer";

// ── Core blocks (side-effect imports — register on import) ──
import "./blocks/paragraph";
import "./blocks/heading";
import "./blocks/image";
import "./blocks/quote";
import "./blocks/button";
import "./blocks/columns";
import "./blocks/html";
