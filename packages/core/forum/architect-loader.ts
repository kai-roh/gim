import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";
import type { ArchitectProfile } from "./types";

const DATA_DIR = path.resolve(__dirname, "../../../data");
const ARCHITECTS_DIR = path.join(DATA_DIR, "architects");
const TEMPLATE_PATH = path.join(DATA_DIR, "templates/architect_system.md");

/**
 * YAML 파일에서 건축가 프로필을 로드한다.
 */
export function loadArchitectProfile(id: string): ArchitectProfile {
  const filePath = path.join(ARCHITECTS_DIR, `${id}.yaml`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Architect profile not found: ${id}`);
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  return yaml.parse(raw) as ArchitectProfile;
}

/**
 * 사용 가능한 모든 건축가 프로필 ID 목록을 반환한다.
 */
export function listArchitectIds(): string[] {
  return fs
    .readdirSync(ARCHITECTS_DIR)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => f.replace(".yaml", ""));
}

/**
 * 모든 건축가 프로필을 로드한다.
 */
export function loadAllArchitects(): ArchitectProfile[] {
  return listArchitectIds().map(loadArchitectProfile);
}

/**
 * 건축가 프로필을 시스템 프롬프트 문자열로 변환한다.
 */
export function buildSystemPrompt(profile: ArchitectProfile): string {
  let template = fs.readFileSync(TEMPLATE_PATH, "utf-8");

  const categoryLabel =
    profile.category === "supertall_specialist"
      ? "초고층 실무 마스터 (Supertall Specialist)"
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
    "{{supertall_principles}}": profile.supertall_principles
      .map((p) => `- ${p}`)
      .join("\n"),
    "{{base_strategy}}": profile.vertical_preferences.base_strategy,
    "{{tower_form}}": profile.vertical_preferences.tower_form,
    "{{top_strategy}}": profile.vertical_preferences.top_strategy,
    "{{core_philosophy}}": profile.vertical_preferences.core_philosophy,
    "{{sky_lobby_preference}}": profile.vertical_preferences.sky_lobby_preference
      ? "선호"
      : "비선호",
    "{{mixed_use_transition}}": profile.vertical_preferences.mixed_use_transition,
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
  architectIds: string[]
): { id: string; systemPrompt: string; profile: ArchitectProfile }[] {
  return architectIds.map((id) => {
    const profile = loadArchitectProfile(id);
    const systemPrompt = buildSystemPrompt(profile);
    return { id, systemPrompt, profile };
  });
}
