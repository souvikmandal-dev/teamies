/** Runtime validation for untrusted Server Action arguments. */
export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
export const boundedText = (value: unknown, min: number, max: number): value is string =>
  typeof value === "string" && value.trim().length >= min && value.length <= max;
export const optionalText = (value: unknown, max: number) => value == null || boundedText(value, 0, max);
export const integerIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
export const optionalHours = (value: unknown) => value == null || integerIn(value, 0, 168);
export function validSkills(value: unknown) {
  if (value == null) return true;
  return Array.isArray(value) && value.length <= 30 &&
    value.every((tag) => boundedText(tag, 1, 60)) &&
    new Set(value.map((tag: string) => tag.trim().toLowerCase())).size === value.length;
}
export function validRoleInput(value: unknown) {
  return isRecord(value) && boundedText(value.title, 2, 80) && optionalText(value.description, 2000) &&
    validSkills(value.required_skills) && integerIn(value.positions, 1, 20) && optionalHours(value.weekly_commitment) &&
    (value.experience_level == null || (typeof value.experience_level === "string" && ["any", "beginner", "intermediate", "advanced"].includes(value.experience_level)));
}
export function validProjectInput(value: unknown) {
  return isRecord(value) && boundedText(value.name, 3, 100) && boundedText(value.short_description, 10, 240) &&
    optionalText(value.description, 10000) && boundedText(value.category, 2, 60) &&
    typeof value.stage === "string" && ["idea", "planning", "building", "mvp", "launched"].includes(value.stage) &&
    typeof value.collaboration_type === "string" && ["remote", "local", "hybrid"].includes(value.collaboration_type) &&
    optionalText(value.city, 100) && optionalText(value.duration, 100) &&
    optionalHours(value.weekly_commitment) && integerIn(value.max_team_size, 1, 50);
}
