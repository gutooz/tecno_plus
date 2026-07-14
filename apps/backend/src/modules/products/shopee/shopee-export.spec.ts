import ExcelJS from 'exceljs';
import { exportShopeeWorkbook } from './shopee-export';
import { REFERENCE_TEMPLATE_BR, SHOPEE_LIMITS } from './shopee-template';
import { mapProducts } from './shopee-mapper';
import { autofix } from './shopee-autofix';
import { validate } from './shopee-validator';
import type { SourceProduct } from './shopee-mapper';

const GENERATED_AT = new Date('2026-07-14T12:00:00.000Z');

function fullProduct(): SourceProduct {
  return {
    _id: 'p1',
    internalSku: 'ABC',
    status: 'ready',
    vision: { name: 'Copo', brand: 'Amigold', category: 'Utilidades Domésticas', quantity: 6 },
    content: {
      title: 'Jogo de Copo Imperial Clear 320ml 6 Unidades Vidro',
      marketplaceDescription: 'Conjunto de copos de vidro para o dia a dia.',
      category: 'Utilidades Domésticas',
    },
    pricing: { suggestedPrice: 29.9 },
    images: { shopee: ['https://img.example/1.jpg', 'https://img.example/2.jpg'] },
  };
}

describe('Shopee export — mapper/autofix/validator', () => {
  it('usa o template de referência quando não há arquivo oficial', () => {
    const mapped = mapProducts([fullProduct()], REFERENCE_TEMPLATE_BR);
    expect(mapped).toHaveLength(1);
    expect(mapped[0].rows).toHaveLength(1);
    const v = mapped[0].rows[0].values;
    expect(v.nome).toContain('Jogo de Copo Imperial');
    expect(v.preco).toBe(29.9);
    expect(v.estoque).toBe(6);
    expect(v.foto_capa).toBe('https://img.example/1.jpg');
    expect(v.foto_1).toBe('https://img.example/2.jpg');
    expect(v.sku_pai).toBe('ABC');
  });

  it('remove emoji, corta título longo, aplica estoque padrão e deduplica SKU', () => {
    const long = 'Faca 🔪 Kit ' + 'Premium '.repeat(40); // > 120 chars + emoji
    const products: SourceProduct[] = [
      fullProduct(),
      {
        _id: 'p2',
        internalSku: 'ABC', // duplicado de propósito
        vision: {},
        content: { title: long, category: 'Cozinha' },
        pricing: { suggestedPrice: 10 },
        images: { original: 'https://img.example/x.jpg' },
      },
    ];
    const mapped = mapProducts(products, REFERENCE_TEMPLATE_BR);
    const corrections = autofix(mapped, REFERENCE_TEMPLATE_BR);

    const p2 = mapped[1].rows[0].values;
    expect(String(p2.nome)).not.toMatch(/🔪/u);
    expect(String(p2.nome).length).toBeLessThanOrEqual(SHOPEE_LIMITS.titleMax);
    expect(p2.estoque).toBe(SHOPEE_LIMITS.defaultStock); // não havia quantidade
    expect(p2.sku).toBe('ABC-2'); // deduplicado

    const reasons = corrections.map((c) => c.column);
    expect(reasons).toContain('nome');
    expect(reasons).toContain('estoque');
    expect(reasons).toContain('sku');
  });

  it('sinaliza peso ausente como erro (nunca inventa) → produto rejeitado', () => {
    const mapped = mapProducts([fullProduct()], REFERENCE_TEMPLATE_BR);
    autofix(mapped, REFERENCE_TEMPLATE_BR);
    const issues = validate(mapped, REFERENCE_TEMPLATE_BR);
    const peso = issues.find((i) => i.code === 'peso_ausente');
    expect(peso).toBeDefined();
    expect(peso?.level).toBe('error');
  });

  it('expande variações em uma linha por opção, com o mesmo nº de integração', () => {
    const withVars: SourceProduct = {
      ...fullProduct(),
      _id: 'p3',
      internalSku: 'VAR1',
      variations: [
        {
          name1: 'Cor',
          option1: 'Preto',
          price: 20,
          stock: 5,
          image: 'https://img.example/preto.jpg',
        },
        { name1: 'Cor', option1: 'Branco', price: 20, stock: 0 },
      ],
    };
    const mapped = mapProducts([withVars], REFERENCE_TEMPLATE_BR);
    expect(mapped[0].rows).toHaveLength(2);
    const [r1, r2] = mapped[0].rows;
    expect(r1.values.var_integracao).toBe(r2.values.var_integracao);
    expect(r1.values.var_opcao1).toBe('Preto');
    expect(r2.values.estoque).toBe(0); // indisponível
    expect(r1.values.sku).not.toBe(r2.values.sku);
  });
});

describe('Shopee export — workbook', () => {
  it('gera um .xlsx com cabeçalho exato, dados na linha 5 e abas de relatório', async () => {
    const { buffer, report } = await exportShopeeWorkbook([fullProduct()], {
      generatedAt: GENERATED_AT,
    });
    expect(buffer.length).toBeGreaterThan(0);
    expect(report.templateSource).toBe('reference');
    expect(report.totalProducts).toBe(1);
    expect(report.totalRows).toBe(1);
    expect(report.rejected).toBe(1); // peso ausente

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);

    const sheet = wb.getWorksheet(REFERENCE_TEMPLATE_BR.sheetName);
    expect(sheet).toBeDefined();
    // Linha 1 = cabeçalhos exatos; dados começam na linha 5.
    expect(sheet!.getRow(1).getCell(1).value).toBe('Categoria');
    expect(sheet!.getRow(1).getCell(2).value).toBe('Nome do produto');
    expect(sheet!.getRow(2).getCell(1).value).toBe('Obrigatório');
    expect(String(sheet!.getRow(5).getCell(2).value)).toContain('Jogo de Copo Imperial');

    // Abas de relatório presentes.
    for (const name of ['Validação', 'Corrigidos', 'Rejeitados', 'Leia-me']) {
      expect(wb.getWorksheet(name)).toBeDefined();
    }
  });
});
