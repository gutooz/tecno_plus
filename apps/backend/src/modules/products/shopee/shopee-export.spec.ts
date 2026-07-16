import ExcelJS from 'exceljs';
import { encodeReportHeader, exportShopeeWorkbook } from './shopee-export';
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

/** Igual ao anterior, mas com peso — único campo obrigatório que a IA não extrai. */
function weighedProduct(): SourceProduct {
  const p = fullProduct();
  (p.vision as Record<string, unknown>).weight = 1.2;
  return p;
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
    // não havia quantidade — gera dentro da faixa padrão de dropshipping
    expect(p2.estoque).toBeGreaterThanOrEqual(SHOPEE_LIMITS.defaultStockMin);
    expect(p2.estoque).toBeLessThanOrEqual(SHOPEE_LIMITS.defaultStockMax);
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

const REPORT_SHEETS = ['Validação', 'Corrigidos', 'Rejeitados', 'Leia-me'];

async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
  return wb;
}

describe('Shopee export — categoria', () => {
  // A coluna espera o ID da Árvore de Categorias (o exemplo oficial traz 120039).
  // Texto ali faz o importador recusar o arquivo; vazio a Shopee recomenda sozinha.
  /** fullProduct() com a categoria trocada — `content` é opcional no tipo. */
  function comCategoria(category: string): SourceProduct {
    const p = fullProduct();
    return { ...p, content: { ...(p.content ?? {}), category } };
  }

  it('não manda a categoria de texto da IA para a planilha', () => {
    const mapped = mapProducts(
      [comCategoria('Beleza e Cuidados Pessoais > Maquiagem > Bases')],
      REFERENCE_TEMPLATE_BR,
    );
    expect(mapped[0].rows[0].values.categoria).toBe('');
  });

  it('preserva a categoria quando já é um ID numérico da Shopee', () => {
    const mapped = mapProducts([comCategoria('120039')], REFERENCE_TEMPLATE_BR);
    expect(mapped[0].rows[0].values.categoria).toBe('120039');
  });
});

describe('Shopee export — canal de envio', () => {
  // Sem canal a Shopee recusa: "Produto não pode ser salvo sem um canal de envio
  // habilitado". E o dropdown do arquivo oficial só aceita "Ligado"/"Desativado" —
  // 'Ativar'/'Off' (o que havia antes) eram recusados pela validação.
  it('habilita o Xpress CPF por padrão, com a grafia que o dropdown aceita', () => {
    const mapped = mapProducts([fullProduct()], REFERENCE_TEMPLATE_BR);
    expect(mapped[0].rows[0].values.canal_xpress_cpf).toBe('Ligado');
  });

  it('respeita a desativação explícita', () => {
    const p = { ...fullProduct(), logistics: { canalXpressCpf: false } };
    const mapped = mapProducts([p], REFERENCE_TEMPLATE_BR);
    expect(mapped[0].rows[0].values.canal_xpress_cpf).toBe('Desativado');
  });

  // "Please do not edit this column" no arquivo oficial.
  it('não escreve na coluna Retirada pelo Comprador', () => {
    const mapped = mapProducts([fullProduct()], REFERENCE_TEMPLATE_BR);
    expect(mapped[0].rows[0].values.canal_retirada_comprador).toBe('');
  });
});

describe('Shopee export — workbook', () => {
  it('gera um .xlsx com cabeçalho exato e o produto válido na linha 5', async () => {
    const { buffer, report } = await exportShopeeWorkbook([weighedProduct()], {
      generatedAt: GENERATED_AT,
    });
    expect(buffer.length).toBeGreaterThan(0);
    expect(report.templateSource).toBe('reference');
    expect(report.rejected).toBe(0);
    expect(report.exportedRows).toBe(1);

    const wb = await loadWorkbook(buffer);
    const sheet = wb.getWorksheet(REFERENCE_TEMPLATE_BR.sheetName);
    expect(sheet).toBeDefined();
    // Linha 1 = cabeçalhos exatos (iguais aos do arquivo oficial); dados começam na linha 5.
    expect(sheet!.getRow(1).getCell(1).value).toBe('Categoria');
    expect(sheet!.getRow(1).getCell(2).value).toBe('Nome do Produto');
    // Categoria é "Opcional" no arquivo oficial atual (Nome é que é obrigatório).
    expect(sheet!.getRow(2).getCell(1).value).toBe('Opcional');
    expect(sheet!.getRow(2).getCell(2).value).toBe('Obrigatório');
    expect(String(sheet!.getRow(5).getCell(2).value)).toContain('Jogo de Copo Imperial');
  });

  it('o arquivo de upload não leva abas de relatório (o importador recusaria)', async () => {
    const { buffer } = await exportShopeeWorkbook([weighedProduct()], {
      generatedAt: GENERATED_AT,
    });
    const wb = await loadWorkbook(buffer);
    expect(wb.worksheets).toHaveLength(1);
    for (const name of REPORT_SHEETS) expect(wb.getWorksheet(name)).toBeUndefined();
  });

  it('inclui as abas de conferência quando pedidas explicitamente', async () => {
    const { buffer } = await exportShopeeWorkbook([weighedProduct()], {
      generatedAt: GENERATED_AT,
      includeReportSheets: true,
    });
    const wb = await loadWorkbook(buffer);
    for (const name of REPORT_SHEETS) expect(wb.getWorksheet(name)).toBeDefined();
  });

  it('serializa o relatório para o header sem caractere que o HTTP recuse', async () => {
    // Sem template oficial o report carrega o aviso acentuado ("referência BR —"),
    // e o JSON cru fazia res.setHeader() lançar ERR_INVALID_CHAR → 500 no export.
    const { report } = await exportShopeeWorkbook([fullProduct()], {
      generatedAt: GENERATED_AT,
    });
    expect(report.warning).toMatch(/referência/);

    const header = encodeReportHeader(report);
    // Latin-1/ASCII imprimível apenas — é o que o setHeader do Node aceita.
    expect(header).toMatch(/^[\x20-\x7e]*$/);
    expect(() => Buffer.from(header, 'ascii')).not.toThrow();
    // E continua JSON válido: o consumidor recupera o texto original.
    expect(JSON.parse(header)).toEqual(report);
  });

  it('produto rejeitado nunca é escrito na aba de dados', async () => {
    // fullProduct() não tem peso → erro fatal → a Shopee recusaria a linha.
    const { buffer, report } = await exportShopeeWorkbook([fullProduct()], {
      generatedAt: GENERATED_AT,
    });
    expect(report.rejected).toBe(1);
    expect(report.exportedProducts).toBe(0);
    expect(report.exportedRows).toBe(0);

    const wb = await loadWorkbook(buffer);
    const sheet = wb.getWorksheet(REFERENCE_TEMPLATE_BR.sheetName);
    // Linha 5 é a 1ª de dados: tem que estar vazia, não pintada de vermelho.
    expect(sheet!.getRow(5).getCell(2).value).toBeFalsy();
  });
});
