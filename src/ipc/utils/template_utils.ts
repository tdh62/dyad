import { type Template, localTemplatesData } from "../../shared/templates";

/**
 * 内网 / 离线版本：不再访问 `https://api.dyad.sh/v1/templates`，
 * 模板列表只使用 app 内置的 localTemplatesData。
 */
export async function fetchApiTemplates(): Promise<Template[]> {
  return [];
}

// Get all templates (local + API)
export async function getAllTemplates(): Promise<Template[]> {
  const apiTemplates = await fetchApiTemplates();
  return [...localTemplatesData, ...apiTemplates];
}

export async function getTemplateOrThrow(
  templateId: string,
): Promise<Template> {
  const allTemplates = await getAllTemplates();
  const template = allTemplates.find((template) => template.id === templateId);
  if (!template) {
    throw new Error(
      `Template ${templateId} not found. Please select a different template.`,
    );
  }
  return template;
}
