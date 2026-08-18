import {
  buildShopeeCategoryCandidates,
  normalizeShopeeCategoryChoice,
  shortlistShopeeCategoryCandidates,
  ShopeeCategoryNode,
} from './shopee-category-inference';

const CATEGORY_TREE: ShopeeCategoryNode[] = [
  { category_id: 1, parent_category_id: 0, category_name: 'Papelaria', has_children: true },
  {
    category_id: 2,
    parent_category_id: 1,
    category_name: 'Canetas e Marcadores',
    has_children: true,
  },
  {
    category_id: 120039,
    parent_category_id: 2,
    category_name: 'Marcadores e Hidrocores',
    has_children: false,
  },
  {
    category_id: 88001,
    parent_category_id: 1,
    category_name: 'Cadernos',
    has_children: false,
  },
  {
    category_id: 9,
    parent_category_id: 0,
    category_name: 'Beleza e Cuidados Pessoais',
    has_children: true,
  },
  {
    category_id: 10,
    parent_category_id: 9,
    category_name: 'Cuidados com a Pele',
    has_children: true,
  },
  { category_id: 99001, parent_category_id: 10, category_name: 'Esfoliantes', has_children: false },
];

describe('Shopee category inference helpers', () => {
  it('monta candidatos folha com o caminho completo da arvore oficial', () => {
    const candidates = buildShopeeCategoryCandidates(CATEGORY_TREE);

    expect(candidates).toContainEqual({
      id: 120039,
      name: 'Marcadores e Hidrocores',
      path: 'Papelaria > Canetas e Marcadores > Marcadores e Hidrocores',
    });
    expect(candidates.find((candidate) => candidate.id === 1)).toBeUndefined();
  });

  it('prioriza candidatos que combinam com o titulo e a categoria textual', () => {
    const candidates = buildShopeeCategoryCandidates(CATEGORY_TREE);

    const shortlist = shortlistShopeeCategoryCandidates(
      candidates,
      'Kit Canetas Marcadoras Ponta Dupla 24 Cores Papelaria',
      2,
    );

    expect(shortlist[0].id).toBe(120039);
    expect(shortlist.map((candidate) => candidate.id)).not.toContain(99001);
  });

  it('aceita somente um ID devolvido pela IA que exista nos candidatos oficiais', () => {
    const candidates = buildShopeeCategoryCandidates(CATEGORY_TREE);

    expect(normalizeShopeeCategoryChoice({ categoryId: '99001' }, candidates)?.name).toBe(
      'Esfoliantes',
    );
    expect(normalizeShopeeCategoryChoice({ categoryId: '123' }, candidates)).toBeNull();
  });
});
