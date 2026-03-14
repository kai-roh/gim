import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";
import type { ArchitectProfile } from "./types";

const DEFAULT_DATA_DIR = path.resolve(__dirname, "../../../data");

function resolveDataDir(dataDir?: string): string {
  return dataDir ?? DEFAULT_DATA_DIR;
}

/**
 * YAML 파일에서 건축가 프로필을 로드한다.
 */
export function loadArchitectProfile(id: string, dataDir?: string): ArchitectProfile {
  const dir = resolveDataDir(dataDir);
  const filePath = path.join(dir, "architects", `${id}.yaml`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Architect profile not found: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  return yaml.parse(raw) as ArchitectProfile;
}

/**
 * 사용 가능한 모든 건축가 프로필 ID 목록을 반환한다.
 */
export function listArchitectIds(dataDir?: string): string[] {
  const dir = resolveDataDir(dataDir);
  return fs
    .readdirSync(path.join(dir, "architects"))
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => f.replace(".yaml", ""));
}

/**
 * 모든 건축가 프로필을 로드한다.
 */
export function loadAllArchitects(dataDir?: string): ArchitectProfile[] {
  return listArchitectIds(dataDir).map((id) => loadArchitectProfile(id, dataDir));
}

/**
 * 건축가 프로필을 시스템 프롬프트 문자열로 변환한다.
 */
export function buildSystemPrompt(profile: ArchitectProfile, dataDir?: string): string {
  const dir = resolveDataDir(dataDir);
  const templatePath = path.join(dir, "templates/architect_system.md");
  let template = fs.readFileSync(templatePath, "utf-8");

  const categoryLabel =
    profile.category === "design_practice_master"
      ? "실무 마스터 (Design Practice Master)"
      : "건축 사상 마스터 (Architectural Visionary)";

  const replacements: Record<string, string> = {
    "{{id}}": profile.id,
    "{{reference}}": profile.reference,
    "{{category_label}}": categoryLabel,
    "{{era_context}}": profile.knowledge_base.era_context.trim(),
    "{{design_philosophy}}": profile.knowledge_base.design_philosophy.trim(),
    "{{representative_buildings}}": profile.knowledge_base.representative_buildings
      .map((b) => `- ${b}`)
      .join("\n"),
    "{{design_principles}}": profile.design_principles
      .map((p) => `- ${p}`)
      .join("\n"),
    "{{ground_strategy}}": profile.spatial_preferences.ground_strategy,
    "{{form_language}}": profile.spatial_preferences.form_language,
    "{{facade_approach}}": profile.spatial_preferences.facade_approach,
    "{{interior_philosophy}}": profile.spatial_preferences.interior_philosophy,
    "{{material_expression}}": profile.spatial_preferences.material_expression,
    "{{light_strategy}}": profile.spatial_preferences.light_strategy,
    "{{structure_expression}}": profile.expression_rules.structure_expression,
    "{{facade_language}}": profile.expression_rules.facade_language,
    "{{material_palette}}": profile.expression_rules.material_palette.join(", "),
    "{{sustainability_approach}}": profile.expression_rules.sustainability_approach,
    "{{assertiveness}}": profile.discussion_style.assertiveness.toString(),
    "{{compromise_willingness}}":
      profile.discussion_style.compromise_willingness.toString(),
    "{{focus_priority}}": profile.discussion_style.focus_priority.join(" → "),
  };

  for (const [placeholder, value] of Object.entries(replacements)) {
    template = template.replaceAll(placeholder, value);
  }

  return template;
}

/**
 * 선택된 건축가 패널의 시스템 프롬프트를 일괄 생성한다.
 */
export function buildPanel(
  architectIds: string[],
  dataDir?: string
): { id: string; systemPrompt: string; profile: ArchitectProfile }[] {
  return architectIds.map((id) => {
    const profile = loadArchitectProfile(id, dataDir);
    const systemPrompt = buildSystemPrompt(profile, dataDir);
    return { id, systemPrompt, profile };
  });
}
