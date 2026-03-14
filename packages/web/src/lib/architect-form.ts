// Re-export from core form module directly (not barrel) to avoid pulling in fs-dependent modules
export {
  ARCHITECT_FORM_DNA,
  generateFloorOutline,
  isInVoidCut,
  shouldHaveTerrace,
  getDominantFormDNA,
  getFloorFormDNA,
} from "../../../core/form/architect-form";

export type {
  ArchitectFormDNA,
  VoidCut,
} from "../../../core/form/architect-form";
