export interface ShopeeCategoryNode {
  category_id: number;
  parent_category_id?: number;
  category_name?: string;
  display_category_name?: string;
  original_category_name?: string;
  has_children?: boolean;
}

export interface ShopeeCategoryCandidate {
  id: number;
  name: string;
  path: string;
}

const STOPWORDS = new Set([
  'a',
  'as',
  'com',
  'da',
  'de',
  'do',
  'dos',
  'e',
  'em',
  'o',
  'os',
  'para',
  'por',
  'un',
  'uma',
  'unidade',
  'unidades',
]);

export function buildShopeeCategoryCandidates(
  categories: ShopeeCategoryNode[],
): ShopeeCategoryCandidate[] {
  const byId = new Map<number, ShopeeCategoryNode>();
  for (const category of categories) {
    const id = Number(category.category_id);
    if (Number.isFinite(id) && id > 0) byId.set(id, category);
  }

  const candidates: ShopeeCategoryCandidate[] = [];
  for (const category of byId.values()) {
    if (category.has_children) continue;
    const id = Number(category.category_id);
    const name = categoryName(category);
    if (!name) continue;
    candidates.push({ id, name, path: categoryPath(category, byId) });
  }

  return candidates.sort((a, b) => a.path.localeCompare(b.path, 'pt-BR'));
}

export function shortlistShopeeCategoryCandidates(
  candidates: ShopeeCategoryCandidate[],
  query: string,
  limit = 60,
): ShopeeCategoryCandidate[] {
  if (candidates.length <= limit) return candidates;

  const queryTokens = tokenize(query);
  const scored = candidates.map((candidate, index) => ({
    candidate,
    index,
    score: scoreCandidate(candidate, queryTokens),
  }));
  const positive = scored.filter((item) => item.score > 0);
  const source = positive.length ? positive : scored;

  return source
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((item) => item.candidate);
}

export function normalizeShopeeCategoryChoice(
  choice: unknown,
  candidates: ShopeeCategoryCandidate[],
): ShopeeCategoryCandidate | null {
  const id =
    typeof choice === 'object' && choice !== null && 'categoryId' in choice
      ? Number((choice as { categoryId?: unknown }).categoryId)
      : Number(choice);
  if (!Number.isFinite(id) || id <= 0) return null;
  return candidates.find((candidate) => candidate.id === id) ?? null;
}

function categoryName(category: ShopeeCategoryNode): string {
  return (
    category.display_category_name ||
    category.category_name ||
    category.original_category_name ||
    ''
  ).trim();
}

function categoryPath(category: ShopeeCategoryNode, byId: Map<number, ShopeeCategoryNode>): string {
  const names: string[] = [];
  let current: ShopeeCategoryNode | undefined = category;
  const seen = new Set<number>();

  while (current) {
    const id = Number(current.category_id);
    if (seen.has(id)) break;
    seen.add(id);
    const name = categoryName(current);
    if (name) names.unshift(name);
    const parentId: number = Number(current.parent_category_id);
    current = Number.isFinite(parentId) && parentId > 0 ? byId.get(parentId) : undefined;
  }

  return names.join(' > ');
}

function scoreCandidate(candidate: ShopeeCategoryCandidate, queryTokens: string[]): number {
  const candidateText = normalize(`${candidate.path} ${candidate.name}`);
  return queryTokens.reduce((score, token) => {
    if (candidateText === token) return score + 8;
    if (candidateText.includes(token)) return score + Math.min(6, token.length);
    return score;
  }, 0);
}

function tokenize(value: string): string[] {
  return normalize(value)
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
